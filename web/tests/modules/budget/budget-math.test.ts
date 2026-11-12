import {
    categorySpends,
    dayGroups,
    daysLeft,
    isPastMonth,
    lastUsedCurrency,
    latestLocation,
    locationSuggestions,
    nameSuggestions,
    liveBudget,
    monthlyBudgetFor,
    recentLocations,
    sealCompletedMonths,
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
    const operations = [
        operation({ id: 'a', date: new Date(2026, 8, 3), amount: 1000 }),
        operation({ id: 'b', date: new Date(2026, 8, 20), amount: 100, currencyCode: 'USD', rateToEuro: 0.9 }),
        operation({ id: 'c', date: new Date(2026, 7, 31), amount: 500 })
    ];

    it('counts the month in euros and spreads what is left over the days left', () => {
        const figures = summary(operations, september, liveBudget(document(operations)), NOW);

        expect(figures.spent).toBeCloseTo(1090);
        expect(figures.left).toBeCloseTo(1910);
        expect(figures.daysLeft).toBe(4);
        expect(figures.perDay).toBeCloseTo(477.5);
    });

    it('allows nothing per day once overspent', () => {
        const figures = summary(operations, september, { monthlyLimit: 1000, categoryLimits: {} }, NOW);

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
        const operations = [operation({ id: 'a', date: NOW, categoryId: 'coffee', amount: 60 })];
        const coffee = categorySpends(operations, document().categories, september, liveBudget(document(operations))).find((spend) => spend.category.id === 'coffee');

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

describe('sealCompletedMonths', () => {
    it('freezes the live budget onto every finished month without touching sealed ones', () => {
        const sealed = { monthlyLimit: 2000, categoryLimits: {} };
        const budget = document([operation({ id: 'a', date: new Date(2026, 5, 10) })], { budgetHistory: { '2026-07': sealed } });
        const result = sealCompletedMonths(budget, NOW);

        expect(Object.keys(result.budgetHistory).sort()).toEqual(['2026-06', '2026-07', '2026-08']);
        expect(result.budgetHistory['2026-07']).toBe(sealed);
        expect(monthlyBudgetFor(result, new Date(2026, 5, 1)).monthlyLimit).toBe(3000);
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
        const budget = document([], { budgetHistory: { '2026-07': sealed, '2026-08': sealed } });
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

describe('suggestions', () => {
    const operations = [
        operation({ id: 'a', date: new Date(2026, 8, 20), location: 'Lidl', currencyCode: 'CHF' }),
        operation({ id: 'b', date: new Date(2026, 8, 25), location: 'Netflix', isOnline: true, currencyCode: 'USD' }),
        operation({ id: 'c', date: new Date(2026, 8, 24), location: 'lidl' })
    ];

    it('suggests the latest in-person place', () => {
        expect(latestLocation(operations)).toBe('lidl');
    });

    it('lists each place once, most recent first', () => {
        expect(recentLocations(operations)).toEqual(['Netflix', 'lidl']);
    });

    it('defaults to the currency of the latest operation', () => {
        expect(lastUsedCurrency(operations)).toBe('USD');
        expect(lastUsedCurrency([])).toBe('EUR');
    });
});

describe('nameSuggestions', () => {
    const operations = [
        operation({ id: 'a', name: 'Monoprix', date: new Date(2026, 8, 1) }),
        operation({ id: 'b', name: 'monoprix', date: new Date(2026, 8, 3) }),
        operation({ id: 'c', name: 'Café Mono', date: new Date(2026, 8, 5) }),
        operation({ id: 'd', name: 'Moniteur', date: new Date(2026, 8, 6) }),
        operation({ id: 'e', name: 'Lidl', date: new Date(2026, 8, 7) })
    ];

    it('suggests the names starting with what is typed first, the most used leading, each once as last written', () => {
        expect(nameSuggestions(operations, 'mon')).toEqual(['monoprix', 'Moniteur', 'Café Mono']);
    });

    it('ignores case and accents', () => {
        expect(nameSuggestions(operations, 'CAFE')).toEqual(['Café Mono']);
    });

    it('suggests nothing for nothing typed, nor the name typed in full', () => {
        expect(nameSuggestions(operations, '  ')).toEqual([]);
        expect(nameSuggestions(operations, 'Lidl')).toEqual([]);
    });
});

describe('locationSuggestions', () => {
    const operations = [
        operation({ id: 'a', location: 'Saint-Étienne', date: new Date(2026, 8, 1) }),
        operation({ id: 'b', location: 'Paris', date: new Date(2026, 8, 3) }),
        operation({ id: 'c', location: 'Étretat', date: new Date(2026, 8, 5) })
    ];

    it('suggests the earlier places matching what is typed, those starting with it first', () => {
        expect(locationSuggestions(operations, 'et')).toEqual(['Étretat', 'Saint-Étienne']);
        expect(locationSuggestions(operations, 'pa')).toEqual(['Paris']);
        expect(locationSuggestions(operations, 'paris')).toEqual([]);
    });
});
