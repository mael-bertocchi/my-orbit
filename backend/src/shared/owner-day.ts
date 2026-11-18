/**
 * @constant DEFAULT_TIME_ZONE
 * @description The time zone the owner's days are counted in until an app has told the server the one of its device.
 */
export const DEFAULT_TIME_ZONE = 'Europe/Paris';

/**
 * @function isTimeZone
 * @description Whether a name is an IANA time zone the runtime knows, such as `Asia/Seoul`.
 *
 * @param {string} name The name.
 *
 * @returns {boolean} Whether it is one.
 */
export function isTimeZone(name: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: name });

        return true;
    } catch {
        return false;
    }
}

/**
 * @function wallClockOf
 * @description The wall clock of a time zone at an instant, as `YYYY-MM-DDTHH:MM`.
 *
 * @param {Date} instant The instant.
 * @param {string} timeZone The time zone.
 *
 * @returns {string} The wall clock.
 */
function wallClockOf(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((candidate) => candidate.type === type)?.value ?? '00';

    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/**
 * @function dayAt
 * @description The calendar day of a time zone at an instant.
 *
 * @param {Date} instant The instant.
 * @param {string} timeZone The time zone.
 *
 * @returns {string} The day, as `YYYY-MM-DD`.
 */
export function dayAt(instant: Date, timeZone: string): string {
    return wallClockOf(instant, timeZone).slice(0, 10);
}

/**
 * @function offsetAt
 * @description How far ahead of UTC a time zone's clock is at an instant, to the minute.
 *
 * @param {Date} instant The instant.
 * @param {string} timeZone The time zone.
 *
 * @returns {number} The offset, in milliseconds.
 */
function offsetAt(instant: Date, timeZone: string): number {
    const wallClock = new Date(`${wallClockOf(instant, timeZone)}:00.000Z`).getTime();
    const minute = Math.floor(instant.getTime() / 60_000) * 60_000;

    return wallClock - minute;
}

/**
 * @function instantAt
 * @description The instant a time zone's clock shows a day and a time. The offset is read again at the first guess, so a
 * day that changes to or from summer time lands on the right hour.
 *
 * @param {string} day The day, as `YYYY-MM-DD`.
 * @param {string} time The time, as `HH:MM`.
 * @param {string} timeZone The time zone.
 *
 * @returns {Date} The instant.
 */
export function instantAt(day: string, time: string, timeZone: string): Date {
    const wallClock = new Date(`${day}T${time}:00.000Z`).getTime();
    const guess = new Date(wallClock - offsetAt(new Date(wallClock), timeZone));

    return new Date(wallClock - offsetAt(guess, timeZone));
}
