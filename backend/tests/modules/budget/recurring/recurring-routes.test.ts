import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import recurringRoutes from 'src/modules/budget/recurring/recurring-routes';
import type { IdentityService } from 'src/plugins/identity';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

/**
 * @constant RENT_ID
 * @description The identifier of the recurring operation the stand-in database holds
 */
const RENT_ID = 'A1B2C3D4-E5F6-4A1B-8C2D-3E4F5A6B7C8D';

/**
 * @interface RecurringRow
 * @description A stored recurring operation, as the stand-in database keeps it
 */
interface RecurringRow {
    id: string; /*!< Its identifier */
    name: string; /*!< Its name */
    description: Maybe<string>; /*!< Its note */
    categoryId: string; /*!< Its category */
    location: Maybe<string>; /*!< Where it is paid */
    amount: number; /*!< How much, in its currency */
    currencyCode: string; /*!< Its currency */
    isOnline: boolean; /*!< Whether it is paid online */
    firstDate: string; /*!< Its first occurrence */
    intervalMonths: number; /*!< Months between two occurrences */
    endDate: Maybe<string>; /*!< Its last day */
    isPaused: boolean; /*!< Whether it is paused */
    generatedThrough: Maybe<string>; /*!< Its last occurrence passed */
    createdAt: Date; /*!< When it was created */
    updatedAt: Date; /*!< When it last changed */
}

/**
 * @interface OperationRow
 * @description A stored operation, with only what these tests look at
 */
interface OperationRow {
    id: string; /*!< Its identifier */
    date: Date; /*!< When it happened */
    rateToEuro: number; /*!< Euros per unit of its currency */
    isRecurring: boolean; /*!< Whether it is recurring */
    recurringId: Maybe<string>; /*!< The recurring operation it is an occurrence of */
}

/**
 * @function rentRow
 * @description A monthly rent, logged through October
 */
function rentRow(): RecurringRow {
    return { id: RENT_ID, name: 'Loyer', description: null, categoryId: 'housing', location: null, amount: 900, currencyCode: 'EUR', isOnline: true, firstDate: '2026-09-05', intervalMonths: 1, endDate: null, isPaused: false, generatedThrough: '2026-10-05', createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z') };
}

/**
 * @class Database
 * @description A stand-in for the tables the recurring operations touch, holding their rows in memory.
 */
class Database {
    recurring: RecurringRow[] = [rentRow()]; /*!< The stored recurring operations */
    operations: OperationRow[] = []; /*!< The stored operations */

    budgetRecurringOperation = {
        findMany: vi.fn(() => Promise.resolve(this.recurring)),
        findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(this.recurring.find((row) => row.id === where.id) ?? null)),
        create: vi.fn(({ data }: { data: Omit<RecurringRow, 'generatedThrough' | 'createdAt' | 'updatedAt'> }) => {
            const row: RecurringRow = { ...data, generatedThrough: null, createdAt: new Date(), updatedAt: new Date() };

            this.recurring.push(row);

            return Promise.resolve(row);
        }),
        update: vi.fn(({ where, data }: { where: { id: string }; data: Partial<RecurringRow> }) => {
            const index = this.recurring.findIndex((row) => row.id === where.id);
            const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
            const row: RecurringRow = { ...rentRow(), ...this.recurring[index], ...defined, updatedAt: new Date() };

            this.recurring[index] = row;

            return Promise.resolve(row);
        }),
        deleteMany: vi.fn(({ where }: { where: { id: string } }) => {
            const before = this.recurring.length;

            this.recurring = this.recurring.filter((row) => row.id !== where.id);

            return Promise.resolve({ count: before - this.recurring.length });
        })
    };

    budgetOperation = {
        createMany: vi.fn(({ data }: { data: OperationRow[] }) => {
            const fresh = data.filter((row) => !this.operations.some((existing) => existing.id === row.id));

            this.operations.push(...fresh);

            return Promise.resolve({ count: fresh.length });
        }),
        updateMany: vi.fn(({ where, data }: { where: { recurringId: string }; data: { recurringId: null } }) => {
            const linked = this.operations.filter((row) => row.recurringId === where.recurringId);

            for (const row of linked) {
                row.recurringId = data.recurringId;
            }

            return Promise.resolve({ count: linked.length });
        })
    };

    budgetCategory = {
        findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(['housing', 'fun'].includes(where.id) ? { id: where.id } : null))
    };

    budgetState = {
        upsert: vi.fn(() => Promise.resolve({ id: 'owner', monthlyLimit: 3000, revision: 1 }))
    };

    $transaction = async <T>(work: (transaction: Database) => Promise<T>): Promise<T> => await work(this);
}

/**
 * @interface TestApp
 * @description A server carrying the recurring operations' routes and its stand-in database.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    database: Database; /*!< The database */
}

/**
 * @function buildApp
 * @description Builds an instance carrying just what the recurring operations' routes depend on.
 */
async function buildApp(): Promise<TestApp> {
    const database = new Database();
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.decorate('prisma', standIn<PrismaClient>(database));
    app.decorate('identity', standIn<IdentityService>({ authenticate: () => Promise.resolve() }));

    app.setErrorHandler((error: Error, _request, reply) => {
        let code = StatusCodes.INTERNAL_SERVER_ERROR;

        if (error instanceof RequestError) {
            code = error.code;
        } else if (hasZodFastifySchemaValidationErrors(error)) {
            code = StatusCodes.BAD_REQUEST;
        }

        return reply.status(code).send({ message: error.message, data: undefined });
    });

    await app.register(recurringRoutes, { prefix: '/v1/budget/recurring' });

    return { app, database };
}

