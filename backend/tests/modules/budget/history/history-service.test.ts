import type { PrismaClient } from 'prisma/generated/prisma/client';
import { sealCompletedMonths } from 'src/modules/budget/history/history-service';
import { describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

/**
 * @function budgetWith
 * @description A database whose first operation falls on the day given and whose frozen months are those given,
 * recording what gets frozen.
 */
function budgetWith(firstDay: string, sealed: string[]): { prisma: PrismaClient; createMany: ReturnType<typeof vi.fn> } {
    const createMany = vi.fn(() => Promise.resolve({ count: 0 }));
    const transaction = { budgetHistory: { createMany }, budgetState: { upsert: vi.fn(() => Promise.resolve({ revision: 1 })) } };
    const prisma = standIn<PrismaClient>({
        budgetOperation: { aggregate: vi.fn(() => Promise.resolve({ _min: { day: firstDay } })) },
        budgetHistory: { findMany: vi.fn(() => Promise.resolve(sealed.map((month) => ({ month })))) },
        budgetCategory: { findMany: vi.fn(() => Promise.resolve([{ id: 'groceries', monthlyLimit: 400 }])) },
        budgetState: { findUnique: vi.fn(() => Promise.resolve({ id: 'owner', monthlyLimit: 2500 })) },
        $transaction: (work: (client: unknown) => Promise<unknown>) => work(transaction)
    });

    return { prisma, createMany };
}

describe('sealCompletedMonths', () => {
    it('freezes every ended month left open with the budget as it stands, and leaves the frozen ones and the current one alone', async () => {
        const { prisma, createMany } = budgetWith('2026-08-14', ['2026-09']);

        await sealCompletedMonths(prisma, '2026-11-20');

        expect(createMany).toHaveBeenCalledWith({
            data: [
                { month: '2026-08', monthlyLimit: 2500, categoryLimits: { groceries: 400 } },
                { month: '2026-10', monthlyLimit: 2500, categoryLimits: { groceries: 400 } }
            ],
            skipDuplicates: true
        });
    });

    it('writes nothing once every ended month is frozen', async () => {
        const { prisma, createMany } = budgetWith('2026-10-02', ['2026-10']);

        await sealCompletedMonths(prisma, '2026-11-20');

        expect(createMany).not.toHaveBeenCalled();
    });
});
