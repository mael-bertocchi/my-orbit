import { OperationSchema } from 'modules/budget/budget-models';
import budgetService from 'modules/budget/budget-service';
import { fetchWithAuthentication } from 'utils/request';
import { describe, expect, it, vi } from 'vitest';

import { operation } from '../../support/fixtures';

vi.mock('utils/request', () => ({ fetchWithAuthentication: vi.fn(() => Promise.resolve({})) }));

describe('budgetService', () => {
    it('sends the budget’s requests entry by entry under its own path, through the portal’s session', async () => {
        const lunch = operation({ id: 'A/B', date: new Date(2026, 9, 28, 23, 30, 12), description: undefined, updatedAt: new Date() });

        await budgetService.getState();
        await budgetService.createOperation(lunch);
        await budgetService.updateOperation(lunch);
        await budgetService.deleteOperation('A/B');
        await budgetService.storeCategory({ id: 'groceries', name: 'Groceries', symbol: 'cart', colorHex: 0x3ecf8e, monthlyLimit: 400 }, 2);
        await budgetService.deleteCategory('groceries');
        await budgetService.storeSettings(2500);
        await budgetService.storeMonth('2026-09', { monthlyLimit: 2500, categoryLimits: {} });
        await budgetService.deleteMonth('2026-09');
        await budgetService.getRates();
        await budgetService.getRatesOn('2026-10-12');

        const calls = vi.mocked(fetchWithAuthentication).mock.calls;

        expect(calls.map(([path, init]) => [path, init.method])).toEqual([
            ['/v1/budget/state', 'GET'],
            ['/v1/budget/operations', 'POST'],
            ['/v1/budget/operations/A%2FB', 'PATCH'],
            ['/v1/budget/operations/A%2FB', 'DELETE'],
            ['/v1/budget/categories/groceries', 'PUT'],
            ['/v1/budget/categories/groceries', 'DELETE'],
            ['/v1/budget/settings', 'PUT'],
            ['/v1/budget/history/2026-09', 'PUT'],
            ['/v1/budget/history/2026-09', 'DELETE'],
            ['/v1/budget/rates', 'GET'],
            ['/v1/budget/rates/2026-10-12', 'GET']
        ]);

        const created = calls[1]?.[1].body;
        const changed = calls[2]?.[1].body;
        const category = calls[4]?.[1].body;

        expect(typeof created !== 'string' ? null : JSON.parse(created)).toMatchObject({ id: 'A/B', description: null, day: '2026-10-28', time: '23:30' });
        expect(typeof created !== 'string' ? null : JSON.parse(created)).not.toHaveProperty('updatedAt');
        expect(typeof changed !== 'string' ? null : JSON.parse(changed)).not.toHaveProperty('id');
        expect(typeof category !== 'string' ? null : JSON.parse(category)).toEqual({ name: 'Groceries', symbol: 'cart', colorHex: 0x3ecf8e, monthlyLimit: 400, position: 2 });
    });

    it('reads an operation\'s day and time as the device\'s clock shows them', () => {
        const parsed = OperationSchema.parse({ id: 'a', day: '2026-10-28', time: '23:30', name: 'Lunch', categoryId: 'restaurant', amount: 12, currencyCode: 'EUR', rateToEuro: 1, isOnline: false });

        expect(parsed.date).toEqual(new Date(2026, 9, 28, 23, 30));
        expect(parsed).not.toHaveProperty('day');
    });
});
