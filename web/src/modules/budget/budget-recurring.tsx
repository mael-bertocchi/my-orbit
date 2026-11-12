import type { Maybe } from 'models';
import { EURO } from 'modules/budget/budget-currencies';
import { parseDayKey } from 'modules/budget/budget-dates';
import type { PlaceReference, RecurringFields, RecurringOperation } from 'modules/budget/budget-models';
import type { MessageKey } from 'modules/language/language-en';
import { t } from 'modules/language/language-service';

/**
 * @constant INTERVALS
 * @description How many months may lie between two occurrences: every month, quarter, half year or year.
 */
export const INTERVALS: readonly number[] = [1, 3, 6, 12];

/**
 * @constant INTERVAL_LABELS
 * @description How each interval reads.
 */
const INTERVAL_LABELS: Record<number, MessageKey> = {
    1: 'recurring.every1',
    3: 'recurring.every3',
    6: 'recurring.every6',
    12: 'recurring.every12'
};

/**
 * @interface RecurringDraft
 * @description What the recurring operation editor holds before it is saved.
 */
export interface RecurringDraft {
    name: string; /*!< What it is */
    description: string; /*!< An optional note */
    amount: number; /*!< How much, in its own currency */
    currencyCode: string; /*!< The currency it is paid in */
    categoryId: string; /*!< Where its occurrences are filed */
    location: string; /*!< Where it is paid, as it reads, ignored when online */
    place: Maybe<PlaceReference>; /*!< The city it is paid in, ignored when online */
    isOnline: boolean; /*!< Whether it has no physical location */
    firstDate: string; /*!< Its first occurrence, as `YYYY-MM-DD` */
    intervalMonths: number; /*!< How many months lie between two occurrences */
    endDate: Maybe<string>; /*!< The last day it may fall on, none when it never ends */
    isPaused: boolean; /*!< Whether its occurrences are skipped for now */
}

/**
 * @function toRecurringFields
 * @description Builds what the server takes from a draft. An online one has no place; empty texts are stored as none.
 *
 * @param {RecurringDraft} draft The editor's content.
 *
 * @returns {RecurringFields} The recurring operation's fields.
 */
export function toRecurringFields(draft: RecurringDraft): RecurringFields {
    const description = draft.description.trim();
    const location = draft.isOnline ? '' : draft.location.trim();
    const place = draft.isOnline || location === '' ? null : draft.place;

    return {
        name: draft.name.trim(),
        description: description !== '' ? description : null,
        categoryId: draft.categoryId,
        location: location !== '' ? location : null,
        placeId: place?.id ?? null,
        amount: draft.amount,
        currencyCode: draft.currencyCode,
        isOnline: draft.isOnline,
        firstDate: draft.firstDate,
        intervalMonths: draft.intervalMonths,
        endDate: draft.endDate,
        isPaused: draft.isPaused
    };
}

/**
 * @function intervalLabel
 * @description How often a recurring operation comes back, in words: every month, every quarter…
 *
 * @param {number} intervalMonths How many months lie between two occurrences.
 *
 * @returns {string} The words.
 */
export function intervalLabel(intervalMonths: number): string {
    return t(INTERVAL_LABELS[intervalMonths] ?? 'recurring.every1');
}

/**
 * @function monthlyEuros
 * @description What a recurring operation costs a month on average, in euros: its amount spread over its interval.
 *
 * @param {RecurringOperation} recurring The recurring operation.
 * @param {Maybe<number>} rateToEuro The euros one unit of its currency costs, none until known.
 *
 * @returns {Maybe<number>} The euros a month, or null while a foreign currency's rate is unknown.
 */
export function monthlyEuros(recurring: RecurringOperation, rateToEuro: Maybe<number>): Maybe<number> {
    const rate = recurring.currencyCode !== EURO.code ? rateToEuro : 1;

    return rate !== null ? recurring.amount * rate / recurring.intervalMonths : null;
}

/**
 * @function isRunning
 * @description Whether a recurring operation still logs occurrences: neither paused nor over.
 *
 * @param {RecurringOperation} recurring The recurring operation.
 *
 * @returns {boolean} Whether it runs.
 */
export function isRunning(recurring: RecurringOperation): boolean {
    return !recurring.isPaused && (recurring.nextDate ?? null) !== null;
}

/**
 * @function dayOf
 * @description Reads a `YYYY-MM-DD` day the server sent.
 *
 * @param {Maybe<string>} key The day, if any.
 *
 * @returns {Maybe<Date>} Its midnight, or null for none.
 */
export function dayOf(key: Maybe<string> | undefined): Maybe<Date> {
    return key !== null && key !== undefined ? parseDayKey(key) : null;
}
