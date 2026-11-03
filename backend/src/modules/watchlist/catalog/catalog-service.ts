import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { CatalogCollection, CatalogDetails, CatalogGenre, CatalogLanguage, CatalogOffers, CatalogProvider, CatalogTitle, MediaType, TmdbProvider } from 'src/modules/watchlist/catalog/catalog-models';
import { CATALOG_NOT_CONFIGURED, CATALOG_REFUSED, TMDB_LANGUAGES, TmdbCollectionSchema, TmdbGenreListSchema, TmdbMovieSchema, TmdbProvidersPayloadSchema, TmdbSearchPayloadSchema, TmdbSearchResultSchema, TmdbShowSchema, WATCH_REGION } from 'src/modules/watchlist/catalog/catalog-models';
import type { Variables } from 'src/plugins/environment';
import { ExpiringCache } from 'src/shared/expiring-cache';
import { RequestError } from 'src/shared/models';
import type { z } from 'zod';

/**
 * @constant CATALOG_TIMEOUT
 * @description How long to wait on the catalog before calling it unavailable.
 */
const CATALOG_TIMEOUT = 8 * 1000;

/**
 * @constant SEARCH_RESULTS
 * @description How many films and series a search shows at most.
 */
const SEARCH_RESULTS = 20;

/**
 * @constant searches
 * @description Recent searches, so typing back to an earlier query doesn't ask again.
 */
const searches = new ExpiringCache<CatalogTitle[]>(10 * 60 * 1000, 200);

/**
 * @constant details
 * @description Recent details of titles. Offers change over days, not minutes.
 */
const details = new ExpiringCache<CatalogDetails>(6 * 60 * 60 * 1000);

/**
 * @constant collections
 * @description Recent sagas.
 */
const collections = new ExpiringCache<CatalogCollection>(24 * 60 * 60 * 1000);

/**
 * @constant genres
 * @description Every genre, by language.
 */
const genres = new ExpiringCache<CatalogGenre[]>(24 * 60 * 60 * 1000, 10);

/**
 * @function forgetCatalog
 * @description Forgets every answer kept from the catalog, so each test starts from nothing.
 */
export function forgetCatalog(): void {
    searches.clear();
    details.clear();
    collections.clear();
    genres.clear();
}

/**
 * @function ask
 * @description Asks the catalog (TMDB) one question and checks its answer.
 *
 * @param {Variables} variables The environment, holding the catalog's address and token.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} path The endpoint, from the catalog's address.
 * @param {Record<string, string>} query Its parameters.
 * @param {T} schema What the answer must look like.
 *
 * @returns {Promise<z.infer<T>>} The answer. Rejects with 404 for an unknown title and 503 when the catalog can't help,
 * saying why in `data.reason` when the token is missing or refused, since only the owner can fix that.
 */
async function ask<T extends z.ZodType>(variables: Variables, logger: FastifyBaseLogger, path: string, query: Record<string, string>, schema: T): Promise<z.infer<T>> {
    if (variables.WATCHLIST_TMDB_TOKEN === '') {
        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'The catalog is not configured', { reason: CATALOG_NOT_CONFIGURED });
    }

    let response: Response;

    try {
        response = await fetch(`${variables.WATCHLIST_TMDB_URL}${path}?${new URLSearchParams(query).toString()}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${variables.WATCHLIST_TMDB_TOKEN}` },
            signal: AbortSignal.timeout(CATALOG_TIMEOUT)
        });
    } catch (error: unknown) {
        logger.error({ error, path }, 'Catalog unreachable');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'The catalog is unavailable');
    }

    if (response.status === Number(StatusCodes.NOT_FOUND)) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown title');
    }

    if (response.status === Number(StatusCodes.UNAUTHORIZED)) {
        logger.error({ path }, 'Catalog refused the token: check WATCHLIST_TMDB_TOKEN');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'The catalog refused the token', { reason: CATALOG_REFUSED });
    }

    if (!response.ok) {
        logger.error({ status: response.status, path }, 'Catalog refused the request');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'The catalog is unavailable');
    }

    const parsed = schema.safeParse(await response.json().catch(() => null));

    if (!parsed.success) {
        logger.error({ issues: parsed.error.issues, path }, 'Catalog answered in an unexpected shape');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'The catalog is unavailable');
    }

    return parsed.data;
}

