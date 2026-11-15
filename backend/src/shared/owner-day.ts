/**
 * @constant OWNER_TIME_ZONE
 * @description The time zone the owner's days and months are counted in, as the web and iOS apps count them on the
 * owner's own device. The server can't see that device, so it assumes the owner's home: while they travel, the first and
 * last hours of a day may land on the next or previous one.
 */
export const OWNER_TIME_ZONE = 'Europe/Paris';

/**
 * @constant DAY_FORMAT
 * @description Writes an instant as the owner's calendar day, `YYYY-MM-DD`.
 */
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: OWNER_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * @constant OFFSET_FORMAT
 * @description Writes an instant's offset from UTC in the owner's time zone, such as `GMT+01:00`, or `GMT` when there is none.
 */
const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: OWNER_TIME_ZONE, timeZoneName: 'longOffset' });

/**
 * @constant DAY_LENGTH
 * @description One day, in milliseconds.
 */
const DAY_LENGTH = 24 * 60 * 60 * 1000;

/**
 * @function offsetOf
 * @description How far ahead of UTC the owner's clock is at an instant.
 *
 * @param {Date} instant The instant.
 *
 * @returns {number} The offset, in milliseconds.
 */
function offsetOf(instant: Date): number {
    const name = OFFSET_FORMAT.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? '';
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);

    if (match === null) {
        return 0;
    }

    const minutes = Number(match[2]) * 60 + Number(match[3]);

    return (match[1] !== '-' ? minutes : -minutes) * 60 * 1000;
}

/**
 * @function ownerDayOf
 * @description The owner's calendar day at an instant.
 *
 * @param {Date} instant The instant.
 *
 * @returns {string} The day, as `YYYY-MM-DD`.
 */
export function ownerDayOf(instant: Date): string {
    return DAY_FORMAT.format(instant);
}

/**
 * @function ownerDayStart
 * @description The instant one of the owner's days starts at: their midnight.
 *
 * @param {string} day The day, as `YYYY-MM-DD`.
 *
 * @returns {Date} Its first instant.
 */
export function ownerDayStart(day: string): Date {
    const utcMidnight = new Date(`${day}T00:00:00.000Z`);

    return new Date(utcMidnight.getTime() - offsetOf(utcMidnight));
}

/**
 * @function ownerDayAfter
 * @description The instant the day after one of the owner's days starts at, the end of a range that includes that day.
 *
 * @param {string} day The day, as `YYYY-MM-DD`.
 *
 * @returns {Date} The first instant of the next day.
 */
export function ownerDayAfter(day: string): Date {
    const next = new Date(new Date(`${day}T00:00:00.000Z`).getTime() + DAY_LENGTH);

    return ownerDayStart(next.toISOString().slice(0, 10));
}
