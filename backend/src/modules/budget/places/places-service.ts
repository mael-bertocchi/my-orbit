import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { BudgetPlace, Prisma, PrismaClient } from 'prisma/generated/prisma/client';
import type { GeoapifyResult, Place, PlaceReference, PlacesLanguage } from 'src/modules/budget/places/places-models';
import { GeoapifyPayloadSchema, GeoapifyResultSchema } from 'src/modules/budget/places/places-models';
import type { Variables } from 'src/plugins/environment';
import { ExpiringCache } from 'src/shared/expiring-cache';
import type { Maybe, Perhaps } from 'src/shared/models';
import { RequestError } from 'src/shared/models';

/**
 * @interface PlacesContext
 * @description What finding and checking a city works with.
 */
export interface PlacesContext {
    prisma: PrismaClient; /*!< The database client, holding the cities already checked */
    variables: Variables; /*!< The environment, holding Geoapify's address and key */
    logger: FastifyBaseLogger; /*!< The request logger */
}

/**
 * @function placesContextOf
 * @description What finding and checking a city works with, for a request.
 *
 * @param {FastifyRequest} request The request.
 *
 * @returns {PlacesContext} The server's database and environment, and the request's logger.
 */
export function placesContextOf(request: FastifyRequest): PlacesContext {
    return { prisma: request.server.prisma, variables: request.server.variables, logger: request.log };
}

/**
 * @constant WITH_PLACE
 * @description Reads an operation, or a recurring one, with the city it takes place in, named in each language.
 */
export const WITH_PLACE: { place: true } = { place: true };

/**
 * @type OperationRow
 * @description A stored operation, with its city.
 */
export type OperationRow = Prisma.BudgetOperationGetPayload<{ include: { place: true } }>;

/**
 * @type RecurringRow
 * @description A stored recurring operation, with its city.
 */
export type RecurringRow = Prisma.BudgetRecurringOperationGetPayload<{ include: { place: true } }>;

/**
 * @function placeReferenceOf
 * @description A city as the routes send it, from its stored row.
 *
 * @param {Maybe<BudgetPlace>} place The stored row, if any.
 *
 * @returns {Maybe<PlaceReference>} The city, or null.
 */
export function placeReferenceOf(place: Maybe<BudgetPlace>): Maybe<PlaceReference> {
    return place === null ? null : { id: place.id, nameEn: place.nameEn, nameFr: place.nameFr };
}

/**
 * @function placeNameOf
 * @description The name of a city in a language.
 *
 * @param {Maybe<BudgetPlace>} place The stored city, if any.
 * @param {PlacesLanguage} language The language.
 *
 * @returns {Maybe<string>} Its name, or null without a city.
 */
export function placeNameOf(place: Maybe<BudgetPlace>, language: PlacesLanguage): Maybe<string> {
    if (place === null) {
        return null;
    }

    return language === 'fr' ? place.nameFr : place.nameEn;
}

/**
 * @interface CityName
 * @description A city as Geoapify names it in one language.
 */
interface CityName {
    name: string; /*!< Its name */
    detail: string; /*!< Its region and country, empty when unknown */
}

/**
 * @constant PLACES_TIMEOUT
 * @description How long to wait on Geoapify before calling it unavailable: a suggestion that comes late is no help.
 */
const PLACES_TIMEOUT = 5 * 1000;

/**
 * @constant SEARCH_RESULTS
 * @description How many cities a search suggests at most.
 */
const SEARCH_RESULTS = 6;

/**
 * @constant searches
 * @description Recent searches, so typing back to an earlier query doesn't ask again.
 */
const searches = new ExpiringCache<Place[]>(60 * 60 * 1000, 500);

/**
 * @constant positions
 * @description Recent positions and their city, so locating twice in the same place doesn't ask again.
 */
const positions = new ExpiringCache<Maybe<Place>>(24 * 60 * 60 * 1000, 200);

/**
 * @constant served
 * @description The cities the server suggested lately, by identity: an operation naming one of them is taken as checked,
 * without asking Geoapify again.
 */
const served = new ExpiringCache<PlaceReference>(7 * 24 * 60 * 60 * 1000, 5000);

/**
 * @function forgetPlaces
 * @description Forgets every answer kept, for the tests.
 */
export function forgetPlaces(): void {
    searches.clear();
    positions.clear();
    served.clear();
}