/**
 * @function toProviders
 * @description Lists the services of one kind of offer, the ones the catalog ranks first leading.
 *
 * @param {TmdbProvider[]} providers The services, as the catalog describes them.
 *
 * @returns {CatalogProvider[]} The services, as the portal shows them.
 */
function toProviders(providers: TmdbProvider[]): CatalogProvider[] {
    return [...providers]
        .sort((first, second) => first.display_priority - second.display_priority)
        .map((provider) => ({ id: provider.provider_id, name: provider.provider_name, logoPath: provider.logo_path ?? null }));
}

/**
 * @function offersIn
 * @description Where a title can be watched in the watch region: with a subscription, for free (with or without ads),
 * to rent, or to buy.
 *
 * @param {z.infer<typeof TmdbProvidersPayloadSchema>} payload Every country's offers.
 *
 * @returns {CatalogOffers} The watch region's offers, empty when there are none.
 */
function offersIn(payload: z.infer<typeof TmdbProvidersPayloadSchema>): CatalogOffers {
    const region = payload.results[WATCH_REGION];

    if (region === undefined) {
        return { link: null, subscription: [], free: [], rent: [], buy: [] };
    }

    return {
        link: region.link ?? null,
        subscription: toProviders(region.flatrate),
        free: toProviders([...region.free, ...region.ads]),
        rent: toProviders(region.rent),
        buy: toProviders(region.buy)
    };
}

/**
 * @function byRelease
 * @description Orders titles by the day they came out, the ones without a date last.
 *
 * @param {CatalogTitle} first A title.
 * @param {CatalogTitle} second Another.
 *
 * @returns {number} Their order.
 */
function byRelease(first: CatalogTitle, second: CatalogTitle): number {
    if (first.releaseDate === second.releaseDate) {
        return 0;
    }

    if (first.releaseDate === null) {
        return 1;
    }

    if (second.releaseDate === null) {
        return -1;
    }

    return first.releaseDate < second.releaseDate ? -1 : 1;
}

/**
 * @function searchCatalog
 * @description Finds the films and series matching a query, most relevant first.
 *
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} query What to look for.
 * @param {CatalogLanguage} language The language to write in.
 *
 * @returns {Promise<CatalogTitle[]>} The titles found.
 */
export async function searchCatalog(variables: Variables, logger: FastifyBaseLogger, query: string, language: CatalogLanguage): Promise<CatalogTitle[]> {
    const key = `${language}:${query.toLocaleLowerCase()}`;
    const cached = searches.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const payload = await ask(variables, logger, '/search/multi', { query, language: TMDB_LANGUAGES[language], include_adult: 'false', page: '1' }, TmdbSearchPayloadSchema);
    const found: CatalogTitle[] = [];

    for (const candidate of payload.results) {
        const result = TmdbSearchResultSchema.safeParse(candidate);

        if (!result.success) {
            continue;
        }

        const title = result.data;

        found.push(title.media_type === 'movie' ? {
            tmdbId: title.id,
            mediaType: 'movie',
            title: title.title,
            originalTitle: title.original_title,
            releaseDate: title.release_date,
            posterPath: title.poster_path ?? null,
            overview: title.overview
        } : {
            tmdbId: title.id,
            mediaType: 'tv',
            title: title.name,
            originalTitle: title.original_name,
            releaseDate: title.first_air_date,
            posterPath: title.poster_path ?? null,
            overview: title.overview
        });
    }

    const titles = found.slice(0, SEARCH_RESULTS);

    searches.set(key, titles);

    return titles;
}

/**
 * @function titleDetails
 * @description Everything the portal shows about a film or a series: what it is, its genres, its saga, and where to
 * watch it in the watch region.
 *
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {MediaType} mediaType Whether it is a film or a series.
 * @param {number} tmdbId Its identifier in the catalog.
 * @param {CatalogLanguage} language The language to write in.
 *
 * @returns {Promise<CatalogDetails>} Its details. Rejects with 404 when the catalog doesn't know it.
 */
