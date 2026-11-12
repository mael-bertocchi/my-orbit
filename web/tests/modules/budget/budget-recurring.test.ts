import type { RecurringOperation } from 'modules/budget/budget-models';
import { dayOf, intervalLabel, isRunning, monthlyEuros, toRecurringFields } from 'modules/budget/budget-recurring';
import { describe, expect, it } from 'vitest';

/**
 * @function recurring
 * @description A monthly rent, running, with the fields a test changes
 */
function recurring(overrides: Partial<RecurringOperation> = {}): RecurringOperation {
    return { id: 'RENT', name: 'Loyer', description: null, categoryId: 'housing', location: null, amount: 900, currencyCode: 'EUR', isOnline: true, firstDate: '2026-09-05', intervalMonths: 1, endDate: null, isPaused: false, nextDate: '2026-12-05', ...overrides };
}

describe('toRecurringFields', () => {
    it('trims the texts, stores empty ones as none and drops the place of an online one', () => {
        const fields = toRecurringFields({ name: ' Netflix ', description: '  ', amount: 13.49, currencyCode: 'EUR', categoryId: 'fun', location: 'Paris', place: { id: 'R71525', nameEn: 'Paris', nameFr: 'Paris' }, isOnline: true, firstDate: '2026-11-11', intervalMonths: 1, endDate: null, isPaused: false });

        expect(fields).toEqual({ name: 'Netflix', description: null, categoryId: 'fun', location: null, placeId: null, amount: 13.49, currencyCode: 'EUR', isOnline: true, firstDate: '2026-11-11', intervalMonths: 1, endDate: null, isPaused: false });
    });
});

describe('monthlyEuros', () => {
    it('spreads the amount over the interval, at the rate of a foreign currency once known', () => {
        expect(monthlyEuros(recurring({ amount: 120, intervalMonths: 12 }), null)).toBe(10);
        expect(monthlyEuros(recurring({ amount: 30, currencyCode: 'CHF', intervalMonths: 3 }), 1.1)).toBeCloseTo(11);
        expect(monthlyEuros(recurring({ currencyCode: 'CHF' }), null)).toBeNull();
    });
});

describe('isRunning', () => {
    it('tells a running one from a paused or an ended one', () => {
        expect(isRunning(recurring())).toBe(true);
        expect(isRunning(recurring({ isPaused: true }))).toBe(false);
        expect(isRunning(recurring({ nextDate: null }))).toBe(false);
    });
});

describe('dayOf', () => {
    it('reads a day the server sent, or none', () => {
        expect(dayOf('2026-12-05')).toEqual(new Date(2026, 11, 5));
        expect(dayOf(null)).toBeNull();
    });
});

describe('intervalLabel', () => {
    it('words each interval', () => {
        expect([1, 3, 6, 12].map(intervalLabel).every((label) => label.length > 0 && !label.startsWith('recurring.'))).toBe(true);
    });
});
