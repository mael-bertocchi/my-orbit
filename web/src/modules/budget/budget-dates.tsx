import type { Maybe } from 'models';

/**
 * @function pad
 * @description Left-pads a number with zeros.
 */
function pad(value: number, width = 2): string {
    return String(value).padStart(width, '0');
}

/**
 * @function startOfDay
 * @description Midnight of the day a date falls on.
 *
 * @param {Date} date The date.
 *
 * @returns {Date} That day's midnight.
 */
export function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * @function monthStart
 * @description Midnight of the first day of a date's month.
 *
 * @param {Date} date The date.
 *
 * @returns {Date} The month's first day.
 */
export function monthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * @function shiftMonth
 * @description The first day of the month a number of months away.
 *
 * @param {Date} date The date to start from.
 * @param {number} months How many months to move, backwards when negative.
 *
 * @returns {Date} That month's first day.
 */
export function shiftMonth(date: Date, months: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * @function isSameMonth
 * @description Whether two dates fall in the same month.
 */
export function isSameMonth(left: Date, right: Date): boolean {
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

/**
 * @function isSameDay
 * @description Whether two dates fall on the same day.
 */
export function isSameDay(left: Date, right: Date): boolean {
    return isSameMonth(left, right) && left.getDate() === right.getDate();
}

/**
 * @function daysInMonth
 * @description How many days a date's month has.
 */
export function daysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * @function monthKey
 * @description A month in YYYY-MM form, the way the budget history is keyed.
 *
 * @param {Date} date Any date in the month.
 *
 * @returns {string} The key.
 */
export function monthKey(date: Date): string {
    return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}`;
}

/**
 * @function dayKey
 * @description A day in YYYY-MM-DD form, the way exchange rates are quoted.
 *
 * @param {Date} date Any instant of the day.
 *
 * @returns {string} The key.
 */
export function dayKey(date: Date): string {
    return `${monthKey(date)}-${pad(date.getDate())}`;
}

/**
 * @function timeKey
 * @description A time of day in HH:MM form, the way a time field holds it.
 *
 * @param {Date} date The date.
 *
 * @returns {string} The key.
 */
export function timeKey(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * @function atTime
 * @description A date's day at a time of day read from a time field, on the minute.
 *
 * @param {Date} date The date to take the day of.
 * @param {string} key The time, in HH:MM form, seconds tolerated and dropped.
 *
 * @returns {Maybe<Date>} The day at that time, or null when the key names no time of day.
 */
export function atTime(date: Date, key: string): Maybe<Date> {
    const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(key);

    if (match === null) {
        return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    return hours <= 23 && minutes <= 59 ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes) : null;
}

/**
 * @function parseMonthKey
 * @description Reads a YYYY-MM key back into the month's first day.
 *
 * @param {string} key The key.
 *
 * @returns {Maybe<Date>} The month's first day, or null for a malformed key.
 */
export function parseMonthKey(key: string): Maybe<Date> {
    const match = /^(\d{4})-(\d{2})$/.exec(key);

    if (match === null) {
        return null;
    }

    const month = Number(match[2]);

    return month >= 1 && month <= 12 ? new Date(Number(match[1]), month - 1, 1) : null;
}

/**
 * @function wholeSeconds
 * @description Drops the milliseconds of a date. The app stores dates to the second, so the bot does too.
 */
export function wholeSeconds(date: Date): Date {
    return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * @function withTimeOf
 * @description A day at the time of day of another date, the way the app's date picker keeps the time it holds when
 * another day is picked.
 *
 * @param {Date} day The day.
 * @param {Date} time The date to take the time of day from.
 *
 * @returns {Date} The combined date, to the second.
 */
export function withTimeOf(day: Date, time: Date): Date {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes(), time.getSeconds());
}

/**
 * @function isFutureDay
 * @description Whether a date falls on a day after today. An operation can't be dated in the future.
 */
export function isFutureDay(date: Date, now: Date): boolean {
    return startOfDay(date).getTime() > startOfDay(now).getTime();
}

/**
 * @function calendarDay
 * @description Builds a day, or null when the parts don't name a real one (a 31st of June, say).
 */
function calendarDay(year: number, month: number, day: number): Maybe<Date> {
    const date = new Date(year, month - 1, day);

    return date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ? null : date;
}

/**
 * @function parseDayKey
 * @description Reads a YYYY-MM-DD key back into its day.
 *
 * @param {string} key The key.
 *
 * @returns {Maybe<Date>} Midnight of the day, or null for a malformed key or one that names no real day.
 */
export function parseDayKey(key: string): Maybe<Date> {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);

    return match !== null ? calendarDay(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

/**
 * @function parseDay
 * @description Reads a day typed by hand: "today", "yesterday", 2026-09-25, 25/09/2026, 25/09/26 or 25/09. A day
 * with no year is the most recent one that isn't in the future.
 *
 * @param {string} input What was typed.
 * @param {Date} now The current date.
 *
 * @returns {Maybe<Date>} Midnight of the day, or null when the input names none.
 */
export function parseDay(input: string, now: Date): Maybe<Date> {
    const text = input.trim().toLowerCase();

    if (text === 'today') {
        return startOfDay(now);
    }

    if (text === 'yesterday') {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    }

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);

    if (iso !== null) {
        return calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    }

    const written = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);

    if (written === null) {
        return null;
    }

    const day = Number(written[1]);
    const month = Number(written[2]);

    if (written[3] !== undefined) {
        const year = Number(written[3]);

        return calendarDay(written[3].length !== 2 ? year : 2000 + year, month, day);
    }

    const thisYear = calendarDay(now.getFullYear(), month, day);

    if (thisYear !== null && !isFutureDay(thisYear, now)) {
        return thisYear;
    }

    return calendarDay(now.getFullYear() - 1, month, day);
}

/**
 * @interface DayRange
 * @description A run of whole days, both ends included. A single day starts and ends on itself.
 */
export interface DayRange {
    start: Date; /*!< Midnight of its first day */
    end: Date; /*!< Midnight of its last day */
}

/**
 * @function dayRange
 * @description The days from one date to another, whichever of the two comes first.
 *
 * @param {Date} left One end.
 * @param {Date} right The other end.
 *
 * @returns {DayRange} The range, in order.
 */
export function dayRange(left: Date, right: Date): DayRange {
    const first = startOfDay(left);
    const second = startOfDay(right);

    return first.getTime() <= second.getTime() ? { start: first, end: second } : { start: second, end: first };
}

/**
 * @function isInRange
 * @description Whether a date falls on one of a range's days.
 */
export function isInRange(date: Date, range: DayRange): boolean {
    const day = startOfDay(date).getTime();

    return day >= range.start.getTime() && day <= range.end.getTime();
}