export async function titleDetails(variables: Variables, logger: FastifyBaseLogger, mediaType: MediaType, tmdbId: number, language: CatalogLanguage): Promise<CatalogDetails> {
    const key = `${language}:${mediaType}:${tmdbId}`;
    const cached = details.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const query = { language: TMDB_LANGUAGES[language] };
    const offers = (): Promise<CatalogOffers> => ask(variables, logger, `/${mediaType}/${tmdbId}/watch/providers`, {}, TmdbProvidersPayloadSchema).then(offersIn);
    let found: CatalogDetails;

    if (mediaType === 'movie') {
        const [movie, movieOffers] = await Promise.all([ask(variables, logger, `/movie/${tmdbId}`, query, TmdbMovieSchema), offers()]);

        found = {
            tmdbId: movie.id,
            mediaType,
            title: movie.title,
            originalTitle: movie.original_title,
            releaseDate: movie.release_date,
            posterPath: movie.poster_path ?? null,
            overview: movie.overview,
            genres: movie.genres,
            runtime: movie.runtime ?? null,
            seasons: null,
            collection: movie.belongs_to_collection ?? null,
            offers: movieOffers
        };
    } else {
        const [show, showOffers] = await Promise.all([ask(variables, logger, `/tv/${tmdbId}`, query, TmdbShowSchema), offers()]);

        found = {
            tmdbId: show.id,
            mediaType,
            title: show.name,
            originalTitle: show.original_name,
            releaseDate: show.first_air_date,
            posterPath: show.poster_path ?? null,
            overview: show.overview,
            genres: show.genres,
            runtime: null,
            seasons: show.number_of_seasons ?? null,
            collection: null,
            offers: showOffers
        };
    }

    details.set(key, found);

    return found;
}

/**
 * @function collectionDetails
 * @description A saga and its films, in the order they came out.
 *
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {number} collectionId The saga's identifier in the catalog.
 * @param {CatalogLanguage} language The language to write in.
 *
 * @returns {Promise<CatalogCollection>} The saga. Rejects with 404 when the catalog doesn't know it.
 */
export async function collectionDetails(variables: Variables, logger: FastifyBaseLogger, collectionId: number, language: CatalogLanguage): Promise<CatalogCollection> {
    const key = `${language}:${collectionId}`;
    const cached = collections.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const collection = await ask(variables, logger, `/collection/${collectionId}`, { language: TMDB_LANGUAGES[language] }, TmdbCollectionSchema);
    const found: CatalogCollection = {
        id: collection.id,
        name: collection.name,
        parts: collection.parts
            .map((part): CatalogTitle => ({
                tmdbId: part.id,
                mediaType: 'movie',
                title: part.title,
                originalTitle: part.original_title,
                releaseDate: part.release_date,
                posterPath: part.poster_path ?? null,
                overview: part.overview
            }))
            .sort(byRelease)
    };

    collections.set(key, found);

    return found;
}

/**
 * @function genreList
 * @description Every genre of films and of series, named in one language. Both lists share the identifiers of the
 * genres they have in common.
 *
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {CatalogLanguage} language The language to name them in.
 *
 * @returns {Promise<CatalogGenre[]>} The genres, by name.
 */
export async function genreList(variables: Variables, logger: FastifyBaseLogger, language: CatalogLanguage): Promise<CatalogGenre[]> {
    const cached = genres.get(language);

    if (cached !== undefined) {
        return cached;
    }

    const query = { language: TMDB_LANGUAGES[language] };
    const [movies, shows] = await Promise.all([
        ask(variables, logger, '/genre/movie/list', query, TmdbGenreListSchema),
        ask(variables, logger, '/genre/tv/list', query, TmdbGenreListSchema)
    ]);
    const byId = new Map<number, CatalogGenre>();

    for (const genre of [...movies.genres, ...shows.genres]) {
        if (!byId.has(genre.id)) {
            byId.set(genre.id, genre);
        }
    }

    const found = [...byId.values()].sort((first, second) => first.name.localeCompare(second.name, language));

    genres.set(language, found);

    return found;
}
