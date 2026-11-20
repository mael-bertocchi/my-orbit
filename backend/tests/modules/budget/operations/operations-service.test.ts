import { wholeDays } from 'src/modules/budget/operations/operations-service';
import { describe, expect, it } from 'vitest';

/**
 * @function days
 * @description Operations on the days given, one each, the latest first
 */
function days(...list: string[]): { day: string }[] {
    return list.map((day) => ({ day }));
}

describe('wholeDays', () => {
    it('leaves the day the next operation falls on for the next page', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-19', '2026-11-19', '2026-11-19'), 3)).toEqual(days('2026-11-20'));
    });

    it('keeps the whole page when the next operation starts another day', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-19', '2026-11-18'), 2)).toEqual(days('2026-11-20', '2026-11-19'));
    });

    it('keeps everything read once there is nothing past the limit', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-19'), 3)).toEqual(days('2026-11-20', '2026-11-19'));
    });

    it('cuts a single day longer than the limit, so the list can move on', () => {
        expect(wholeDays(days('2026-11-20', '2026-11-20', '2026-11-20'), 2)).toEqual(days('2026-11-20', '2026-11-20'));
    });
});
