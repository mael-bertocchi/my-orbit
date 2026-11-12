import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { forgetPlaces, locatePlace, searchPlaces } from 'src/modules/budget/places/places-service';
import { RequestError } from 'src/shared/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';
import { testVariables } from '../../../support/variables';

/**
 * @constant variables
 * @description The environment Photon is asked with
 */
const variables = testVariables();

/**
 * @constant logger
 * @description A logger that keeps quiet
 */
const logger = standIn<FastifyBaseLogger>({ error: vi.fn(), warn: vi.fn() });

/**
 * @function stubPhoton
 * @description Replaces `fetch` with a Photon stand-in answering every question with the given places, and records the
 * addresses asked.
 *
 * @param {unknown[]} places What Photon says of each place found.
 * @param {number} status The status it answers with.
 *
 * @returns {URL[]} The addresses asked, filled in as they are asked.
 */
function stubPhoton(places: unknown[], status: number = 200): URL[] {
    const calls: URL[] = [];

    vi.stubGlobal('fetch', vi.fn((input: string) => {
        calls.push(new URL(input));

        const body = { type: 'FeatureCollection', features: places.map((properties) => ({ type: 'Feature', properties })) };

        return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    }));

    return calls;
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

beforeEach(() => {
    forgetPlaces();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('searchPlaces', () => {
    it('asks for cities only, in the language asked, and names each one once with its region and country', async () => {
        const calls = stubPhoton([
            { name: 'Lyon', type: 'city', state: 'Auvergne-Rhône-Alpes', country: 'France' },
            { name: 'Lyon', type: 'city', state: 'Auvergne-Rhône-Alpes', country: 'France' },
            { name: 'Lyons', type: 'city', state: 'Colorado', country: 'États-Unis' },
            { type: 'city', country: 'France' }
        ]);
        const places = await searchPlaces(variables, logger, 'lyo', 'fr');

        expect(places).toEqual([{ name: 'Lyon', detail: 'Auvergne-Rhône-Alpes, France' }, { name: 'Lyons', detail: 'Colorado, États-Unis' }]);
        expect(calls[0].origin).toBe('https://places.example.fr');
        expect(calls[0].pathname).toBe('/api');
        expect(calls[0].searchParams.get('layer')).toBe('city');
        expect(calls[0].searchParams.get('lang')).toBe('fr');
    });

    it('leaves out a region named like the city', async () => {
        stubPhoton([{ name: 'Berlin', type: 'city', state: 'Berlin', country: 'Allemagne' }]);

        expect(await searchPlaces(variables, logger, 'berl', 'fr')).toEqual([{ name: 'Berlin', detail: 'Allemagne' }]);
    });

    it('keeps an answer for a while', async () => {
        const calls = stubPhoton([{ name: 'Paris', type: 'city', country: 'France' }]);

        await searchPlaces(variables, logger, 'Par', 'fr');
        await searchPlaces(variables, logger, 'par', 'fr');

        expect(calls).toHaveLength(1);
    });

    it('answers 503 when Photon fails', async () => {
        stubPhoton([], 500);

        expect(await statusOf(searchPlaces(variables, logger, 'par', 'fr'))).toBe(StatusCodes.SERVICE_UNAVAILABLE);
    });
});

describe('locatePlace', () => {
    it('names the city of the street nearest to the position', async () => {
        const calls = stubPhoton([{ name: 'Rue de Rivoli', type: 'street', city: 'Paris', state: 'Île-de-France', country: 'France' }]);
        const place = await locatePlace(variables, logger, 48.86, 2.35, 'fr');

        expect(place).toEqual({ name: 'Paris', detail: 'Île-de-France, France' });
        expect(calls[0].pathname).toBe('/reverse');
        expect(calls[0].searchParams.get('lat')).toBe('48.86');
        expect(calls[0].searchParams.get('lon')).toBe('2.35');
    });

    it('names the place itself when it is a city', async () => {
        stubPhoton([{ name: 'Annecy', type: 'city', country: 'France' }]);

        expect((await locatePlace(variables, logger, 45.9, 6.13, 'fr')).name).toBe('Annecy');
    });

    it('answers 404 when the position is in no city', async () => {
        stubPhoton([{ name: 'Mer Méditerranée', type: 'other' }]);

        expect(await statusOf(locatePlace(variables, logger, 40, 5, 'fr'))).toBe(StatusCodes.NOT_FOUND);
    });
});
