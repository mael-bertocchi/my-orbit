import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import { repriceRecent, wholeDays } from 'src/modules/budget/operations/operations-service';
import { BANK_MARKUP } from 'src/modules/budget/rates/rates-service';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

/**
 * @function days
 * @description Operations on the days given, one each, the latest first
 */
function days(...list: string[]): { day: string }[] {
    return list.map((day) => ({ day }));
}

describe('wholeDays', () => {
    it('leaves the day the next operation falls on for the next page', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-19', '2026-11-19', '2026-11-19'), 3)).toEqual(days('2026-11-20'));
    });

    it('keeps the whole page when the next operation starts another day', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-19', '2026-11-18'), 2)).toEqual(days('2026-11-20', '2026-11-19'));
    });

    it('keeps everything read once there is nothing past the limit', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-19'), 3)).toEqual(days('2026-11-20', '2026-11-19'));
    });

    it('cuts a single day longer than the limit, so the list can move on', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-20', '2026-11-20'), 2)).toEqual(days('2026-11-20', '2026-11-20'));
    });
});

describe('repriceRecent', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('prices again only the recent operations whose published rate moved', async () => {
        vi.useFakeTimers({ now: new Date('2026-11-20T12:00:00Z') });

        const published = 0.0007 * (1 + BANK_MARKUP);
        const findMany = vi.fn(() => Promise.resolve([
            { id: 'moved', day: '2026-11-18', currencyCode: 'KRW', rateToEuro: 0.0006 },
            { id: 'kept', day: '2026-11-19', currencyCode: 'KRW', rateToEuro: published }
        ]));
        const snapshot = (day: string): object => ({ id: day, quoteDate: day, fetchedAt: new Date('2026-11-20T11:00:00Z'), rates: { EUR: 1, KRW: 0.0007 } });
        const update = vi.fn(() => Promise.resolve({}));
        const transaction = { budgetOperation: { update }, budgetState: { upsert: vi.fn(() => Promise.resolve({ revision: 2 })) } };
        const prisma = standIn<PrismaClient>({
            budgetOperation: { findMany },
            budgetExchangeRateSnapshot: { findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(snapshot(where.id))) },
            $transaction: (work: (client: unknown) => Promise<unknown>) => work(transaction)
        });

        await repriceRecent(prisma, standIn<FastifyBaseLogger>({ warn: vi.fn() }), '2026-11-20');

        expect(findMany).toHaveBeenCalledWith({ where: { deletedAt: null, day: { gte: '2026-11-13' }, currencyCode: { not: 'EUR' } } });
        expect(update).toHaveBeenCalledOnce();
        expect(update).toHaveBeenCalledWith({ where: { id: 'moved' }, data: { rateToEuro: published } });
    });
});
