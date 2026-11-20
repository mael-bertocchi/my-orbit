import { diffDocuments, sendWrite } from 'modules/budget/budget-sync';
import { RequestError } from 'utils/request';
import { describe, expect, it, vi } from 'vitest';

import { unusedServer } from '../../support/budget-server';
import { document } from '../../support/fixtures';

describe('diffDocuments', () => {
    it('writes nothing when the budgets match', () => {
        expect(diffDocuments(document(), document())).toEqual([]);
    });

    it('writes only the entries that differ, categories first', () => {
        const stored = document();
        const edited = document({ budget: { monthlyLimit: 2500 } });

        edited.categories[0] = { ...edited.categories[0], monthlyLimit: 999 };

        expect(diffDocuments(stored, edited).map((write) => write.kind)).toEqual(['storeCategory', 'storeSettings']);
    });

    it('stores every category whose place in the list moved', () => {
        const stored = document();
        const edited = document({ categories: [stored.categories[1], stored.categories[0], ...stored.categories.slice(2)] });

        expect(diffDocuments(stored, edited)).toEqual([
            { kind: 'storeCategory', category: stored.categories[1], position: 0 },
            { kind: 'storeCategory', category: stored.categories[0], position: 1 }
        ]);
    });

    it('freezes a newly sealed month', () => {
        const budget = { monthlyLimit: 3000, categoryLimits: { groceries: 400 } };

        expect(diffDocuments(document(), document({ budgetHistory: { '2026-08': budget } }))).toEqual([{ kind: 'storeMonth', month: '2026-08', budget }]);
    });
});

describe('sendWrite', () => {
    it('counts deleting what is already gone as done', async () => {
        const api = { ...unusedServer(), deleteOperation: vi.fn(() => Promise.reject(new RequestError(404, 'Unknown operation'))) };

        await expect(sendWrite(api, { kind: 'deleteOperation', id: 'A' })).resolves.toBe(true);
    });

    it('lets an unreachable server fail the send, to be tried again', async () => {
        const api = { ...unusedServer(), storeSettings: vi.fn(() => Promise.reject(new RequestError(0, "Can't reach the server."))) };

        await expect(sendWrite(api, { kind: 'storeSettings', monthlyLimit: 2500 })).rejects.toBeInstanceOf(RequestError);
    });
});
