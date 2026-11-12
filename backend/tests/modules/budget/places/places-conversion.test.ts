import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import { convertWrittenPlaces } from 'src/modules/budget/places/places-conversion';
import { forgetPlaces } from 'src/modules/budget/places/places-service';
import type { Maybe } from 'src/shared/models';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubCities, stubGeoapify } from '../../../support/geoapify';
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

/**
 * @interface StateWrite
 * @description What the conversion writes of the budget's state
 */
interface StateWrite {
    update: Record<string, unknown>; /*!< The fields changed */
}

/**
 * @interface ConversionFixture
 * @description A budget stand-in for the conversion, with what it records
 */
interface ConversionFixture {
    prisma: PrismaClient; /*!< The stand-in */
    updateOperations: ReturnType<typeof vi.fn>; /*!< Records the operations given a city */
    upsertState: Mock<(write: StateWrite) => Promise<{ revision: number }>>; /*!< Records the budget's state written */
}

/**
 * @function conversionFixture
 * @description A budget whose operations were written `seoul` and `Chez Paul`, and whose recurring ones `seoul`.
 *
 * @param {Maybe<Date>} convertedAt When the places were already all looked up, null when never.
 *
 * @returns {ConversionFixture} The stand-in and what it records.
 */
function conversionFixture(convertedAt: Maybe<Date>): ConversionFixture {
    const updateOperations = vi.fn(({ where }: { where: { location: string } }) => Promise.resolve({ count: where.location !== 'seoul' ? 0 : 3 }));
    const upsertState = vi.fn((_write: StateWrite) => Promise.resolve({ revision: 2 }));
    const client = {
        budgetOperation: { findMany: vi.fn(() => Promise.resolve([{ location: 'seoul' }, { location: 'Chez Paul' }])), updateMany: updateOperations },
        budgetRecurringOperation: { findMany: vi.fn(() => Promise.resolve([{ location: 'seoul' }])), updateMany: vi.fn(() => Promise.resolve({ count: 0 })) },
        budgetPlace: { upsert: vi.fn(() => Promise.resolve(null)) },
        budgetState: { findUnique: vi.fn(() => Promise.resolve({ placesConvertedAt: convertedAt })), upsert: upsertState }
    };
    const prisma = standIn<PrismaClient>({ ...client, $transaction: async (work: unknown) => (Array.isArray(work) ? await Promise.all(work) : await standIn<(transaction: typeof client) => Promise<unknown>>(work)(client)) });

    return { prisma, updateOperations, upsertState };
}

/**
 * @function runConversion
 * @description Runs the conversion to its end, its pauses skipped.
 *
 * @param {PrismaClient} prisma The budget.
 *
 * @returns {Promise<void>} Resolves once it is over.
 */
async function runConversion(prisma: PrismaClient): Promise<void> {
    const logger = standIn<FastifyBaseLogger>({ info: vi.fn(), error: vi.fn() });
    const conversion = convertWrittenPlaces({ prisma, variables: testVariables(), logger });

    await vi.runAllTimersAsync();
    await conversion;
}

describe('convertWrittenPlaces', () => {
    it('gives each place written by hand the city it names, keeps the others, moves the revision on and remembers it is done', async () => {
        stubCities([{ id: 'R2297418', en: 'Seoul', fr: 'Séoul' }]);
        const { prisma, updateOperations, upsertState } = conversionFixture(null);

        await runConversion(prisma);

        expect(updateOperations).toHaveBeenCalledOnce();
        expect(updateOperations).toHaveBeenCalledWith({ where: { placeId: null, location: 'seoul' }, data: { placeId: 'R2297418' } });
        expect(upsertState).toHaveBeenCalledTimes(2);
        expect(upsertState.mock.lastCall?.[0].update.placesConvertedAt).toBeInstanceOf(Date);
    });

    it('does nothing once the places were all looked up', async () => {
        const calls = stubGeoapify(() => []);
        const { prisma, updateOperations, upsertState } = conversionFixture(new Date());

        await runConversion(prisma);

        expect(calls).toHaveLength(0);
        expect(updateOperations).not.toHaveBeenCalled();
        expect(upsertState).not.toHaveBeenCalled();
    });

    it('stops at the first place when Geoapify turns it away, and tries again later', async () => {
        const calls = stubGeoapify(() => [], 503);
        const { prisma, updateOperations, upsertState } = conversionFixture(null);

        await runConversion(prisma);

        expect(calls).toHaveLength(2);
        expect(updateOperations).not.toHaveBeenCalled();
        expect(upsertState).not.toHaveBeenCalled();
    });
});
