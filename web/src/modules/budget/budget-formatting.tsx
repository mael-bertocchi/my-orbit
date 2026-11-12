import type { Maybe } from 'models';
import type { Currency } from 'modules/budget/budget-currencies';
import { EURO } from 'modules/budget/budget-currencies';
import type { DayRange } from 'modules/budget/budget-dates';
import { isSameDay, timeKey } from 'modules/budget/budget-dates';
import type { PlaceReference } from 'modules/budget/budget-models';
import type { Language } from 'modules/language/language-models';
import { currentLanguage, t } from 'modules/language/language-service';

/**
 * @interface NumberStyle
 * @description How a language writes a number. Spelled out rather than left to `Intl` so the page prints the very
 * characters the app does.
 */
export interface NumberStyle {
    decimal: string; /*!< Before the cents */
    grouping: string; /*!< Between the thousands */
    unitSeparator: Maybe<string>; /*!< Before a trailing currency symbol or percent sign, or null when the symbol leads */
}

/**
 * @constant NUMBER_STYLES
 * @description English groups with commas and puts the symbol first: €1,234.50. French groups with a no-break space,
 * uses a decimal comma and puts the symbol last: 1 234,50 €. The narrow space French typography prefers for thousands
 * vanishes in the app's large figures, so both use the full-width one.
 */
const NUMBER_STYLES: Record<Language, NumberStyle> = {
    en: { decimal: '.', grouping: ',', unitSeparator: null },
    fr: { decimal: ',', grouping: '\u00a0', unitSeparator: '\u00a0' }
};

/**
 * @interface DateWords
 * @description How a language names months and days.
 */
interface DateWords {
    months: string[]; /*!< Month names, as a title */
    shortMonths: string[]; /*!< Abbreviated month names, inside a date */
    weekdays: string[]; /*!< Abbreviated weekday names, Sunday first like `Date.getDay` */
    firstDay: string; /*!< How the first day of a month is written: 1st is 1er in French */
}

/**
 * @constant DATE_WORDS
 * @description Month and day names, as the app's date formats write them in each language.
 */
const DATE_WORDS: Record<Language, DateWords> = {
    en: {
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        firstDay: '1'
    },
    fr: {
        months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
        shortMonths: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
        weekdays: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
        firstDay: '1er'
    }
};

/**
 * @constant compact
 * @description Whole amounts with thousands separators: 1,234.
 */
const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * @constant precise
 * @description Amounts to the cent with thousands separators: 1,234.50.
 */
const precise = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * @constant significant
 * @description Rates to five significant digits. They span orders of magnitude (a euro buys about one dollar but
 * over fifteen hundred won), so a fixed count of decimals would flatten the small ones.
 */
const significant = new Intl.NumberFormat('en-US', { minimumSignificantDigits: 5, maximumSignificantDigits: 5, useGrouping: false });

/**
 * @function numberStyle
 * @description How the page's language writes a number.
 */
export function numberStyle(): NumberStyle {
    return NUMBER_STYLES[currentLanguage()];
}

/**
 * @function localize
 * @description Rewrites a number formatted the English way in the page's language.
 */
function localize(formatted: string): string {
    const { decimal, grouping } = numberStyle();

    return formatted.replace(/[,.]/g, (mark) => (mark !== ',' ? decimal : grouping));
}

/**
 * @function withSymbol
 * @description Puts a currency symbol where the page's language puts it.
 */
function withSymbol(number: string, symbol: string): string {
    const { unitSeparator } = numberStyle();

    return unitSeparator !== null ? `${number}${unitSeparator}${symbol}` : `${symbol}${number}`;
}

/**
 * @function dateWords
 * @description How the page's language names months and days.
 */
function dateWords(): DateWords {
    return DATE_WORDS[currentLanguage()];
}

/**
 * @function roundHalfAwayFromZero
 * @description Rounds like Swift's `rounded()`, so a figure lands on the same euro in the app and on the web.
 */
function roundHalfAwayFromZero(value: number): number {
    return Math.sign(value) * Math.round(Math.abs(value)) || 0;
}

/**
 * @function euro
 * @description A euro amount rounded to the euro: €1,234.
 */
export function euro(amount: number): string {
    return withSymbol(localize(compact.format(roundHalfAwayFromZero(amount))), EURO.symbol);
}

/**
 * @function euroPrecise
 * @description A euro amount to the cent: €1,234.50.
 */
export function euroPrecise(amount: number): string {
    return withSymbol(localize(precise.format(amount)), EURO.symbol);
}

/**
 * @function money
 * @description An amount in its own currency, to the cent and without a sign: $48.90.
 */
export function money(amount: number, currency: Currency = EURO): string {
    return withSymbol(localize(precise.format(Math.abs(amount))), currency.symbol);
}

/**
 * @function rate
 * @description An exchange rate to five significant digits: 0.86903.
 */
export function rate(value: number): string {
    return localize(significant.format(value));
}

/**
 * @function percent
 * @description A fraction as a whole percentage: 58%.
 */
export function percent(fraction: number): string {
    return `${Math.round(fraction * 100)}${numberStyle().unitSeparator ?? ''}%`;
}

