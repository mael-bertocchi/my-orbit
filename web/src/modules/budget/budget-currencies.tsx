import { isMessageKey, t } from 'modules/language/language-service';

/**
 * @interface Currency
 * @description A currency an operation can be entered in.
 */
export interface Currency {
    code: string; /*!< ISO 4217 code */
    symbol: string; /*!< Symbol printed before an amount */
    name: string; /*!< Full name */
}

/**
 * @constant EURO
 * @description The currency the whole budget is kept in.
 */
export const EURO: Currency = { code: 'EUR', symbol: '€', name: 'Euro' };

/**
 * @constant CURRENCIES
 * @description The currencies the app offers, in the app's order.
 */
export const CURRENCIES: readonly Currency[] = [
    EURO,
    { code: 'USD', symbol: '$', name: 'United States Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won' }
];

/**
 * @constant BANK_MARKUP
 * @description What the bank adds on top of the reference rate. A card payment abroad lands on the statement about a
 * percent dearer than the published rate suggests, so every rate the app applies carries it.
 */
export const BANK_MARKUP = 0.01;

/**
 * @function currencyNamed
 * @description Looks a currency up by code, falling back to the euro like the app does.
 *
 * @param {string} code The ISO code.
 *
 * @returns {Currency} The currency.
 */
export function currencyNamed(code: string): Currency {
    return CURRENCIES.find((currency) => currency.code === code) ?? EURO;
}

/**
 * @function currencyName
 * @description A currency's name in the page's language.
 *
 * @param {Currency} currency The currency.
 *
 * @returns {string} Its name.
 */
export function currencyName(currency: Currency): string {
    const key = `currency.${currency.code}`;

    return isMessageKey(key) ? t(key) : currency.name;
}

/**
 * @function isSupportedCurrency
 * @description Whether the app offers a currency.
 *
 * @param {string} code The ISO code.
 *
 * @returns {boolean} True when it is in the catalogue.
 */
export function isSupportedCurrency(code: string): boolean {
    return CURRENCIES.some((currency) => currency.code === code);
}

/**
 * @function bankRate
 * @description The rate the app applies: the reference rate with the bank's markup on top. The euro is never
 * converted, so it is never marked up.
 *
 * @param {number} referenceRate Euros one unit buys at the reference rate.
 * @param {string} code The currency's ISO code.
 *
 * @returns {number} Euros one unit costs once the bank has taken its cut.
 */
export function bankRate(referenceRate: number, code: string): number {
    return code !== EURO.code ? referenceRate * (1 + BANK_MARKUP) : referenceRate;
}
