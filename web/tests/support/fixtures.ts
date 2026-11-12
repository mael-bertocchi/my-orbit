import { DEFAULT_CATEGORIES } from 'modules/budget/budget-categories';
import type { BudgetDocument, Operation } from 'modules/budget/budget-models';

/**
 * @constant NOW
 * @description The instant every test treats as now: a Sunday afternoon in Paris.
 */
export const NOW = new Date(2026, 8, 27, 15, 30, 0);

/**
 * @function operation
 * @description Builds an operation, in euros unless told otherwise.
 */
export function operation(overrides: Partial<Operation> & Pick<Operation, 'id' | 'date'>): Operation {
    return {
        name: 'Operation',
        description: null,
        categoryId: 'groceries',
        location: null,
        amount: 10,
        currencyCode: 'EUR',
        rateToEuro: 1,
        isOnline: false,
        ...overrides
    };
}

/**
 * @function document
 * @description Builds a budget document with the default categories.
 */
export function document(operations: Operation[] = [], overrides: Partial<BudgetDocument> = {}): BudgetDocument {
    return {
        categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
        operations,
        budget: { monthlyLimit: 3000 },
        budgetHistory: {},
        ...overrides
    };
}
