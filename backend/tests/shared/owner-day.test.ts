import { ownerDayAfter, ownerDayOf, ownerDayStart } from 'src/shared/owner-day';
import { describe, expect, it } from 'vitest';

describe('the owner\'s days', () => {
    it('counts a late-night instant in the owner\'s day, not the UTC one', () => {
        expect(ownerDayOf(new Date('2026-10-31T23:30:00.000Z'))).toBe('2026-11-01');
        expect(ownerDayOf(new Date('2026-07-31T21:59:00.000Z'))).toBe('2026-07-31');
        expect(ownerDayOf(new Date('2026-07-31T22:00:00.000Z'))).toBe('2026-08-01');
    });

    it('starts a day at the owner\'s midnight, summer time or not', () => {
        expect(ownerDayStart('2026-11-01').toISOString()).toBe('2026-10-31T23:00:00.000Z');
        expect(ownerDayStart('2026-08-01').toISOString()).toBe('2026-07-31T22:00:00.000Z');
        expect(ownerDayStart('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
        expect(ownerDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    });

    it('ends a range on the next day\'s midnight, across a month and a year', () => {
        expect(ownerDayAfter('2026-10-31').toISOString()).toBe('2026-10-31T23:00:00.000Z');
        expect(ownerDayAfter('2026-12-31').toISOString()).toBe('2026-12-31T23:00:00.000Z');
    });
});