/**
 * @function monthTitle
 * @description A month's name: September.
 */
export function monthTitle(date: Date): string {
    return dateWords().months[date.getMonth()] ?? '';
}

/**
 * @function monthWithYear
 * @description A month and its year: September 2026.
 */
export function monthWithYear(date: Date): string {
    return `${monthTitle(date)} ${date.getFullYear()}`;
}

/**
 * @function monthShort
 * @description A month's abbreviated name: Sep.
 */
export function monthShort(date: Date): string {
    return dateWords().shortMonths[date.getMonth()] ?? '';
}

/**
 * @function weekdayShort
 * @description A weekday's abbreviated name: Mon.
 *
 * @param {number} weekday The weekday, 0 for Sunday like `Date.getDay`.
 *
 * @returns {string} Its name.
 */
export function weekdayShort(weekday: number): string {
    return dateWords().weekdays[weekday] ?? '';
}

/**
 * @function dayShort
 * @description A day and abbreviated month: 27 Sep, and 1er oct. in French.
 */
export function dayShort(date: Date): string {
    const day = date.getDate() !== 1 ? String(date.getDate()) : dateWords().firstDay;

    return `${day} ${dateWords().shortMonths[date.getMonth()] ?? ''}`;
}

/**
 * @function weekdayDay
 * @description A weekday, day and month: Sat 27 Sep.
 */
export function weekdayDay(date: Date): string {
    return `${dateWords().weekdays[date.getDay()] ?? ''} ${dayShort(date)}`;
}

/**
 * @function isYesterday
 * @description Whether a date falls on the day before another.
 */
function isYesterday(date: Date, now: Date): boolean {
    return isSameDay(date, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/**
 * @function relativeDay
 * @description Today, Yesterday, or the weekday and date, the way History labels its day groups.
 */
export function relativeDay(date: Date, now: Date = new Date()): string {
    if (isSameDay(date, now)) {
        return t('dates.today');
    }

    if (isYesterday(date, now)) {
        return t('dates.yesterday');
    }

    return weekdayDay(date);
}

/**
 * @function filterDay
 * @description A day the way the History date filter names it: 5 Oct, with the year once it isn't the current one.
 */
function filterDay(date: Date, now: Date): string {
    return date.getFullYear() !== now.getFullYear() ? `${dayShort(date)} ${date.getFullYear()}` : dayShort(date);
}

/**
 * @function rangeTitle
 * @description A range of days the way the History date filter names it: 5 Oct for a single day, 1 Sep → 30 Sep for
 * a period.
 */
export function rangeTitle(range: DayRange, now: Date = new Date()): string {
    return isSameDay(range.start, range.end) ? filterDay(range.start, now) : `${filterDay(range.start, now)} → ${filterDay(range.end, now)}`;
}

/**
 * @function clockTime
 * @description The time of day on a 24-hour clock, in both languages as in the app: 09:05. Like every date the page
 * shows, it reads in the browser's time zone, so an operation logged in another zone shows the hour it was here.
 */
export function clockTime(date: Date): string {
    return timeKey(date);
}

/**
 * @function fieldDay
 * @description The day of an operation the way its editor names it: Today, 27 Sep.
 */
function fieldDay(date: Date, now: Date): string {
    if (isSameDay(date, now)) {
        return t('dates.todayOn', { day: dayShort(date) });
    }

    if (isYesterday(date, now)) {
        return t('dates.yesterdayOn', { day: dayShort(date) });
    }

    return weekdayDay(date);
}

/**
 * @function fieldDate
 * @description When an operation happened, the way its editor shows it: Today, 27 Sep at 15:30.
 */
export function fieldDate(date: Date, now: Date = new Date()): string {
    return t('dates.at', { day: fieldDay(date, now), time: clockTime(date) });
}

/**
 * @function amountInput
 * @description An amount the way it is prefilled in a form: 12 or 12.50, never grouped.
 */
export function amountInput(amount: number): string {
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * @function truncate
 * @description Shortens text to a length, ending it with an ellipsis when cut.
 */
export function truncate(text: string, length: number): string {
    return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1))}…`;
}

/**
 * @function placeName
 * @description A city's name in the page's language.
 *
 * @param {PlaceReference} place The city.
 *
 * @returns {string} Its name.
 */
export function placeName(place: PlaceReference): string {
    return currentLanguage() !== 'fr' ? place.nameEn : place.nameFr;
}

/**
 * @interface Whereabouts
 * @description Where an operation, or a recurring one, takes place.
 */
export interface Whereabouts {
    location?: Maybe<string>; /*!< The place as written */
    place?: Maybe<PlaceReference>; /*!< The city, checked by the server */
}

/**
 * @function whereabouts
 * @description Where an operation takes place, as the page shows it: its city in the page's language, else the place as
 * written for one logged before cities were checked, else nothing.
 *
 * @param {Whereabouts} entry The operation.
 *
 * @returns {string} The place, empty when there is none.
 */
export function whereabouts(entry: Whereabouts): string {
    if (entry.place !== undefined && entry.place !== null) {
        return placeName(entry.place);
    }

    return entry.location?.trim() ?? '';
}
