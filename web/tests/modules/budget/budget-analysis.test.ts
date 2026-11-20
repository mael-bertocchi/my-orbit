import { compareMonth, isNotable, monthTotals, spendingHabits } from 'modules/budget/budget-analysis';
import type { AnalysisFigures } from 'modules/budget/budget-models';
import { describe, expect, it } from 'vitest';

import { document } from '../../support/fixtures';

describe('compareMonth', () => {
    it('measures each category against its usual from the figures the server sent, the largest rise first', () => {
        const comparison = compareMonth(document(), { referenceCount: 2, current: { spent: 140, byCategory: { restaurant: 140 } }, usual: { spent: 80, byCategory: { restaurant: 50, groceries: 30 } } });
        const restaurant = comparison.categories.find((entry) => entry.category.id === 'restaurant');
        const groceries = comparison.categories.find((entry) => entry.category.id === 'groceries');

        expect(comparison.referenceCount).toBe(2);
        expect(comparison.change).toBeCloseTo(0.75);
        expect(restaurant?.change).toBeCloseTo(1.8);
        expect(groceries?.change).toBeCloseTo(-1);
        expect(comparison.categories.map((entry) => entry.category.id)).toEqual(['restaurant', 'groceries']);
    });

    it('has nothing to compare against without history', () => {
        const comparison = compareMonth(document(), { referenceCount: 0, current: { spent: 10, byCategory: { groceries: 10 } }, usual: { spent: 0, byCategory: {} } });

        expect(comparison.change).toBeNull();
        expect(comparison.categories[0]?.change).toBeNull();
    });
});

describe('isNotable', () => {
    it('shows only the changes worth it: something spent, at least 15% and 10 euros off usual', () => {
        const category = document().categories[0];

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

/**
 * @constant FIGURES
 * @description What the server sends for the Analysis tab
 */
const FIGURES: AnalysisFigures = {
    today: '2026-09-27',
    months: [
        { month: '2026-07', spent: 100, byCategory: { restaurant: 100 }, isCurrent: false },
        { month: '2026-09', spent: 40, byCategory: { groceries: 40 }, isCurrent: true }
    ],
    habits: {
        since: '2026-06-30',
        weekdays: [{ weekday: 1, average: 3 }],
        online: 39,
        inPerson: 39,
        places: [{ place: { id: 'R2297418', nameEn: 'Seoul', nameFr: 'Séoul' }, location: 'Seoul', spent: 26, count: 1 }, { place: null, location: 'Le Comptoir', spent: 13, count: 1 }]
    }
};

describe('monthTotals', () => {
    it('measures each month against its own budget', () => {
        const totals = monthTotals(document({ budgetHistory: { '2026-07': { monthlyLimit: 1500, categoryLimits: {} } } }), FIGURES);

        expect(totals.map((total) => total.month)).toEqual([new Date(2026, 6, 1), new Date(2026, 8, 1)]);
        expect(totals[0]).toMatchObject({ spent: 100, limit: 1500, isCurrent: false });
        expect(totals[1]).toMatchObject({ spent: 40, limit: 3000, isCurrent: true });
    });
});

describe('spendingHabits', () => {
    it('names each place in the page\'s language, else as written', () => {
        const habits = spendingHabits(FIGURES);

        expect(habits.since).toEqual(new Date(2026, 5, 30));
        expect(habits.places.map((place) => place.name)).toEqual(['Seoul', 'Le Comptoir']);
    });
});
