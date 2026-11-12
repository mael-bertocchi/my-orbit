import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import placesRoutes from 'src/modules/budget/places/places-routes';
import { forgetPlaces } from 'src/modules/budget/places/places-service';
import type { IdentityService } from 'src/plugins/identity';
import { RequestError } from 'src/shared/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';
import { testVariables } from '../../../support/variables';

/**
 * @function stubStreet
 * @description Replaces `fetch` with a Photon stand-in finding a street of Paris near any position, and Paris itself
 * for any search, and records the addresses asked.
 *
 * @returns {URL[]} The addresses asked.
 */
function stubStreet(): URL[] {
    const calls: URL[] = [];

    vi.stubGlobal('fetch', vi.fn((input: string) => {
        const url = new URL(input);

        calls.push(url);

        const street = { name: 'Rue de Rivoli', type: 'street', city: 'Paris', country: 'France' };
        const city = { osm_type: 'R', osm_id: 71525, name: 'Paris', type: 'city', country: 'France' };
        const body = { features: [{ properties: url.pathname.endsWith('/reverse') ? street : city }] };

        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }));

    return calls;
}

/**
 * @interface TestApp
 * @description A server carrying the places routes, and the addresses its Photon stand-in was asked.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    calls: URL[]; /*!< The addresses asked of Photon */
}

/**
 * @function buildApp
 * @description Builds an instance carrying just what the places routes depend on, answering errors as the server does,
 * with a Photon stand-in finding Paris.
 */
async function buildApp(authenticate: () => Promise<void> = () => Promise.resolve()): Promise<TestApp> {
    const calls = stubStreet();
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.decorate('variables', testVariables());
    app.decorate('identity', standIn<IdentityService>({ authenticate }));

    app.setErrorHandler((error: Error, _request, reply) => {
        let code = StatusCodes.INTERNAL_SERVER_ERROR;

        if (error instanceof RequestError) {
            code = error.code;
        } else if (hasZodFastifySchemaValidationErrors(error)) {
            code = StatusCodes.BAD_REQUEST;
        }

        return reply.status(code).send({ message: error.message, data: undefined });
    });

    await app.register(placesRoutes, { prefix: '/v1/budget/places' });

    return { app, calls };
}

/**
 * @function deny
 * @description An authenticate stand-in that rejects the request the way the real guard does.
 */
function deny(): Promise<void> {
    return Promise.reject(new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid or expired access token'));
}

beforeEach(() => {
    forgetPlaces();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GET /v1/budget/places/search', () => {
    it('serves the cities inside the standard envelope', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/v1/budget/places/search?query=par' });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: unknown[] }>().data).toEqual([{ id: 'R71525', nameEn: 'Paris', nameFr: 'Paris', detail: 'France' }]);

        await app.close();
    });

    it('waits for two letters', async () => {
        const { app, calls } = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/v1/budget/places/search?query=r' });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(calls).toHaveLength(0);

        await app.close();
    });

    it('is guarded by the identity plugin', async () => {
        const { app, calls } = await buildApp(deny);
        const response = await app.inject({ method: 'GET', url: '/v1/budget/places/search?query=par' });

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect(calls).toHaveLength(0);

        await app.close();
    });
});

describe('GET /v1/budget/places/locate', () => {
    it('rounds the position to about a kilometre before asking', async () => {
        const { app, calls } = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/v1/budget/places/locate?latitude=48.856613&longitude=2.352222' });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: { nameFr: string } }>().data.nameFr).toBe('Paris');
        expect(calls[0].searchParams.get('lat')).toBe('48.86');
        expect(calls[0].searchParams.get('lon')).toBe('2.35');

        await app.close();
    });

    it('rejects a position off the globe', async () => {
        const { app, calls } = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/v1/budget/places/locate?latitude=120&longitude=2' });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(calls).toHaveLength(0);

        await app.close();
    });
});
