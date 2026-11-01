import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient, WatchlistEntry } from 'prisma/generated/prisma/client';
import { titleDetails } from 'src/modules/watchlist/catalog/catalog-service';
import type { Entry, EntryCreate, EntryUpdate, Progress } from 'src/modules/watchlist/entries/entries-models';
import type { Variables } from 'src/plugins/environment';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';

/**
 * @function toEntry
 * @description Maps a stored row onto the title the client receives.
 *
 * @param {WatchlistEntry} row The stored row.
 *
 * @returns {Entry} The title.
 */
function toEntry(row: WatchlistEntry): Entry {
    return {
        id: row.id,
        tmdbId: row.tmdbId,
        mediaType: row.mediaType,
        title: { en: row.titleEn, fr: row.titleFr },
        originalTitle: row.originalTitle,
        releaseDate: row.releaseDate,
        posterPath: row.posterPath,
        genreIds: row.genreIds,
        collectionId: row.collectionId,
        collectionName: row.collectionNameEn === null || row.collectionNameFr === null ? null : { en: row.collectionNameEn, fr: row.collectionNameFr },
        runtime: row.runtime,
        seasons: row.seasons,
        episodeCounts: row.episodeCounts,
        addedAt: row.addedAt,
        startedAt: row.startedAt,
        progress: row.season === null || row.episode === null ? null : { season: row.season, episode: row.episode },
        watchedAt: row.watchedAt,
        rating: row.rating,
        comment: row.comment
    };
}

/**
 * @function listEntries
 * @description Every title on the watchlist, the latest added first.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<Entry[]>} The titles.
 */
export async function listEntries(prisma: PrismaClient): Promise<Entry[]> {
    const rows = await prisma.watchlistEntry.findMany({ orderBy: { addedAt: 'desc' } });

    return rows.map(toEntry);
}

/**
 * @function addEntry
 * @description Puts a film or a series on the watchlist, to watch. What it is (its title, genres, saga) comes from the
 * catalog, not from the client, read in both of the portal's languages so the watchlist reads right in either.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {EntryCreate} create The title to add.
 *
 * @returns {Promise<Entry>} The title, as stored. Rejects with 409 when it is already on the watchlist.
 */
export async function addEntry(prisma: PrismaClient, variables: Variables, logger: FastifyBaseLogger, create: EntryCreate): Promise<Entry> {
    const existing = await prisma.watchlistEntry.findUnique({ where: { mediaType_tmdbId: { mediaType: create.mediaType, tmdbId: create.tmdbId } } });

    if (existing !== null) {
        throw new RequestError(StatusCodes.CONFLICT, 'This title is already on the watchlist');
    }

    const [english, french] = await Promise.all([
        titleDetails(variables, logger, create.mediaType, create.tmdbId, 'en'),
        titleDetails(variables, logger, create.mediaType, create.tmdbId, 'fr')
    ]);
    const row = await prisma.watchlistEntry.create({
        data: {
            tmdbId: french.tmdbId,
            mediaType: french.mediaType,
            titleEn: english.title,
            titleFr: french.title,
            originalTitle: french.originalTitle,
            releaseDate: french.releaseDate,
            posterPath: french.posterPath,
            genreIds: french.genres.map((genre) => genre.id),
            collectionId: french.collection?.id ?? null,
            collectionNameEn: english.collection?.name ?? null,
            collectionNameFr: french.collection?.name ?? null,
            runtime: french.runtime,
            seasons: french.seasons,
            episodeCounts: french.episodeCounts
        }
    });

    return toEntry(row);
}

/**
 * @interface CatalogAccess
 * @description What it takes to ask the catalog during a change.
 */
export interface CatalogAccess {
    variables: Variables; /*!< The environment */
    logger: FastifyBaseLogger; /*!< The request logger */
}

/**
 * @function episodeCountsFor
 * @description How many episodes each season of a series has, read again from the catalog when a series is started, so
 * the progress follows the seasons that came out since it was added. Without the catalog, or when it fails, the counts
 * stored stay.
 *
 * @param {WatchlistEntry} row The stored title.
 * @param {boolean} isStarting Whether the change starts it.
 * @param {Perhaps<CatalogAccess>} catalog How to ask the catalog, if it may be asked.
 *
 * @returns {Promise<number[]>} The episodes of each season.
 */
