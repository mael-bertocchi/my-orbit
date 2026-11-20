import {
    categorySpends,
    dayGroups,
    daysLeft,
    isPastMonth,
    liveBudget,
    summary,
    toDispatch,
    withMonthlyBudget
} from 'modules/budget/budget-math';
import { describe, expect, it } from 'vitest';

import { document, NOW, operation } from '../../support/fixtures';

/**
 * @constant september
 * @description The month most tests measure
 */
const september = new Date(2026, 8, 1);

describe('summary', () => {
    it('spreads what is left of the month over the days left', () => {
        const figures = summary(1090, september, liveBudget(document()), NOW);

        expect(figures.spent).toBeCloseTo(1090);
        expect(figures.left).toBeCloseTo(1910);
        expect(figures.daysLeft).toBe(4);
        expect(figures.perDay).toBeCloseTo(477.5);
    });

    it('allows nothing per day once overspent', () => {
        const figures = summary(1090, september, { monthlyLimit: 1000, categoryLimits: {} }, NOW);

        expect(figures.left).toBeLessThan(0);
        expect(figures.perDay).toBe(0);
        expect(figures.progress).toBe(1);
    });

    it('leaves no days in a past month and every day in a future one', () => {
        expect(daysLeft(new Date(2026, 7, 1), NOW)).toBe(0);
        expect(daysLeft(new Date(2026, 9, 1), NOW)).toBe(31);
    });
});

describe('categories', () => {
    it('flags a category past its limit', () => {
        const coffee = categorySpends({ coffee: 60 }, document().categories, liveBudget(document())).find((spend) => spend.category.id === 'coffee');

        expect(coffee?.isOverBudget).toBe(true);
        expect(coffee?.progress).toBe(1);
    });

    it('reports what the limits leave of the budget', () => {
        expect(toDispatch(document().categories, liveBudget(document()))).toBe(3000 - 1560);
    });
});

describe('dayGroups', () => {
    it('groups by day, latest first, with day totals', () => {
        const groups = dayGroups([
            operation({ id: 'a', date: new Date(2026, 8, 26, 9), amount: 5 }),
            operation({ id: 'b', date: new Date(2026, 8, 27, 9), amount: 7 }),
            operation({ id: 'c', date: new Date(2026, 8, 26, 18), amount: 3 })
        ]);

        expect(groups.map((group) => group.spent)).toEqual([7, 8]);
        expect(groups[1]?.operations.map((entry) => entry.id)).toEqual(['c', 'a']);
    });
});

describe('withMonthlyBudget', () => {
    const edit = { monthlyLimit: 1500, categoryLimits: { restaurant: 200, groceries: null } };

    it('tells a past month from the current one', () => {
        expect(isPastMonth(new Date(2026, 7, 1), NOW)).toBe(true);
        expect(isPastMonth(september, NOW)).toBe(false);
    });

    it('changes only the past month edited, keeping the limits left empty', () => {
        const sealed = { monthlyLimit: 2000, categoryLimits: { restaurant: 100, groceries: 300 } };
        const budget = document({ budgetHistory: { '2026-07': sealed, '2026-08': sealed } });
        const result = withMonthlyBudget(budget, new Date(2026, 6, 1), edit, NOW);

        expect(result.budgetHistory['2026-07']).toEqual({ monthlyLimit: 1500, categoryLimits: { restaurant: 200, groceries: 300 } });
        expect(result.budgetHistory['2026-08']).toBe(sealed);
        expect(result.budget).toEqual(budget.budget);
        expect(result.categories).toEqual(budget.categories);
    });

    it('gives a past month without a budget its own, starting from the live one', () => {
        const budget = document();
        const result = withMonthlyBudget(budget, new Date(2026, 6, 1), edit, NOW);
        const live = liveBudget(budget);

        expect(result.budgetHistory['2026-07']).toEqual({ monthlyLimit: 1500, categoryLimits: { ...live.categoryLimits, restaurant: 200 } });
        expect(liveBudget(result)).toEqual(live);
    });

    it('changes the live budget from the current month on', () => {
        const budget = document();
        const result = withMonthlyBudget(budget, september, edit, NOW);

        expect(result.budget.monthlyLimit).toBe(1500);
        expect(liveBudget(result).categoryLimits['restaurant']).toBe(200);
        expect(result.budgetHistory).toEqual({});
    });
});
