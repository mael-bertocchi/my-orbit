import type { BudgetServer } from 'modules/budget/budget-models';
import { vi } from 'vitest';

/**
 * @function unusedServer
 * @description A budget server whose every route fails, for a test to override the few it relies on.
 */
export function unusedServer(): BudgetServer {
    const unused = (): Promise<never> => Promise.reject(new Error('Not used'));

    return {
        getState: vi.fn(unused),
        createOperation: vi.fn(unused),
        updateOperation: vi.fn(unused),
        deleteOperation: vi.fn(unused),
        restoreOperation: vi.fn(unused),
        deleteEveryOperation: vi.fn(unused),
        storeCategory: vi.fn(unused),
        deleteCategory: vi.fn(unused),
        storeSettings: vi.fn(unused),
        storeMonth: vi.fn(unused),
        deleteMonth: vi.fn(unused),
        getRates: vi.fn(unused),
        getRatesOn: vi.fn(unused)
    };
}
