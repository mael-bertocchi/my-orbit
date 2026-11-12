import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import operationsRoutes from 'src/modules/budget/operations/operations-routes';
import type { PlaceReference } from 'src/modules/budget/places/places-models';
import { forgetPlaces } from 'src/modules/budget/places/places-service';
import type { IdentityService } from 'src/plugins/identity';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotonCity } from '../../../support/photon';
import { stubCities } from '../../../support/photon';
import { standIn } from '../../../support/stand-in';
import { testVariables } from '../../../support/variables';

/**
 * @constant OPERATION_ID
 * @description The identifier of the operation the stand-in database holds
 */
const OPERATION_ID = '5f1b2c3d-4e5f-4a1b-8c2d-3e4f5a6b7c8d';

/**
 * @interface Row
 * @description A stored operation, as the stand-in database keeps it
 */
interface Row {
    id: string; /*!< Its identifier */
    date: Date; /*!< When it happened */
    name: string; /*!< What it was */
    description: Maybe<string>; /*!< What was said about it */
    categoryId: string; /*!< Its category */
    location: Maybe<string>; /*!< Where it happened */
    placeId: Maybe<string>; /*!< The city it happened in */
    place: Maybe<PlaceReference>; /*!< That city, named in each language */
    amount: number; /*!< How much, in its currency */
    currencyCode: string; /*!< Its currency */
    rateToEuro: number; /*!< Euros per unit of its currency */
    isOnline: boolean; /*!< Whether it was paid online */
    deletedAt: Maybe<Date>; /*!< When it went to the trash */
    updatedAt: Date; /*!< When it last changed */
}

/**
 * @function groceriesRow
 * @description An operation in the budget
 */
function groceriesRow(): Row {
    return {
        id: OPERATION_ID,
        date: new Date('2026-10-24T18:00:00Z'),
        name: 'Whole Foods',
        description: null,
        categoryId: 'groceries',
        location: 'Berlin Mitte',
        placeId: null,
        place: null,
        amount: 54.2,
        currencyCode: 'USD',
        rateToEuro: 0.92,
        isOnline: false,
        deletedAt: null,
        updatedAt: new Date('2026-10-24T18:00:00Z')
    };
}

/**
 * @class OperationsTable
 * @description A stand-in for the operations table, holding its rows in memory.
 */
class OperationsTable {
    rows: Row[] = [groceriesRow()]; /*!< The stored operations */

    findMany = vi.fn(() => Promise.resolve(this.rows.filter((row) => row.deletedAt !== null)));

    findUnique = vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(this.rows.find((row) => row.id === where.id) ?? null));

    create = vi.fn(({ data }: { data: Omit<Row, 'deletedAt' | 'updatedAt' | 'place'> }) => {
        const row: Row = { ...data, place: null, deletedAt: null, updatedAt: new Date() };

        this.rows.push(row);

        return Promise.resolve(row);
    });

    update = vi.fn(({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const index = this.rows.findIndex((row) => row.id === where.id);
        const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

        this.rows[index] = { ...this.rows[index], ...defined, updatedAt: new Date() };

        return Promise.resolve(this.rows[index]);
    });
}

/**
 * @interface TestApp
 * @description A server carrying the operations routes, its stand-in table and the revision bumps it recorded.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    table: OperationsTable; /*!< The table */
    upsert: ReturnType<typeof vi.fn>; /*!< The revision bumps */
}

/**
 * @function buildApp
 * @description Builds an instance carrying just what the operations routes depend on.
 */
async function buildApp(authenticate: () => Promise<void> = () => Promise.resolve()): Promise<TestApp> {
    const table = new OperationsTable();
    const upsert = vi.fn(() => Promise.resolve({ id: 'owner', monthlyLimit: 3000, revision: 1 }));
    const places = { findUnique: vi.fn(() => Promise.resolve(null)), upsert: vi.fn(() => Promise.resolve(null)) };
    const client = { budgetOperation: table, budgetState: { upsert }, budgetPlace: places };
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.decorate('prisma', standIn<PrismaClient>({ ...client, $transaction: async (work: (transaction: typeof client) => Promise<unknown>) => await work(client) }));
    app.decorate('identity', standIn<IdentityService>({ authenticate }));
    app.decorate('variables', testVariables());

    app.setErrorHandler((error: Error, _request, reply) => {
        let code = StatusCodes.INTERNAL_SERVER_ERROR;

        if (error instanceof RequestError) {
            code = error.code;
        } else if (hasZodFastifySchemaValidationErrors(error)) {
            code = StatusCodes.BAD_REQUEST;
        }

        return reply.status(code).send({ message: error.message, data: undefined });
    });

    await app.register(operationsRoutes, { prefix: '/v1/budget/operations' });

    return { app, table, upsert };
}

/**
 * @constant newOperation
 * @description An operation as the client logs it
 */
const newOperation = {
    id: '0d9e8f7a-6b5c-4d3e-8f1a-2b3c4d5e6f70',
    date: '2026-10-28T12:30:00.000Z',
    name: 'Déjeuner',
    categoryId: 'restaurant',
    location: 'Genève',
    amount: 12.5,
    currencyCode: 'CHF',
    rateToEuro: 1.06
};

