import type { PrismaClient } from 'prisma/generated/prisma/client';
import { bumpRevision, pullState } from 'src/modules/budget/state/state-service';
import { describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

describe('pullState', () => {
    it('leaves the operations in the trash out of the document', async () => {
        const findMany = vi.fn(() => Promise.resolve([]));
        const prisma = standIn<PrismaClient>({
            budgetCategory: { findMany },
            budgetOperation: { findMany },
            budgetHistory: { findMany },
            budgetState: { findUnique: vi.fn(() => Promise.resolve({ id: 'owner', monthlyLimit: 2500, revision: 7 })) }
        });

        const state = await pullState(prisma);

        expect(findMany.mock.calls[1]).toEqual([{ where: { deletedAt: null }, orderBy: { date: 'desc' }, include: { place: true } }]);
        expect(state).toMatchObject({ budget: { monthlyLimit: 2500 }, revision: 7 });
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