/**
 * @function foldName
 * @description Reduces a name for comparing it with another: trimmed, in lower case and without accents.
 *
 * @param {string} name The name.
 *
 * @returns {string} The name reduced.
 */
export function foldName(name: string): string {
    return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * @function ask
 * @description Asks Geoapify, a geocoder built on OpenStreetMap, one question, in JSON, for cities only. The server asks
 * it with its own key, so it never learns who asks.
 *
 * @param {PlacesContext} context What it works with.
 * @param {string} path The endpoint, from Geoapify's address.
 * @param {Record<string, string>} query Its parameters.
 *
 * @returns {Promise<unknown[]>} What Geoapify says of each place found. Rejects with 503 when it can't help.
 */
async function ask(context: PlacesContext, path: string, query: Record<string, string>): Promise<unknown[]> {
    const key = context.variables.GEOAPIFY_API_KEY;

    if (key === '') {
        context.logger.error({ path }, 'Places provider has no key');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Places are unavailable');
    }

    const parameters = new URLSearchParams({ ...query, type: 'city', format: 'json', apiKey: key });
    let response: Response;

    try {
        response = await fetch(`${context.variables.BUDGET_PLACES_URL}${path}?${parameters.toString()}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(PLACES_TIMEOUT)
        });
    } catch (error: unknown) {
        context.logger.error({ err: error, path }, 'Places provider unreachable');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Places are unavailable');
    }

    if (!response.ok) {
        context.logger.error({ status: response.status, path }, 'Places provider refused the request');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Places are unavailable');
    }

    const parsed = GeoapifyPayloadSchema.safeParse(await response.json().catch(() => null));

    if (!parsed.success) {
        context.logger.error({ issues: parsed.error.issues, path }, 'Places provider answered in an unexpected shape');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Places are unavailable');
    }

    return parsed.data.results;
}

/**
 * @function detailOf
 * @description The region and country a city lies in, joined, without the region when it is named like the city.
 *
 * @param {string} name The city's name.
 * @param {Perhaps<string>} state Its region.
 * @param {Perhaps<string>} country Its country.
 *
 * @returns {string} The detail, empty when both are unknown.
 */
function detailOf(name: string, state: Perhaps<string>, country: Perhaps<string>): string {
    const parts = [state === name ? undefined : state, country];

    return parts.filter((part) => part !== undefined && part !== '').join(', ');
}

/**
 * @function placeIdOf
 * @description A city's identity: its OpenStreetMap kind and number when Geoapify gives them, else its position to five
 * decimals, which is the same whichever language it is named in.
 *
 * @param {GeoapifyResult} result What Geoapify says of the city.
 *
 * @returns {string} Its identity, such as `R71525` or `G37.56667,126.97806`.
 */
function placeIdOf(result: GeoapifyResult): string {
    const raw = result.datasource?.raw;
    const kind = raw?.osm_type?.slice(0, 1).toUpperCase();

    if (kind !== undefined && ['N', 'W', 'R'].includes(kind) && raw?.osm_id !== undefined) {
        return `${kind}${Math.abs(raw.osm_id)}`;
    }

    return `G${result.lat.toFixed(5)},${result.lon.toFixed(5)}`;
}

/**
 * @function cityNameOf
 * @description The name of a city Geoapify found: its name, else the city it says it is.
 *
 * @param {GeoapifyResult} result What Geoapify says of the city.
 *
 * @returns {Maybe<string>} Its name, or null when it has none.
 */
function cityNameOf(result: GeoapifyResult): Maybe<string> {
    const name = result.name ?? result.city;

    return name === undefined || name.trim() === '' ? null : name;
}

/**
 * @function citiesOf
 * @description The cities among the places Geoapify found, by identity, in the order it ranks them. A place of another
 * kind, or without a name, is left out.
 *
 * @param {unknown[]} found What Geoapify says of each place.
 *
 * @returns {Map<string, CityName>} The cities.
 */
function citiesOf(found: unknown[]): Map<string, CityName> {
    const cities = new Map<string, CityName>();

    for (const candidate of found) {
        const result = GeoapifyResultSchema.safeParse(candidate);

        if (!result.success || (result.data.result_type !== undefined && result.data.result_type !== 'city')) {
            continue;
        }

        const name = cityNameOf(result.data);
        const id = placeIdOf(result.data);

        if (name !== null && !cities.has(id)) {
            cities.set(id, { name, detail: detailOf(name, result.data.state, result.data.country) });
        }
    }

    return cities;
}

/**
 * @function findCities
 * @description Asks Geoapify for cities, towns and villages in both of the portal's languages at once, so each comes
 * named in both, its region and country in the language asked, each name and detail only once.
 *
 * @param {PlacesContext} context What it works with.
 * @param {string} path The endpoint: `/autocomplete` for a name, `/reverse` for a position.
 * @param {Record<string, string>} query What to ask, the language aside.
 * @param {PlacesLanguage} language The language of the details, whose ranking is kept.
 *
 * @returns {Promise<Place[]>} The cities, the likeliest first.
 */
async function findCities(context: PlacesContext, path: string, query: Record<string, string>, language: PlacesLanguage): Promise<Place[]> {
    const [english, french] = await Promise.all([ask(context, path, { ...query, lang: 'en' }), ask(context, path, { ...query, lang: 'fr' })]);
    const named = { en: citiesOf(english), fr: citiesOf(french) };
    const places: Place[] = [];
    const seen = new Set<string>();

    for (const [id, city] of named[language]) {
        const nameEn = named.en.get(id)?.name ?? city.name;
        const nameFr = named.fr.get(id)?.name ?? city.name;
        const identity = foldName(`${city.name}|${city.detail}`);

        if (!seen.has(identity)) {
            seen.add(identity);
            places.push({ id, nameEn, nameFr, detail: city.detail });
            served.set(id, { id, nameEn, nameFr });
        }
    }

    return places;
}

/**
 * @function searchPlaces
 * @description Finds the cities, towns and villages whose name starts with what is typed.
 *
 * @param {PlacesContext} context What it works with.
 * @param {string} query What is typed.
 * @param {PlacesLanguage} language The language of their region and country.
 *
 * @returns {Promise<Place[]>} The cities, the likeliest first.
 */
export async function searchPlaces(context: PlacesContext, query: string, language: PlacesLanguage): Promise<Place[]> {
    const key = `${language}:${query.toLowerCase()}`;
    const cached = searches.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const places = (await findCities(context, '/autocomplete', { text: query, limit: String(SEARCH_RESULTS * 2) }, language)).slice(0, SEARCH_RESULTS);

    searches.set(key, places);

    return places;
}

/**
 * @function locatePlace
 * @description Finds the city at a position, named in both languages.
 *
 * @param {PlacesContext} context What it works with.
 * @param {number} latitude The latitude, already rounded.
 * @param {number} longitude The longitude, already rounded.
 * @param {PlacesLanguage} language The language of its region and country.
 *
 * @returns {Promise<Place>} The city. Rejects with 404 when the position is in no city, out at sea for one.
 */
export async function locatePlace(context: PlacesContext, latitude: number, longitude: number, language: PlacesLanguage): Promise<Place> {
    const key = `${language}:${latitude}:${longitude}`;
    let place = positions.get(key);

    if (place === undefined) {
        const cities = await findCities(context, '/reverse', { lat: String(latitude), lon: String(longitude), limit: '1' }, language);

        place = cities[0] ?? null;
        positions.set(key, place);
    }

    if (place === null) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'No city at this position');
    }

    return place;
}

/**
 * @function keepPlace
 * @description Stores a city once checked, so an operation can name it.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {PlaceReference} place The city.
 *
 * @returns {Promise<PlaceReference>} The city.
 */
async function keepPlace(prisma: PrismaClient, place: PlaceReference): Promise<PlaceReference> {
    await prisma.budgetPlace.upsert({ where: { id: place.id }, update: { nameEn: place.nameEn, nameFr: place.nameFr }, create: place });

    return place;
}

/**
 * @function checkPlace
 * @description Checks the city an operation names: one already stored, or one the server suggested lately, or else one
 * Geoapify finds again under the name the operation gives it. Its names always come from the server, never from the request.
 *
 * @param {PlacesContext} context What it works with.
 * @param {string} id The city's identity.
 * @param {Maybe<string>} hint The name the operation gives it, to find it again.
 *
 * @returns {Promise<PlaceReference>} The city, stored. Rejects with 422 for a city that can't be found.
 */
export async function checkPlace(context: PlacesContext, id: string, hint: Maybe<string>): Promise<PlaceReference> {
    const stored = await context.prisma.budgetPlace.findUnique({ where: { id } });

    if (stored !== null) {
        return { id: stored.id, nameEn: stored.nameEn, nameFr: stored.nameFr };
    }

    const known = served.get(id);

    if (known !== undefined) {
        return await keepPlace(context.prisma, known);
    }

    const query = hint?.trim() ?? '';
    const found = query === '' ? [] : await findCities(context, '/autocomplete', { text: query, limit: '12' }, 'fr');
    const match = found.find((city) => city.id === id);

    if (match === undefined) {
        throw new RequestError(StatusCodes.UNPROCESSABLE_ENTITY, 'Unknown place');
    }

    return await keepPlace(context.prisma, { id: match.id, nameEn: match.nameEn, nameFr: match.nameFr });
}

/**
 * @function matchPlace
 * @description The city a place written by hand names, as findPlaceNamed finds it; none when Geoapify can't be reached.
 *
 * @param {PlacesContext} context What it works with.
 * @param {string} text The place, as written.
 *
 * @returns {Promise<Maybe<PlaceReference>>} The city, stored, or null.
 */
export async function matchPlace(context: PlacesContext, text: string): Promise<Maybe<PlaceReference>> {
    return await findPlaceNamed(context, text).catch(() => null);
}

/**
 * @function findPlaceNamed
 * @description The city a place written by hand names, when Geoapify knows a city of exactly that name in either language,
 * accents and case aside. The likeliest such city is taken; none when there is no such city.
 *
 * @param {PlacesContext} context What it works with.
 * @param {string} text The place, as written.
 *
 * @returns {Promise<Maybe<PlaceReference>>} The city, stored, or null; rejects when Geoapify can't be reached.
 */
export async function findPlaceNamed(context: PlacesContext, text: string): Promise<Maybe<PlaceReference>> {
    const folded = foldName(text);

    if (folded.length < 2) {
        return null;
    }

    const found = await findCities(context, '/autocomplete', { text: text.trim(), limit: '12' }, 'fr');
    const match = found.find((city) => foldName(city.nameFr) === folded || foldName(city.nameEn) === folded);

    return match === undefined ? null : await keepPlace(context.prisma, { id: match.id, nameEn: match.nameEn, nameFr: match.nameFr });
}

/**
 * @function placeFor
 * @description The city an operation is to be stored with, from what the request says: the city it names, checked; else
 * the city its place written by hand names, if any; nothing when it has no place; and undefined when the request changes
 * neither, so the stored one stays.
 *
 * @param {PlacesContext} context What it works with.
 * @param {Perhaps<Maybe<string>>} placeId The city the request names.
 * @param {Perhaps<Maybe<string>>} location The place the request writes.
 *
 * @returns {Promise<Perhaps<Maybe<PlaceReference>>>} The city, null for none, undefined to keep the stored one.
 */
export async function placeFor(context: PlacesContext, placeId: Perhaps<Maybe<string>>, location: Perhaps<Maybe<string>>): Promise<Perhaps<Maybe<PlaceReference>>> {
    if (placeId !== undefined && placeId !== null) {
        return await checkPlace(context, placeId, location ?? null);
    }

    if (placeId === undefined && location === undefined) {
        return undefined;
    }

    return location === undefined || location === null ? null : await matchPlace(context, location);
}

/**
 * @interface PlacedFields
 * @description What a request writing an operation, or a recurring one, says of its place.
 */
export interface PlacedFields {
    placeId?: Maybe<string>; /*!< The city it names */
    location?: Maybe<string>; /*!< The place it writes */
}

/**
 * @function withPlace
 * @description A request writing an operation, or a recurring one, with its city checked: the city it names, or the
 * one its place written by hand names, or none. A city named without a place written is written under its French name,
 * so an app reading the place alone still finds one.
 *
 * @param {PlacesContext} context What it works with.
 * @param {T} body The request.
 *
 * @returns {Promise<T>} The request, its city checked. Rejects with 422 when the city it names can't be found.
 */
export async function withPlace<T extends PlacedFields>(context: PlacesContext, body: T): Promise<T> {
    const place = await placeFor(context, body.placeId, body.location);

    if (place === undefined) {
        return body;
    }

    if (place === null) {
        return { ...body, placeId: null };
    }

    return { ...body, placeId: place.id, location: body.location ?? place.nameFr };
}
