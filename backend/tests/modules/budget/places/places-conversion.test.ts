import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import { convertWrittenPlaces } from 'src/modules/budget/places/places-conversion';
import { forgetPlaces } from 'src/modules/budget/places/places-service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubCities } from '../../../support/photon';
import { standIn } from '../../../support/stand-in';
import { testVariables } from '../../../support/variables';

beforeEach(() => {
    forgetPlaces();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('convertWrittenPlaces', () => {
    it('gives each place written by hand the city it names, keeps the others, and moves the revision on', async () => {
        stubCities([{ id: 'R2297418', en: 'Seoul', fr: 'Séoul' }]);

        const updateOperations = vi.fn(({ where }: { where: { location: string } }) => Promise.resolve({ count: where.location === 'seoul' ? 3 : 0 }));
        const updateRecurring = vi.fn(() => Promise.resolve({ count: 0 }));
        const revision = vi.fn(() => Promise.resolve({ revision: 2 }));
        const client = {
            budgetOperation: { findMany: vi.fn(() => Promise.resolve([{ location: 'seoul' }, { location: 'Chez Paul' }])), updateMany: updateOperations },
            budgetRecurringOperation: { findMany: vi.fn(() => Promise.resolve([{ location: 'seoul' }])), updateMany: updateRecurring },
            budgetPlace: { upsert: vi.fn(() => Promise.resolve(null)) },
            budgetState: { upsert: revision }
        };
        const prisma = standIn<PrismaClient>({ ...client, $transaction: async (work: unknown) => (Array.isArray(work) ? await Promise.all(work) : await standIn<(transaction: typeof client) => Promise<unknown>>(work)(client)) });
        const logger = standIn<FastifyBaseLogger>({ info: vi.fn(), error: vi.fn() });
        const conversion = convertWrittenPlaces({ prisma, variables: testVariables(), logger });

        await vi.runAllTimersAsync();
        await conversion;

        expect(updateOperations).toHaveBeenCalledOnce();
        expect(updateOperations).toHaveBeenCalledWith({ where: { placeId: null, location: 'seoul' }, data: { placeId: 'R2297418' } });
        expect(revision).toHaveBeenCalledOnce();
    });
});
