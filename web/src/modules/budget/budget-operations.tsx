import type { Maybe } from 'models';
import { EURO } from 'modules/budget/budget-currencies';
import { wholeSeconds } from 'modules/budget/budget-dates';
import { numberStyle } from 'modules/budget/budget-formatting';
import type { BudgetDocument, Operation, PlaceReference } from 'modules/budget/budget-models';

/**
 * @constant MAX_DIGITS
 * @description How many digits an amount can hold, cents included, like the app's amount field.
 */
const MAX_DIGITS = 8;

/**
 * @constant Limits
 * @description The longest texts the server stores.
 */
export const Limits = {
    name: 120,
    description: 500,
    location: 200
};

/**
 * @interface OperationDraft
 * @description What the operation editor holds before it is saved.
 */
export interface OperationDraft {
    name: string; /*!< What it was */
    description: string; /*!< An optional note */
    amount: number; /*!< How much, in its own currency */
    currencyCode: string; /*!< The currency it was paid in */
    categoryId: string; /*!< Where it is filed */
    date: Date; /*!< When it happened */
    location: string; /*!< Where it happened, as it reads, ignored when online */
    place: Maybe<PlaceReference>; /*!< The city it happened in, ignored when online */
    isOnline: boolean; /*!< Whether it has no physical location */
}

/**
 * @function sanitizeAmountInput
 * @description Keeps what is typed in the amount field a valid amount: digits, one decimal separator, two decimals at
 * most and eight digits in all. In English a comma is grouping, unless it is followed by at most two digits, so 12,50
 * works. In French both a comma and a dot are the decimal separator, and the spaces grouping the thousands are dropped
 * with anything else.
 *
 * @param {string} text What was typed.
 *
 * @returns {string} The cleaned amount, with a dot as separator and no grouping.
 */
export function sanitizeAmountInput(text: string): string {
    let working = text;

    if (numberStyle().decimal !== ',') {
        if (!working.includes('.') && /^[^,]*,\d{0,2}$/.test(working)) {
            working = working.replace(',', '.');
        }

        working = working.replaceAll(',', '');
    } else {
        working = working.replaceAll(',', '.');
    }

    let integer = '';
    let fraction = '';
    let hasSeparator = false;
    let digits = 0;

    for (const character of working) {
        if (/\d/.test(character)) {
            if (digits >= MAX_DIGITS || (hasSeparator && fraction.length >= 2)) {
                continue;
            }

            if (hasSeparator) {
                fraction += character;
            } else {
                integer += character;
            }

            digits += 1;
        } else if (character === '.' && !hasSeparator) {
            hasSeparator = true;
        }
    }

    integer = integer.replace(/^0+(?=\d)/, '');

    if (integer === '') {
        if (!hasSeparator) {
            return '';
        }

        integer = '0';
    }

    return hasSeparator ? `${integer}.${fraction}` : integer;
}

/**
 * @function groupAmountInput
 * @description Writes a cleaned amount the way the page's language does, thousands separators included, as the app
 * does while typing.
 */
export function groupAmountInput(cleaned: string): string {
    const { decimal, grouping } = numberStyle();
    const [integer = '', ...fraction] = cleaned.split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);

    return fraction.length > 0 ? `${grouped}${decimal}${fraction.join('')}` : grouped;
}

/**
 * @function parseAmountInput
 * @description Reads the amount field.
 *
 * @returns {Maybe<number>} The amount, or null when nothing above zero is typed.
 */
export function parseAmountInput(text: string): Maybe<number> {
    const amount = Number(sanitizeAmountInput(text));

    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * @function amountInputOf
 * @description An amount the way the field shows it: 12 or 12.50, grouped.
 */
export function amountInputOf(amount: number): string {
    return groupAmountInput(Number.isInteger(amount) ? String(amount) : amount.toFixed(2));
}

/**
 * @function toOperation
 * @description Builds the operation a draft describes. An online operation has no place; empty texts are stored as none.
 *
 * @param {OperationDraft} draft The editor's content.
 * @param {number} rateToEuro The rate to price it at.
 * @param {string} id The id to keep, or none to mint one in the app's uppercase UUID form.
 *
 * @returns {Operation} The operation.
 */
export function toOperation(draft: OperationDraft, rateToEuro: number, id?: string): Operation {
    const description = draft.description.trim();
    const location = draft.isOnline ? '' : draft.location.trim();
    const place = draft.isOnline || location === '' ? null : draft.place;

    return {
        id: id ?? crypto.randomUUID().toUpperCase(),
        date: wholeSeconds(draft.date),
        name: draft.name.trim(),
        description: description !== '' ? description : null,
        categoryId: draft.categoryId,
        location: location !== '' ? location : null,
        placeId: place?.id ?? null,
        place,
        amount: draft.amount,
        currencyCode: draft.currencyCode,
        rateToEuro: draft.currencyCode !== EURO.code ? rateToEuro : 1,
        isOnline: draft.isOnline,
        updatedAt: new Date()
    };
}

/**
 * @function upsertOperation
 * @description Adds an operation, or replaces the one with its id.
 */
export function upsertOperation(document: BudgetDocument, operation: Operation): BudgetDocument {
    const exists = document.operations.some((candidate) => candidate.id === operation.id);

    return {
        ...document,
        operations: exists
            ? document.operations.map((candidate) => (candidate.id !== operation.id ? candidate : operation))
            : [...document.operations, operation]
    };
}

/**
 * @function deleteOperation
 * @description Removes an operation.
 */
export function deleteOperation(document: BudgetDocument, id: string): BudgetDocument {
    return { ...document, operations: document.operations.filter((operation) => operation.id !== id) };
}