/**
 * @constant newRecurring
 * @description A recurring operation as the client creates it
 */
const newRecurring = {
    id: 'F0E1D2C3-B4A5-4968-8776-655443322110',
    name: 'Netflix',
    categoryId: 'fun',
    amount: 13.49,
    currencyCode: 'EUR',
    isOnline: true,
    firstDate: '2026-10-11',
    intervalMonths: 1
};

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T08:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('GET /v1/budget/recurring', () => {
    it('logs the occurrences fallen due since the last read, once, and gives the next one', async () => {
        const { app, database } = await buildApp();
        const first = await app.inject({ method: 'GET', url: '/v1/budget/recurring' });
        const second = await app.inject({ method: 'GET', url: '/v1/budget/recurring' });

        expect(first.statusCode).toBe(StatusCodes.OK);
        expect(first.json<{ data: { id: string; nextDate: string }[] }>().data).toMatchObject([{ id: RENT_ID, nextDate: '2026-12-05' }]);
        expect(second.statusCode).toBe(StatusCodes.OK);
        expect(database.operations).toEqual([{ id: `${RENT_ID}-20261105`, date: new Date('2026-11-05T12:00:00.000Z'), name: 'Loyer', description: null, categoryId: 'housing', location: null, amount: 900, currencyCode: 'EUR', rateToEuro: 1, isOnline: true, isRecurring: true, recurringId: RENT_ID }]);
        expect(database.recurring[0]?.generatedThrough).toBe('2026-11-05');
        expect(database.budgetState.upsert).toHaveBeenCalledOnce();

        await app.close();
    });

    it('skips the occurrences of a paused one instead of logging them', async () => {
        const { app, database } = await buildApp();

        database.recurring[0] = { ...rentRow(), isPaused: true };

        await app.inject({ method: 'GET', url: '/v1/budget/recurring' });

        expect(database.operations).toEqual([]);
        expect(database.recurring[0].generatedThrough).toBe('2026-11-05');
        expect(database.budgetState.upsert).not.toHaveBeenCalled();

        await app.close();
    });
});

describe('POST /v1/budget/recurring', () => {
    it('creates a recurring operation and logs its occurrences already due', async () => {
        const { app, database } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/budget/recurring', payload: newRecurring });

        expect(response.statusCode).toBe(StatusCodes.CREATED);
        expect(response.json<{ data: object }>().data).toMatchObject({ id: newRecurring.id, endDate: null, isPaused: false, nextDate: '2026-12-11' });
        expect(database.operations.map((operation) => operation.id)).toEqual([`${newRecurring.id}-20261011`, `${newRecurring.id}-20261111`]);

        await app.close();
    });

    it('refuses an id already taken, an unknown category, a day not in the calendar, an odd interval and an end before the start', async () => {
        const { app, database } = await buildApp();
        const payloads = [{ ...newRecurring, id: RENT_ID }, { ...newRecurring, categoryId: 'unknown' }, { ...newRecurring, firstDate: '2026-02-30' }, { ...newRecurring, intervalMonths: 2 }, { ...newRecurring, endDate: '2026-10-10' }];
        const codes: number[] = [];

        for (const payload of payloads) {
            codes.push((await app.inject({ method: 'POST', url: '/v1/budget/recurring', payload })).statusCode);
        }

        expect(codes).toEqual([StatusCodes.CONFLICT, StatusCodes.BAD_REQUEST, StatusCodes.BAD_REQUEST, StatusCodes.BAD_REQUEST, StatusCodes.BAD_REQUEST]);
        expect(database.budgetRecurringOperation.create).not.toHaveBeenCalled();

        await app.close();
    });
});

describe('PATCH /v1/budget/recurring/:recurringId', () => {
    it('changes what is sent and keeps the rest', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'PATCH', url: `/v1/budget/recurring/${RENT_ID}`, payload: { amount: 950, endDate: '2027-06-30' } });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: object }>().data).toMatchObject({ name: 'Loyer', amount: 950, endDate: '2027-06-30' });

        await app.close();
    });

    it('refuses an end before the start and an unknown recurring operation', async () => {
        const { app } = await buildApp();
        const early = await app.inject({ method: 'PATCH', url: `/v1/budget/recurring/${RENT_ID}`, payload: { endDate: '2026-08-31' } });
        const unknown = await app.inject({ method: 'PATCH', url: '/v1/budget/recurring/missing', payload: { amount: 1 } });

        expect(early.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(unknown.statusCode).toBe(StatusCodes.NOT_FOUND);

        await app.close();
    });
});

describe('DELETE /v1/budget/recurring/:recurringId', () => {
    it('deletes it and keeps its occurrences, no longer linked to it', async () => {
        const { app, database } = await buildApp();

        database.operations.push({ id: `${RENT_ID}-20261005`, date: new Date('2026-10-05T12:00:00.000Z'), rateToEuro: 1, isRecurring: true, recurringId: RENT_ID });

        const response = await app.inject({ method: 'DELETE', url: `/v1/budget/recurring/${RENT_ID}` });
        const again = await app.inject({ method: 'DELETE', url: `/v1/budget/recurring/${RENT_ID}` });

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT);
        expect(again.statusCode).toBe(StatusCodes.NOT_FOUND);
        expect(database.recurring).toEqual([]);
        expect(database.operations[0]).toMatchObject({ isRecurring: true, recurringId: null });

        await app.close();
    });
});