async function episodeCountsFor(row: WatchlistEntry, isStarting: boolean, catalog?: CatalogAccess): Promise<number[]> {
    if (row.mediaType !== 'tv' || !isStarting || catalog === undefined) {
        return row.episodeCounts;
    }

    try {
        const details = await titleDetails(catalog.variables, catalog.logger, 'tv', row.tmdbId, 'fr');

        return details.episodeCounts;
    } catch (error: unknown) {
        catalog.logger.warn({ err: error }, 'Could not read the seasons of a series being started');

        return row.episodeCounts;
    }
}

/**
 * @function checkProgress
 * @description Refuses a progress that doesn't fit the title: a film, or an episode past what the catalog knows of the
 * series. A series of unknown seasons takes any progress.
 *
 * @param {WatchlistEntry} row The stored title.
 * @param {Maybe<Progress>} progress The progress asked for.
 * @param {number[]} episodeCounts The episodes of each season.
 *
 * @returns {void} Returns when the progress fits. Throws a 400 otherwise.
 */
function checkProgress(row: WatchlistEntry, progress: Maybe<Progress>, episodeCounts: number[]): void {
    if (progress === null) {
        return;
    }

    if (row.mediaType !== 'tv') {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Only a series has episodes');
    }

    if (episodeCounts.length === 0) {
        return;
    }

    const episodes = episodeCounts.at(progress.season - 1);

    if (episodes === undefined || (episodes > 0 && progress.episode > episodes)) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'This episode is not in the series');
    }
}

/**
 * @function updateEntry
 * @description Moves a title between its three states and says what was thought of it. A title is to watch while it is
 * neither started nor watched, being watched once started, and watched once marked so. Only a title being watched has a
 * progress, and only a series. Only a watched title can be rated and commented on; going back to being watched keeps
 * its rating and its comment, going back to watch forgets them with the progress.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The title's identifier on the watchlist.
 * @param {EntryUpdate} update What changes.
 * @param {Perhaps<CatalogAccess>} catalog How to ask the catalog for a series' seasons when it is started.
 *
 * @returns {Promise<Entry>} The title, as now stored. Rejects with 404 when there is no such title, and 400 when rating
 * or commenting on a title not watched, or giving a progress that doesn't fit.
 */
export async function updateEntry(prisma: PrismaClient, id: string, update: EntryUpdate, catalog?: CatalogAccess): Promise<Entry> {
    const row = await prisma.watchlistEntry.findUnique({ where: { id } });

    if (row === null) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown title');
    }

    const watchedAt = update.watchedAt === undefined ? row.watchedAt : update.watchedAt;
    const startedAt = update.startedAt === undefined ? row.startedAt : update.startedAt;
    const isReviewing = (update.rating ?? null) !== null || (update.comment ?? null) !== null;
    const progress = update.progress ?? null;

    if (watchedAt === null && startedAt === null) {
        if (isReviewing || progress !== null) {
            throw new RequestError(StatusCodes.BAD_REQUEST, 'A title still to watch has no rating, comment or progress');
        }

        const reset = await prisma.watchlistEntry.update({ where: { id }, data: { startedAt: null, season: null, episode: null, watchedAt: null, rating: null, comment: null } });

        return toEntry(reset);
    }

    if (watchedAt === null) {
        if (isReviewing) {
            throw new RequestError(StatusCodes.BAD_REQUEST, 'Only a watched title can be rated or commented on');
        }

        const episodeCounts = await episodeCountsFor(row, row.startedAt === null || row.watchedAt !== null, catalog);
        const kept: Maybe<Progress> = row.season === null || row.episode === null || row.watchedAt !== null ? null : { season: row.season, episode: row.episode };
        const next = update.progress === undefined ? kept : progress;

        checkProgress(row, next, episodeCounts);

        const watching = await prisma.watchlistEntry.update({ where: { id }, data: { startedAt, watchedAt: null, season: next?.season ?? null, episode: next?.episode ?? null, episodeCounts } });

        return toEntry(watching);
    }

    if (progress !== null) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Only a title being watched has a progress');
    }

    const updated = await prisma.watchlistEntry.update({
        where: { id },
        data: {
            startedAt,
            watchedAt,
            season: null,
            episode: null,
            rating: update.rating === undefined ? row.rating : update.rating,
            comment: update.comment === undefined ? row.comment : update.comment
        }
    });

    return toEntry(updated);
}

/**
 * @function removeEntry
 * @description Takes a title off the watchlist, with its rating and comment.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The title's identifier on the watchlist.
 *
 * @returns {Promise<void>} Resolves once it is gone. Rejects with 404 when there is no such title.
 */
export async function removeEntry(prisma: PrismaClient, id: string): Promise<void> {
    const { count } = await prisma.watchlistEntry.deleteMany({ where: { id } });

    if (count === 0) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown title');
    }
}
