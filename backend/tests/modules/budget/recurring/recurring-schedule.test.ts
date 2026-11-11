import type { Schedule } from 'src/modules/budget/recurring/recurring-models';
import { isRealDay, nextOccurrence, occurrenceOf, pendingOccurrences } from 'src/modules/budget/recurring/recurring-schedule';
import { describe, expect, it } from 'vitest';

/**
 * @function monthly
 * @description A monthly schedule never logged yet, from a first day
 */
function monthly(firstDate: string): Schedule {
    return { firstDate, intervalMonths: 1, endDate: null, isPaused: false, generatedThrough: null };
}

describe('occurrenceOf', () => {
    it('keeps the first day of the month, or the last day of a shorter month', () => {
        const schedule = monthly('2026-01-31');

        expect([0, 1, 2, 3].map((index) => occurrenceOf(schedule, index))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
        expect(occurrenceOf(monthly('2027-12-29'), 2)).toBe('2028-02-29');
    });

    it('moves on by its interval, across the years', () => {
        expect([0, 1, 2].map((index) => occurrenceOf({ firstDate: '2026-11-05', intervalMonths: 3 }, index))).toEqual(['2026-11-05', '2027-02-05', '2027-05-05']);
        expect(occurrenceOf({ firstDate: '2026-11-05', intervalMonths: 12 }, 1)).toBe('2027-11-05');
    });
});

describe('pendingOccurrences', () => {
    it('lists the occurrences due up to a day, the day itself included', () => {
        expect(pendingOccurrences(monthly('2026-09-11'), '2026-11-11')).toEqual(['2026-09-11', '2026-10-11', '2026-11-11']);
        expect(pendingOccurrences(monthly('2026-09-12'), '2026-11-11')).toEqual(['2026-09-12', '2026-10-12']);
        expect(pendingOccurrences(monthly('2026-12-01'), '2026-11-11')).toEqual([]);
    });

    it('leaves out the occurrences already passed and those after the end', () => {
        expect(pendingOccurrences({ ...monthly('2026-06-01'), generatedThrough: '2026-09-01' }, '2026-11-11')).toEqual(['2026-10-01', '2026-11-01']);
        expect(pendingOccurrences({ ...monthly('2026-06-01'), endDate: '2026-07-15' }, '2026-11-11')).toEqual(['2026-06-01', '2026-07-01']);
    });
});

describe('nextOccurrence', () => {
    it('gives the first occurrence not passed yet, or null once it has ended', () => {
        expect(nextOccurrence(monthly('2026-06-01'))).toBe('2026-06-01');
        expect(nextOccurrence({ ...monthly('2026-06-01'), generatedThrough: '2026-11-01' })).toBe('2026-12-01');
        expect(nextOccurrence({ ...monthly('2026-06-01'), generatedThrough: '2026-11-01', endDate: '2026-11-30' })).toBeNull();
    });
});

describe('isRealDay', () => {
    it('tells the days of the calendar from the others', () => {
        expect(isRealDay('2028-02-29')).toBe(true);
        expect(isRealDay('2026-02-29')).toBe(false);
        expect(isRealDay('2026-13-01')).toBe(false);
        expect(isRealDay('2026-04-31')).toBe(false);
    });
});
