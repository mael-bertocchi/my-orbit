import { compareMonth, isNotable, monthTotals, referenceMonths, spendingHabits } from 'modules/budget/budget-analysis';
import { describe, expect, it } from 'vitest';

import { document, NOW, operation } from '../../support/fixtures';

describe('referenceMonths', () => {
    it('takes the latest past months holding operations, six at most', () => {
        const operations = Array.from({ length: 9 }, (_, index) => operation({ id: `m${index}`, date: new Date(2026, index, 10) }));
        const months = referenceMonths(operations, new Date(2026, 8, 1));

        expect(months.map((month) => month.getMonth())).toEqual([7, 6, 5, 4, 3, 2]);
    });
});

describe('compareMonth', () => {
    it('measures the month so far against the same day of the past months', () => {
        const operations = [
            operation({ id: 'now', date: new Date(2026, 8, 10), amount: 140, categoryId: 'restaurant' }),
            operation({ id: 'aug', date: new Date(2026, 7, 12), amount: 100, categoryId: 'restaurant' }),
            operation({ id: 'aug-late', date: new Date(2026, 7, 30), amount: 500, categoryId: 'restaurant' }),
            operation({ id: 'jul', date: new Date(2026, 6, 2), amount: 60, categoryId: 'groceries' })
        ];
        const comparison = compareMonth(document(operations), NOW);
        const restaurant = comparison.categories.find((entry) => entry.category.id === 'restaurant');
        const groceries = comparison.categories.find((entry) => entry.category.id === 'groceries');

        expect(comparison.referenceCount).toBe(2);
        expect(comparison.spent).toBeCloseTo(140);
        expect(comparison.usual).toBeCloseTo(80);
        expect(comparison.change).toBeCloseTo(0.75);
        expect(restaurant?.usual).toBeCloseTo(50);
        expect(restaurant?.change).toBeCloseTo(1.8);
        expect(groceries?.change).toBeCloseTo(-1);
        expect(comparison.categories[0]?.category.id).toBe('restaurant');
    });

    it('has nothing to compare against without history', () => {
        const comparison = compareMonth(document([operation({ id: 'a', date: new Date(2026, 8, 2) })]), NOW);

        expect(comparison.referenceCount).toBe(0);
        expect(comparison.change).toBeNull();
        expect(comparison.categories[0]?.change).toBeNull();
    });
});

describe('isNotable', () => {
    it('shows only the changes worth it: something spent, at least 15% and 10 euros off usual', () => {
        const category = document([]).categories[0];

        if (category === undefined) {
            throw new Error('No category');
        }

        expect(isNotable({ category, spent: 0, usual: 80, change: -1 })).toBe(false);
        expect(isNotable({ category, spent: 30, usual: 20, change: 0.5 })).toBe(true);
        expect(isNotable({ category, spent: 6, usual: 4, change: 0.5 })).toBe(false);
        expect(isNotable({ category, spent: 105, usual: 100, change: 0.05 })).toBe(false);
        expect(isNotable({ category, spent: 12, usual: 0, change: null })).toBe(true);
        expect(isNotable({ category, spent: 4, usual: 0, change: null })).toBe(false);
    });
});

describe('monthTotals', () => {
    it('sums each month since the first operation, against its budget, the current one under way', () => {
        const operations = [
            operation({ id: 'jul', date: new Date(2026, 6, 4), amount: 100, categoryId: 'restaurant' }),
            operation({ id: 'sep', date: new Date(2026, 8, 2), amount: 40 })
        ];
        const totals = monthTotals(document(operations, { budgetHistory: { '2026-07': { monthlyLimit: 1500, categoryLimits: {} } } }), NOW);

        expect(totals.map((total) => total.month.getMonth())).toEqual([6, 7, 8]);
        expect(totals[0]).toMatchObject({ spent: 100, limit: 1500, byCategory: { restaurant: 100 }, isCurrent: false });
        expect(totals[1]?.spent).toBe(0);
        expect(totals[2]).toMatchObject({ spent: 40, limit: 3000, isCurrent: true });
    });

    it('covers twelve months at most', () => {
        const totals = monthTotals(document([operation({ id: 'old', date: new Date(2024, 0, 1) })]), NOW);

        expect(totals).toHaveLength(12);
        expect(totals[0]?.month).toEqual(new Date(2025, 9, 1));
    });
});

describe('spendingHabits', () => {
    it('spreads the last ninety days over the weekdays, online and in person, and the places, recurring left out', () => {
        const operations = [
            operation({ id: 'sat', date: new Date(2026, 8, 26, 12), amount: 26, location: 'Le Comptoir' }),
            operation({ id: 'sat2', date: new Date(2026, 8, 19, 12), amount: 13, location: 'le comptoir ' }),
            operation({ id: 'web', date: new Date(2026, 8, 22, 12), amount: 39, isOnline: true }),
            operation({ id: 'rent', date: new Date(2026, 8, 1), amount: 850, recurringId: 'rent' }),
            operation({ id: 'old', date: new Date(2026, 4, 1), amount: 500 })
        ];
        const habits = spendingHabits(document(operations), NOW);
        const saturday = habits.weekdays.find((entry) => entry.weekday === 6);

        expect(habits.weekdays.map((entry) => entry.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
        expect(saturday?.average).toBeCloseTo(39 / 13);
        expect(habits.online).toBe(39);
        expect(habits.inPerson).toBe(39);
        expect(habits.places).toEqual([{ name: 'Le Comptoir', spent: 39, count: 2 }]);
    });
});
