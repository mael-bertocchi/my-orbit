import { EURO, isSupportedCurrency } from 'modules/budget/budget-currencies';

/**
 * @constant CURRENCY_KEY
 * @description Where the default currency is kept.
 */
const CURRENCY_KEY = 'my-orbit.currency';

/**
 * @function defaultCurrency
 * @description The currency a new operation starts in: the last one used on this browser.
 */
export function defaultCurrency(): string {
    try {
        const stored = localStorage.getItem(CURRENCY_KEY);

        return stored !== null && isSupportedCurrency(stored) ? stored : EURO.code;
    } catch {
        return EURO.code;
    }
}

/**
 * @function rememberCurrency
 * @description Keeps a currency as the default for the next operation.
 */
export function rememberCurrency(code: string): void {
    try {
        localStorage.setItem(CURRENCY_KEY, code);
    } catch {
        return;
    }
}
