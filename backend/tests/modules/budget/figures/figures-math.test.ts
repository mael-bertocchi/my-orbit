import { compareMonth, latestPlace, monthTotals, nameSuggestions, shiftDay, shiftMonth, spendingHabits } from 'src/modules/budget/figures/figures-math';
import type { OperationRow } from 'src/modules/budget/places/places-service';
import { describe, expect, it } from 'vitest';

/**
 * @function row
 * @description An operation in the budget, in euros unless said otherwise
 */
function row(fields: Partial<OperationRow> & Pick<OperationRow, 'day' | 'amount'>): OperationRow {
    return {
        id: `${fields.day}-${String(fields.amount)}`,
        time: '12:00',
        date: null,
        name: 'Coffee',
        description: null,
        categoryId: 'coffee',
        location: null,
        placeId: null,
        place: null,
        currencyCode: 'EUR',
        rateToEuro: 1,
        isOnline: false,
        recurringId: null,
        deletedAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...fields
    };
}

describe('dates', () => {
    it('moves across months and years', () => {
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
        expect(shiftMonth('2026-11', 2)).toBe('2027-01');
        expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    });
});

describe('compareMonth', () => {
    it('compares the month so far with the reference months by the same day', () => {
        const rows = [
            row({ day: '2026-11-05', amount: 30 }),
            row({ day: '2026-11-25', amount: 999 }),
            row({ day: '2026-10-03', amount: 10 }),
            row({ day: '2026-10-20', amount: 500 }),
            row({ day: '2026-09-01', amount: 30, categoryId: 'rent' })
        ];
        const comparison = compareMonth(rows, '2026-11-10');

        expect(comparison.referenceCount).toBe(2);
        expect(comparison.current).toEqual({ spent: 30, byCategory: { coffee: 30 } });
        expect(comparison.usual).toEqual({ spent: 20, byCategory: { coffee: 5, rent: 15 } });
    });
});

describe('monthTotals', () => {
    it('starts at the first operation and ends with the current month', () => {
        const totals = monthTotals([row({ day: '2026-09-14', amount: 12, rateToEuro: 0.5 })], '2026-11-02');

        expect(totals.map((total) => [total.month, total.spent, total.isCurrent])).toEqual([['2026-09', 6, false], ['2026-10', 0, false], ['2026-11', 0, true]]);
    });
});

describe('spendingHabits', () => {
    it('leaves recurring operations out and keeps the places in person', () => {
        const rows = [
            row({ day: '2026-11-09', amount: 20, location: 'Café' }),
            row({ day: '2026-11-08', amount: 40, isOnline: true }),
            row({ day: '2026-11-07', amount: 900, recurringId: 'rent' })
        ];
        const habits = spendingHabits(rows, '2026-11-10');

        expect(habits.since).toBe('2026-08-13');
        expect(habits.online).toBe(40);
        expect(habits.inPerson).toBe(20);
        expect(habits.places).toEqual([{ place: null, location: 'Café', spent: 20, count: 1 }]);
    });
});

describe('suggestions', () => {
    it('ranks names by match, then use, leaving the full name out', () => {
        const rows = [row({ day: '2026-11-01', amount: 1, name: 'Starbucks' }), row({ day: '2026-11-02', amount: 1, name: 'Starbucks' }), row({ day: '2026-11-03', amount: 1, name: 'Star' }), row({ day: '2026-11-04', amount: 1, name: 'Big Star' })];

        expect(nameSuggestions(rows, 'star')).toEqual(['Starbucks', 'Big Star']);
        expect(latestPlace(rows)).toBeNull();
    });
});
