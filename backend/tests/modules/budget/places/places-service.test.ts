import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import type { PlaceReference } from 'src/modules/budget/places/places-models';
import type { PlacesContext } from 'src/modules/budget/places/places-service';
import { checkPlace, forgetPlaces, locatePlace, matchPlace, searchPlaces, withPlace } from 'src/modules/budget/places/places-service';
import type { Maybe, Perhaps } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeoapifyCity } from '../../../support/geoapify';
import { resultOf, stubCities, stubGeoapify } from '../../../support/geoapify';
import { standIn } from '../../../support/stand-in';
import { testVariables } from '../../../support/variables';

/**
 * @constant SEOUL
 * @description A city named differently in English and in French
 */
const SEOUL: GeoapifyCity = { id: 'R2297418', en: 'Seoul', fr: 'Séoul', country: 'Corée du Sud' };

/**
 * @constant LYON
 * @description A city named alike in both languages
 */
const LYON: GeoapifyCity = { id: 'R120965', en: 'Lyon', fr: 'Lyon', state: 'Auvergne-Rhône-Alpes', country: 'France' };

/**
 * @class PlacesTable
 * @description A stand-in for the table of the cities checked
 */
class PlacesTable {
    rows: PlaceReference[] = []; /*!< The cities stored */

    findUnique = vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(this.rows.find((row) => row.id === where.id) ?? null));

    upsert = vi.fn(({ create }: { create: PlaceReference }) => {
        this.rows = [...this.rows.filter((row) => row.id !== create.id), create];

        return Promise.resolve(create);
    });
}

/**
 * @function contextWith
 * @description What the places work with, around a stand-in table.
 */
function contextWith(table: PlacesTable): PlacesContext {
    return { prisma: standIn<PrismaClient>({ budgetPlace: table }), variables: testVariables(), logger: standIn<FastifyBaseLogger>({ error: vi.fn(), warn: vi.fn() }) };
}

/**
 * @function statusOf
 * @description The status a rejected call carries, or 0 when it did not reject with a `RequestError`.
 */
async function statusOf(call: Promise<unknown>): Promise<number> {
    try {
        await call;
        return 0;
    } catch (error: unknown) {
        return error instanceof RequestError ? error.code : 0;
    }
}

/**
 * @function idOf
 * @description The identity of the city a request ends up naming.
 */
function idOf(body: { placeId?: Maybe<string>; location?: Maybe<string> }): Perhaps<Maybe<string>> {
    return body.placeId;
}

