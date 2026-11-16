import type { Category } from 'modules/budget/budget-models';
import { isMessageKey, t } from 'modules/language/language-service';

/**
 * @constant DEFAULT_CATEGORIES
 * @description The catalogue the app ships with, used when the server has never been sent any category.
 */
export const DEFAULT_CATEGORIES: readonly Category[] = [
    { id: 'groceries', name: 'Groceries', symbol: 'cart', colorHex: 0x3ecf8e, monthlyLimit: 400 },
    { id: 'restaurant', name: 'Restaurant', symbol: 'fork.knife', colorHex: 0xffa23e, monthlyLimit: 250 },
    { id: 'bar', name: 'Bar', symbol: 'wineglass', colorHex: 0x8fe05c, monthlyLimit: 100 },
    { id: 'coffee', name: 'Coffee', symbol: 'cup.and.saucer', colorHex: 0xdf74e7, monthlyLimit: 50 },
    { id: 'transport', name: 'Transport', symbol: 'tram', colorHex: 0x4d9bff, monthlyLimit: 150 },
    { id: 'shopping', name: 'Shopping', symbol: 'bag', colorHex: 0xff6ba8, monthlyLimit: 180 },
    { id: 'fun', name: 'Fun', symbol: 'film', colorHex: 0x38d6d6, monthlyLimit: 120 },
    { id: 'selfcare', name: 'Selfcare', symbol: 'cross.case', colorHex: 0xff8a5c, monthlyLimit: 80 },
    { id: 'school', name: 'Study', symbol: 'graduationcap', colorHex: 0xffd166, monthlyLimit: 120 },
    { id: 'administrative', name: 'Administrative', symbol: 'doc.text', colorHex: 0xc9a27e, monthlyLimit: 50 },
    { id: 'telecom', name: 'Telecom', symbol: 'wifi', colorHex: 0x7b8cff, monthlyLimit: 60 }
];

/**
 * @constant FALLBACK_CATEGORY
 * @description What an operation filed under an unknown category is drawn as.
 */
export const FALLBACK_CATEGORY: Category = {
    id: 'uncategorized',
    name: 'Uncategorized',
    symbol: 'circle.dashed',
    colorHex: 0xa78bfa,
    monthlyLimit: 0
};

/**
 * @function hexColor
 * @description A packed 0xRRGGBB colour as CSS.
 */
export function hexColor(value: number): string {
    return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * @constant CATALOGUE
 * @description The shipped categories, by id.
 */
const CATALOGUE = new Map(DEFAULT_CATEGORIES.map((category) => [category.id, category]));

/**
 * @function categoriesOf
 * @description The categories to offer: the stored ones, or the shipped catalogue when none were ever stored. As in the
 * app, the catalogue owns how a shipped category looks (its name, symbol and colour) and its order, and the stored copy
 * only its limit, so a new icon reaches a budget stored before it. A category shipped after the budget was stored joins
 * it with no limit, so it does not eat into limits already dispatched, and the rest of the stored ones follow the
 * catalogue.
 *
 * @param {readonly Category[]} categories The stored categories.
 *
 * @returns {readonly Category[]} The categories to offer.
 */
export function categoriesOf(categories: readonly Category[]): readonly Category[] {
    if (categories.length === 0) {
        return DEFAULT_CATEGORIES;
    }

    const stored = new Map(categories.map((category) => [category.id, category]));
    const shipped = DEFAULT_CATEGORIES.map((category) => ({ ...category, monthlyLimit: stored.get(category.id)?.monthlyLimit ?? 0 }));

    return [...shipped, ...categories.filter((category) => !CATALOGUE.has(category.id))];
}

/**
 * @function categoryName
 * @description The name to show. The budget keeps the English name whatever language each device is in, so the
 * categories the app knows are translated by id, and anything else shows the name it was stored with.
 *
 * @param {Category} category The category.
 *
 * @returns {string} Its name in the page's language.
 */
export function categoryName(category: Category): string {
    const key = `category.${category.id}`;

    return isMessageKey(key) ? t(key) : category.name;
}

/**
 * @function categoryOrFallback
 * @description Looks a category up by id, falling back to the uncategorized stand-in.
 *
 * @param {readonly Category[]} categories The stored categories.
 * @param {string} id The id to find.
 *
 * @returns {Category} The category.
 */
export function categoryOrFallback(categories: readonly Category[], id: string): Category {
    return categoriesOf(categories).find((category) => category.id === id) ?? FALLBACK_CATEGORY;
}
