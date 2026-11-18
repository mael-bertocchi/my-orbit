import { dayAt, instantAt, isTimeZone } from 'src/shared/owner-day';
import { describe, expect, it } from 'vitest';

describe('the owner\'s wall clock', () => {
    it('reads an instant as the day of a time zone', () => {
        expect(dayAt(new Date('2026-10-31T23:30:00.000Z'), 'Europe/Paris')).toBe('2026-11-01');
        expect(dayAt(new Date('2026-11-16T15:05:00.000Z'), 'Asia/Seoul')).toBe('2026-11-17');
        expect(dayAt(new Date('2026-11-16T14:45:00.000Z'), 'Asia/Seoul')).toBe('2026-11-16');
    });

    it('finds the instant a time zone shows a day and a time, summer time or not', () => {
        expect(instantAt('2026-11-01', '00:00', 'Europe/Paris').toISOString()).toBe('2026-10-31T23:00:00.000Z');
        expect(instantAt('2026-08-01', '00:00', 'Europe/Paris').toISOString()).toBe('2026-07-31T22:00:00.000Z');
        expect(instantAt('2026-03-29', '12:00', 'Europe/Paris').toISOString()).toBe('2026-03-29T10:00:00.000Z');
        expect(instantAt('2026-10-25', '12:00', 'Europe/Paris').toISOString()).toBe('2026-10-25T11:00:00.000Z');
        expect(instantAt('2026-11-17', '18:03', 'Asia/Seoul').toISOString()).toBe('2026-11-17T09:03:00.000Z');
    });

    it('knows the IANA time zones only', () => {
        expect(isTimeZone('Asia/Seoul')).toBe(true);
        expect(isTimeZone('Mars/Olympus')).toBe(false);
    });
});
