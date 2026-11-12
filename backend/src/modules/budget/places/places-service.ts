import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { Place, PlacesLanguage } from 'src/modules/budget/places/places-models';
import { PhotonPayloadSchema, PhotonPropertiesSchema } from 'src/modules/budget/places/places-models';
import type { Variables } from 'src/plugins/environment';
import { ExpiringCache } from 'src/shared/expiring-cache';
import type { Maybe, Perhaps } from 'src/shared/models';
import { RequestError } from 'src/shared/models';

/**
 * @constant PLACES_TIMEOUT
 * @description How long to wait on Photon before calling it unavailable: a suggestion that comes late is no help.
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
 * @function forgetPlaces
 * @description Forgets every answer kept, for the tests.
 */
export function forgetPlaces(): void {
    searches.clear();
    positions.clear();
}

/**
 * @function ask
 * @description Asks Photon, a key-free geocoder built on OpenStreetMap, one question. The server asks it, so it never
 * learns who asks.
 *
 * @param {Variables} variables The environment, holding Photon's address.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} path The endpoint, from Photon's address.
 * @param {Record<string, string>} query Its parameters.
 *
 * @returns {Promise<unknown[]>} What Photon says of each place found. Rejects with 503 when it can't help.
 */
async function ask(variables: Variables, logger: FastifyBaseLogger, path: string, query: Record<string, string>): Promise<unknown[]> {
    let response: Response;

    try {
        response = await fetch(`${variables.BUDGET_PLACES_URL}${path}?${new URLSearchParams(query).toString()}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(PLACES_TIMEOUT)
        });
    } catch (error: unknown) {
        logger.error({ error, path }, 'Places provider unreachable');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Places are unavailable');
    }

    if (!response.ok) {
        logger.error({ status: response.status, path }, 'Places provider refused the request');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Places are unavailable');
    }

    const parsed = PhotonPayloadSchema.safeParse(await response.json().catch(() => null));

    if (!parsed.success) {
        logger.error({ issues: parsed.error.issues, path }, 'Places provider answered in an unexpected shape');

        throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Places are unavailable');
    }

    return parsed.data.features.map((feature) => feature.properties);
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
 * @function cityOf
 * @description The city a place found near a position lies in: the place itself when it is a city, else the city it
 * names, as a street or a building does.
 *
 * @param {unknown} candidate What Photon says of the place.
 *
 * @returns {Maybe<Place>} The city, or null when it names none.
 */
function cityOf(candidate: unknown): Maybe<Place> {
    const properties = PhotonPropertiesSchema.safeParse(candidate);

    if (!properties.success) {
        return null;
    }

    const name = properties.data.type === 'city' ? properties.data.name : properties.data.city;

    if (name === undefined || name === '') {
        return null;
    }

    return { name, detail: detailOf(name, properties.data.state, properties.data.country) };
}

/**
 * @function searchPlaces
 * @description Finds the cities, towns and villages whose name starts with what is typed, each only once.
 *
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} query What is typed.
 * @param {PlacesLanguage} language The language to name them in.
 *
 * @returns {Promise<Place[]>} The cities, the likeliest first.
 */
export async function searchPlaces(variables: Variables, logger: FastifyBaseLogger, query: string, language: PlacesLanguage): Promise<Place[]> {
    const key = `${language}:${query.toLowerCase()}`;
    const cached = searches.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const found = await ask(variables, logger, '/api', { q: query, lang: language, layer: 'city', limit: String(SEARCH_RESULTS * 2) });
    const places = new Map<string, Place>();

    for (const candidate of found) {
        const properties = PhotonPropertiesSchema.safeParse(candidate);

        if (!properties.success || properties.data.name === undefined || properties.data.name === '') {
            continue;
        }

        const place = { name: properties.data.name, detail: detailOf(properties.data.name, properties.data.state, properties.data.country) };
        const identity = `${place.name}|${place.detail}`.toLowerCase();

        if (!places.has(identity)) {
            places.set(identity, place);
        }
    }

    const result = [...places.values()].slice(0, SEARCH_RESULTS);

    searches.set(key, result);

    return result;
}

/**
 * @function locatePlace
 * @description Finds the city at a position: the place nearest to it is a street or a building, which says what city
 * it is in, or the city itself.
 *
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {number} latitude The latitude, already rounded.
 * @param {number} longitude The longitude, already rounded.
 * @param {PlacesLanguage} language The language to name it in.
 *
 * @returns {Promise<Place>} The city. Rejects with 404 when the position is in no city, out at sea for one.
 */
export async function locatePlace(variables: Variables, logger: FastifyBaseLogger, latitude: number, longitude: number, language: PlacesLanguage): Promise<Place> {
    const key = `${language}:${latitude}:${longitude}`;
    let place = positions.get(key);

    if (place === undefined) {
        const found = await ask(variables, logger, '/reverse', { lat: String(latitude), lon: String(longitude), lang: language, limit: '1' });
        place = cityOf(found[0]);
        positions.set(key, place);
    }

    if (place === null) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'No city at this position');
    }

    return place;
}