/**
 * @constant GENEVA
 * @description The city the stand-in Photon finds
 */
const GENEVA: PhotonCity = { id: 'R1685488', en: 'Geneva', fr: 'Genève', country: 'Suisse' };

beforeEach(() => {
    forgetPlaces();
    stubCities([GENEVA]);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('POST /v1/budget/operations', () => {
    it('logs an operation under the id the client minted and moves the revision on', async () => {
        const { app, table, upsert } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/budget/operations', payload: newOperation });

        expect(response.statusCode).toBe(StatusCodes.CREATED);
        expect(response.json<{ data: { id: string; isOnline: boolean; description: Maybe<string> } }>().data).toMatchObject({ id: newOperation.id, isOnline: false, description: null });
        expect(table.rows).toHaveLength(2);
        expect(upsert).toHaveBeenCalledOnce();

        await app.close();
    });

    it('gives a place written by hand the city it names, named in each language', async () => {
        const { app, table } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/budget/operations', payload: newOperation });

        expect(response.statusCode).toBe(StatusCodes.CREATED);
        expect(table.rows[1]).toMatchObject({ location: 'Genève', placeId: 'R1685488' });

        await app.close();
    });

    it('refuses a city it can\'t find', async () => {
        const { app, table } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/budget/operations', payload: { ...newOperation, placeId: 'R1' } });

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(table.create).not.toHaveBeenCalled();

        await app.close();
    });

    it('refuses an id already taken, even by an operation in the trash', async () => {
        const { app, table, upsert } = await buildApp();

        table.rows[0] = { ...table.rows[0], deletedAt: new Date() };

        const response = await app.inject({ method: 'POST', url: '/v1/budget/operations', payload: { ...newOperation, id: OPERATION_ID } });

        expect(response.statusCode).toBe(StatusCodes.CONFLICT);
        expect(table.create).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();

        await app.close();
    });

    it('refuses a negative amount', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/budget/operations', payload: { ...newOperation, amount: -3 } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);

        await app.close();
    });

    it('is guarded by the identity plugin', async () => {
        const { app, table } = await buildApp(() => Promise.reject(new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid or expired access token')));
        const response = await app.inject({ method: 'POST', url: '/v1/budget/operations', payload: newOperation });

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect(table.create).not.toHaveBeenCalled();

        await app.close();
    });
});

describe('PATCH /v1/budget/operations/:operationId', () => {
    it('changes what is sent and keeps the rest', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'PATCH', url: `/v1/budget/operations/${OPERATION_ID}`, payload: { amount: 60, description: 'Courses de la semaine' } });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: { amount: number; description: string; name: string; isOnline: boolean } }>().data).toMatchObject({ amount: 60, description: 'Courses de la semaine', name: 'Whole Foods', isOnline: false });

        await app.close();
    });

    it('answers 404 for an operation in the trash', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], deletedAt: new Date() };

        const response = await app.inject({ method: 'PATCH', url: `/v1/budget/operations/${OPERATION_ID}`, payload: { amount: 60 } });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
        expect(table.update).not.toHaveBeenCalled();

        await app.close();
    });

    it('answers 404 for an unknown operation', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'PATCH', url: '/v1/budget/operations/unknown', payload: { amount: 60 } });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);

        await app.close();
    });
});

describe('DELETE /v1/budget/operations/:operationId', () => {
    it('moves the operation to the trash instead of erasing it', async () => {
        const { app, table } = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: `/v1/budget/operations/${OPERATION_ID}` });

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT);
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0]?.deletedAt).toBeInstanceOf(Date);

        await app.close();
    });

    it('succeeds without changing anything when the operation is already in the trash', async () => {
        const { app, table, upsert } = await buildApp();

        table.rows[0] = { ...table.rows[0], deletedAt: new Date('2026-10-25T08:00:00Z') };

        const response = await app.inject({ method: 'DELETE', url: `/v1/budget/operations/${OPERATION_ID}` });

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT);
        expect(table.rows[0]?.deletedAt).toEqual(new Date('2026-10-25T08:00:00Z'));
        expect(upsert).not.toHaveBeenCalled();

        await app.close();
    });

    it('answers 404 for an unknown operation', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/v1/budget/operations/unknown' });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);

        await app.close();
    });
});

describe('the trash', () => {
    it('lists the deleted operations with when they were deleted', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], deletedAt: new Date('2026-10-25T08:00:00Z') };

        const response = await app.inject({ method: 'GET', url: '/v1/budget/operations/trash' });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: { id: string; deletedAt: string }[] }>().data).toEqual([expect.objectContaining({ id: OPERATION_ID, deletedAt: '2026-10-25T08:00:00.000Z' })]);

        await app.close();
    });

    it('puts a restored operation back into the budget', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], deletedAt: new Date('2026-10-25T08:00:00Z') };

        const response = await app.inject({ method: 'POST', url: `/v1/budget/operations/${OPERATION_ID}/restore` });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(table.rows[0]?.deletedAt).toBeNull();

        await app.close();
    });

    it('answers 404 when restoring an unknown operation', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/budget/operations/unknown/restore' });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);

        await app.close();
    });
});
