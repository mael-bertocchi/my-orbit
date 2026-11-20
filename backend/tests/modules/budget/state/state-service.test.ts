import type { PrismaClient } from 'prisma/generated/prisma/client';
import { bumpRevision, pullState } from 'src/modules/budget/state/state-service';
import { describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

describe('pullState', () => {
    it('counts the operations outside the trash instead of sending them', async () => {
        const findMany = vi.fn(() => Promise.resolve([]));
        const count = vi.fn(() => Promise.resolve(42));
        const prisma = standIn<PrismaClient>({
            budgetCategory: { findMany },
            budgetOperation: { count },
            budgetHistory: { findMany },
            budgetState: { findUnique: vi.fn(() => Promise.resolve({ id: 'owner', monthlyLimit: 2500, revision: 7 })) }
        });

        const state = await pullState(prisma);

        expect(count).toHaveBeenCalledWith({ where: { deletedAt: null } });
        expect(state).toEqual({ categories: [], budget: { monthlyLimit: 2500 }, budgetHistory: {}, operationCount: 42, revision: 7 });
    });
});

describe('bumpRevision', () => {
    it('moves the revision on, creating the budget row on the first write', async () => {
        const upsert = vi.fn(() => Promise.resolve({ id: 'owner', monthlyLimit: 3000, revision: 1 }));
        const revision = await bumpRevision(standIn({ budgetState: { upsert } }));

        expect(revision).toBe(1);
        expect(upsert).toHaveBeenCalledWith({
            where: { id: 'owner' },
            update: { revision: { increment: 1 } },
            create: { id: 'owner', monthlyLimit: 3000, revision: 1 }
        });
    });
});
