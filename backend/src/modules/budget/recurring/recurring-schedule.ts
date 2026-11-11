import type { Schedule } from 'src/modules/budget/recurring/recurring-models';
import type { Maybe } from 'src/shared/models';

/**
 * @constant MAX_OCCURRENCES
 * @description How many occurrences of one schedule are looked at, at most: a century of months.
 */
const MAX_OCCURRENCES = 1200;

/**
 * @interface DayParts
 * @description A day, split into its year, month and day of the month.
 */
interface DayParts {
    year: number; /*!< The year */
    month: number; /*!< The month, 0 for January like `Date.getUTCMonth` */
    date: number; /*!< The day of the month, from 1 */
}

/**
 * @function partsOf
 * @description Splits a `YYYY-MM-DD` day into its parts.
 *
 * @param {string} day The day.
 *
 * @returns {DayParts} Its year, month and day of the month.
 */
function partsOf(day: string): DayParts {
    const [year = 0, month = 1, date = 1] = day.split('-').map(Number);

    return { year, month: month - 1, date };
}

/**
 * @function dayOf
 * @description Writes a day as `YYYY-MM-DD`.
 *
 * @param {number} year The year.
 * @param {number} month The month, 0 for January.
 * @param {number} date The day of the month.
 *
 * @returns {string} The day.
 */
function dayOf(year: number, month: number, date: number): string {
    return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

/**
 * @function daysIn
 * @description How many days a month has.
 *
 * @param {number} year The year.
 * @param {number} month The month, 0 for January.
 *
 * @returns {number} Its number of days.
 */
function daysIn(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * @function isRealDay
 * @description Whether a `YYYY-MM-DD` day exists in the calendar, which the 30th of February does not.
 *
 * @param {string} day The day.
 *
 * @returns {boolean} Whether it exists.
 */
export function isRealDay(day: string): boolean {
    const { year, month, date } = partsOf(day);

    return month >= 0 && month < 12 && date >= 1 && date <= daysIn(year, month);
}

/**
 * @function occurrenceOf
 * @description The day a schedule's occurrence falls on: as many intervals after the first as its index, on the first's
 * day of the month, or on the month's last day when the month is shorter.
 *
 * @param {Pick<Schedule, 'firstDate' | 'intervalMonths'>} schedule The schedule.
 * @param {number} index Which occurrence, 0 for the first.
 *
 * @returns {string} Its day, as `YYYY-MM-DD`.
 */
export function occurrenceOf(schedule: Pick<Schedule, 'firstDate' | 'intervalMonths'>, index: number): string {
    const { year, month, date } = partsOf(schedule.firstDate);
    const months = month + index * schedule.intervalMonths;
    const targetYear = year + Math.floor(months / 12);
    const targetMonth = months % 12;

    return dayOf(targetYear, targetMonth, Math.min(date, daysIn(targetYear, targetMonth)));
}

/**
 * @function pendingOccurrences
 * @description The occurrences of a schedule not yet passed that fall on or before a day, its end date included, the
 * earliest first.
 *
 * @param {Schedule} schedule The schedule.
 * @param {string} through The last day looked at, as `YYYY-MM-DD`.
 *
 * @returns {string[]} Their days.
 */
export function pendingOccurrences(schedule: Schedule, through: string): string[] {
    const last = schedule.endDate !== null && schedule.endDate < through ? schedule.endDate : through;
    const days: string[] = [];

    for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
        const day = occurrenceOf(schedule, index);

        if (day > last) {
            break;
        }

        if (schedule.generatedThrough === null || day > schedule.generatedThrough) {
            days.push(day);
        }
    }

    return days;
}

/**
 * @function nextOccurrence
 * @description The first occurrence of a schedule not yet passed.
 *
 * @param {Schedule} schedule The schedule.
 *
 * @returns {Maybe<string>} Its day, or null when the schedule has ended.
 */
export function nextOccurrence(schedule: Schedule): Maybe<string> {
    for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
        const day = occurrenceOf(schedule, index);

        if (schedule.endDate !== null && day > schedule.endDate) {
            return null;
        }

        if (schedule.generatedThrough === null || day > schedule.generatedThrough) {
            return day;
        }
    }

    return null;
}