beforeEach(() => {
    forgetPlaces();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('searchPlaces', () => {
    it('asks for cities in both languages, and names each one in both, with its region and country in the language asked', async () => {
        const calls = stubCities([SEOUL, LYON, LYON]);
        const places = await searchPlaces(contextWith(new PlacesTable()), 'seo', 'fr');

        expect(places).toEqual([{ id: 'R2297418', nameEn: 'Seoul', nameFr: 'Séoul', detail: 'Corée du Sud' }, { id: 'R120965', nameEn: 'Lyon', nameFr: 'Lyon', detail: 'Auvergne-Rhône-Alpes, France' }]);
        expect(calls.map((call) => call.searchParams.get('lang'))).toEqual(expect.arrayContaining(['en', 'fr']));
        expect(calls.every((call) => call.origin === 'https://places.example.fr' && call.pathname === '/autocomplete' && call.searchParams.get('type') === 'city' && call.searchParams.get('apiKey') === 'a-test-places-key')).toBe(true);
    });

    it('keeps an answer for a while', async () => {
        const calls = stubCities([LYON]);
        const context = contextWith(new PlacesTable());

        await searchPlaces(context, 'Ly', 'fr');
        await searchPlaces(context, 'ly', 'fr');

        expect(calls).toHaveLength(2);
    });

    it('answers 503 without asking when the server has no key', async () => {
        const calls = stubCities([LYON]);
        const context = { ...contextWith(new PlacesTable()), variables: testVariables({ GEOAPIFY_API_KEY: '' }) };

        expect(await statusOf(searchPlaces(context, 'ly', 'fr'))).toBe(StatusCodes.SERVICE_UNAVAILABLE);
        expect(calls).toHaveLength(0);
    });

    it('answers 503 when Geoapify fails', async () => {
        stubGeoapify(() => [], 500);

        expect(await statusOf(searchPlaces(contextWith(new PlacesTable()), 'par', 'fr'))).toBe(StatusCodes.SERVICE_UNAVAILABLE);
    });
});

describe('locatePlace', () => {
    it('names the city the district at the position lies in, found again around it in both languages', async () => {
        const district = { name: '서강동', city: 'Séoul', country: 'Corée du Sud', result_type: 'suburb', lat: 37.5468923, lon: 126.9260216 };
        const calls = stubGeoapify((url) => (url.pathname !== '/reverse' ? [resultOf(SEOUL, url.searchParams.get('lang') ?? 'en')] : [district]));
        const place = await locatePlace(contextWith(new PlacesTable()), 37.55, 126.93, 'fr');

        expect(place).toEqual({ id: 'R2297418', nameEn: 'Seoul', nameFr: 'Séoul', detail: 'Corée du Sud' });
        expect(calls[0].pathname).toBe('/reverse');
        expect(calls[0].searchParams.get('lat')).toBe('37.55');
        expect(calls[1].searchParams.get('text')).toBe('Séoul');
        expect(calls[1].searchParams.get('bias')).toBe('proximity:126.93,37.55');
    });

    it('names the city found at the position when it is one', async () => {
        stubGeoapify((url) => [resultOf(SEOUL, url.searchParams.get('lang') ?? 'en')]);

        expect((await locatePlace(contextWith(new PlacesTable()), 37.57, 126.98, 'en')).id).toBe('R2297418');
    });

    it('answers 404 when the position is in no city', async () => {
        stubGeoapify(() => [{ name: 'Mer Méditerranée', result_type: 'other', lat: 40, lon: 5 }]);

        expect(await statusOf(locatePlace(contextWith(new PlacesTable()), 40, 5, 'fr'))).toBe(StatusCodes.NOT_FOUND);
    });
});

describe('city identity', () => {
    it('reads the OpenStreetMap identity held in the place identity Geoapify gives', async () => {
        const seoul = { name: 'Séoul', city: 'Séoul', result_type: 'city', lat: 37.5666791, lon: 126.9782914, place_id: '51513d88539cbe5f4059d2e9d4f088c84240f00101f9014a0e230000000000c0020892030653c3a96f756c' };
        const village = { name: 'Seoulasso', result_type: 'city', lat: 13.2396771, lon: -4.6983236, place_id: '519619805715cb12c0594333f4f4b67a2a40f00103f90138d1dece01000000c0020892030953656f756c6173736f' };
        stubGeoapify(() => [seoul, village]);

        expect((await searchPlaces(contextWith(new PlacesTable()), 'seoul', 'fr')).map((place) => place.id)).toEqual(['R2297418', 'N7765676344']);
    });

    it('names a city by its position when Geoapify gives no OpenStreetMap identity', async () => {
        stubGeoapify((url) => [{ name: url.searchParams.get('lang') !== 'fr' ? 'Seoul' : 'Séoul', result_type: 'city', lat: 37.566667, lon: 126.978056 }]);

        expect(await searchPlaces(contextWith(new PlacesTable()), 'seo', 'fr')).toEqual([{ id: 'G37.56667,126.97806', nameEn: 'Seoul', nameFr: 'Séoul', detail: '' }]);
    });
});

describe('checkPlace', () => {
    it('takes a city the server suggested lately, and stores it with the names the server knows', async () => {
        stubCities([SEOUL]);
        const table = new PlacesTable();
        const context = contextWith(table);

        await searchPlaces(context, 'seo', 'en');
        vi.unstubAllGlobals();

        expect(await checkPlace(context, 'R2297418', 'anything')).toEqual({ id: 'R2297418', nameEn: 'Seoul', nameFr: 'Séoul' });
        expect(table.rows).toHaveLength(1);
    });

    it('finds a city again under the name given, and refuses one it can\'t find', async () => {
        stubCities([SEOUL]);
        const context = contextWith(new PlacesTable());

        expect((await checkPlace(context, 'R2297418', 'Séoul')).nameEn).toBe('Seoul');
        expect(await statusOf(checkPlace(context, 'R1', 'Séoul'))).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    });
});

describe('matchPlace', () => {
    it('gives the city a place written by hand names in either language, accents and case aside', async () => {
        stubCities([SEOUL]);
        const context = contextWith(new PlacesTable());

        expect((await matchPlace(context, 'seoul'))?.id).toBe('R2297418');
        expect(await matchPlace(context, 'Seo')).toBeNull();
    });

    it('gives none when Geoapify can\'t be reached', async () => {
        stubGeoapify(() => [], 500);

        expect(await matchPlace(contextWith(new PlacesTable()), 'Séoul')).toBeNull();
    });
});

describe('withPlace', () => {
    it('keeps the stored city when the request changes no place, and drops it when the place goes', async () => {
        const context = contextWith(new PlacesTable());

        expect(idOf(await withPlace(context, { description: 'Café', location: undefined }))).toBeUndefined();
        expect(idOf(await withPlace(context, { location: null }))).toBeNull();
    });

    it('writes a city named without a place under its French name', async () => {
        stubCities([SEOUL]);
        const context = contextWith(new PlacesTable());

        await searchPlaces(context, 'seo', 'en');

        expect(await withPlace(context, { placeId: 'R2297418' })).toEqual({ placeId: 'R2297418', location: 'Séoul' });
    });
});
