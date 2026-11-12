import type { Maybe } from 'models';
import { categoriesOf } from 'modules/budget/budget-categories';
import { EURO } from 'modules/budget/budget-currencies';
import { daysInMonth, isSameMonth, monthKey, monthStart, shiftMonth, startOfDay } from 'modules/budget/budget-dates';
import type { BudgetDocument, Category, MonthlyBudget, Operation } from 'modules/budget/budget-models';

/**
 * @interface MonthSummary
 * @description The figures around a month's budget ring.
 */
export interface MonthSummary {
    limit: number; /*!< The month's budget */
    spent: number; /*!< Euros spent in the month */
    left: number; /*!< Euros left, negative once overspent */
    daysLeft: number; /*!< Days left in the month, today included */
    perDay: number; /*!< What can still be spent each remaining day */
    progress: number; /*!< Share of the budget spent, between 0 and 1 */
}

/**
 * @interface CategorySpend
 * @description What one category spent against its limit in a month.
 */
export interface CategorySpend {
    category: Category; /*!< The category */
    spent: number; /*!< Euros spent under it */
    limit: number; /*!< Its limit for the month, 0 when unset */
    progress: number; /*!< Share of the limit spent, between 0 and 1 */
    isOverBudget: boolean; /*!< Whether it spent past a set limit */
}

/**
 * @interface DayGroup
 * @description The operations of one day, the way History groups them.
 */
export interface DayGroup {
    date: Date; /*!< The day's midnight */
    operations: Operation[]; /*!< Its operations, latest first */
    spent: number; /*!< Their euro total */
}

/**
 * @function euroAmount
 * @description What an operation cost in euros, at the rate it was logged with.
 */
export function euroAmount(operation: Operation): number {
    return operation.amount * operation.rateToEuro;
}

/**
 * @function operationsIn
 * @description The operations dated in a month.
 */
export function operationsIn(operations: readonly Operation[], month: Date): Operation[] {
    return operations.filter((operation) => isSameMonth(operation.date, month));
}

/**
 * @function daysLeft
 * @description Days left in a month, today included. A past month has none and a future one has all of its days.
 */
export function daysLeft(month: Date, now: Date = new Date()): number {
    const total = daysInMonth(month);

    if (isSameMonth(month, now)) {
        return Math.max(0, total - now.getDate() + 1);
    }

    return month.getTime() < monthStart(now).getTime() ? 0 : total;
}

/**
 * @function liveBudget
 * @description The budget as it stands today: the monthly limit and each category's current limit.
 */
export function liveBudget(document: BudgetDocument): MonthlyBudget {
    return {
        monthlyLimit: document.budget.monthlyLimit,
        categoryLimits: Object.fromEntries(categoriesOf(document.categories).map((category) => [category.id, category.monthlyLimit]))
    };
}

/**
 * @function isPastMonth
 * @description Whether a month is over: it keeps a budget of its own, while the current month and the next ones share
 * the live one.
 */
export function isPastMonth(month: Date, now: Date = new Date()): boolean {
    return monthStart(month).getTime() < monthStart(now).getTime();
}

/**
 * @function monthlyBudgetFor
 * @description The budget a month is measured against: its own once it is over, or the live one.
 */
export function monthlyBudgetFor(document: BudgetDocument, month: Date): MonthlyBudget {
    return document.budgetHistory[monthKey(month)] ?? liveBudget(document);
}

/**
 * @interface BudgetEdit
 * @description A month's budget as typed in the limits sheet, where a value left empty keeps the stored one.
 */
export interface BudgetEdit {
    monthlyLimit: Maybe<number>; /*!< The monthly budget, none to keep it */
    categoryLimits: Record<string, Maybe<number>>; /*!< Each category's limit by id, none to keep it */
}

/**
 * @function withMonthlyBudget
 * @description Stores the budget typed for a month. A past month only changes its own budget; the current month
 * changes the live one, which every month after it starts from.
 *
 * @param {BudgetDocument} document The document.
 * @param {Date} month The month edited.
 * @param {BudgetEdit} edit The budget typed.
 * @param {Date} now The current date.
 *
 * @returns {BudgetDocument} The document with the month's budget stored.
 */
export function withMonthlyBudget(document: BudgetDocument, month: Date, edit: BudgetEdit, now: Date = new Date()): BudgetDocument {
    if (!isPastMonth(month, now)) {
        return {
            ...document,
            budget: { monthlyLimit: edit.monthlyLimit ?? document.budget.monthlyLimit },
            categories: categoriesOf(document.categories).map((category) => ({ ...category, monthlyLimit: edit.categoryLimits[category.id] ?? category.monthlyLimit }))
        };
    }

    const stored = monthlyBudgetFor(document, month);
    const categoryLimits = { ...stored.categoryLimits };

    for (const [id, limit] of Object.entries(edit.categoryLimits)) {
        if (limit !== null) {
            categoryLimits[id] = limit;
        }
    }

    const budget = { monthlyLimit: edit.monthlyLimit ?? stored.monthlyLimit, categoryLimits };

    return { ...document, budgetHistory: { ...document.budgetHistory, [monthKey(month)]: budget } };
}

/**
 * @function summary
 * @description The figures around a month's budget ring.
 */
export function summary(operations: readonly Operation[], month: Date, budget: MonthlyBudget, now: Date = new Date()): MonthSummary {
    const spent = operationsIn(operations, month).reduce((total, operation) => total + euroAmount(operation), 0);
    const left = budget.monthlyLimit - spent;
    const remaining = daysLeft(month, now);
    let progress = spent > 0 ? 1 : 0;

    if (budget.monthlyLimit > 0) {
        progress = Math.min(1, Math.max(0, spent / budget.monthlyLimit));
    }

    return {
        limit: budget.monthlyLimit,
        spent,
        left,
        daysLeft: remaining,
        perDay: remaining > 0 ? Math.max(0, left) / remaining : 0,
        progress
    };
}

/**
 * @function categorySpends
 * @description What each category spent against its limit in a month, in category order.
 */
export function categorySpends(operations: readonly Operation[], categories: readonly Category[], month: Date, budget: MonthlyBudget): CategorySpend[] {
    const totals = new Map<string, number>();

    for (const operation of operationsIn(operations, month)) {
        totals.set(operation.categoryId, (totals.get(operation.categoryId) ?? 0) + euroAmount(operation));
    }

    return categoriesOf(categories).map((category) => {
        const spent = totals.get(category.id) ?? 0;
        const limit = budget.categoryLimits[category.id] ?? 0;
        let progress = spent > 0 ? 1 : 0;

        if (limit > 0) {
            progress = Math.min(1, spent / limit);
        }

        return { category, spent, limit, progress, isOverBudget: spent > limit && limit > 0 };
    });
}

/**
 * @function toDispatch
 * @description How much of the monthly budget no category limit claims yet. Negative when the limits add up to more.
 */
export function toDispatch(categories: readonly Category[], budget: MonthlyBudget): number {
    const allocated = categoriesOf(categories).reduce((total, category) => total + (budget.categoryLimits[category.id] ?? 0), 0);

    return budget.monthlyLimit - allocated;
}

/**
 * @function dayGroups
 * @description Operations grouped by day, latest day first and latest operation first within it.
 */
export function dayGroups(operations: readonly Operation[]): DayGroup[] {
    const groups = new Map<number, Operation[]>();

    for (const operation of operations) {
        const day = startOfDay(operation.date).getTime();

        groups.set(day, [...(groups.get(day) ?? []), operation]);
    }

    return [...groups.entries()]
        .sort(([left], [right]) => right - left)
        .map(([day, members]) => {
            const sorted = members.toSorted((left, right) => right.date.getTime() - left.date.getTime());

            return {
                date: new Date(day),
                operations: sorted,
                spent: sorted.reduce((total, operation) => total + euroAmount(operation), 0)
            };
        });
}

/**
 * @function sealCompletedMonths
 * @description Gives every finished month that has none yet a budget of its own, copied from the live one, so changing
 * the live limits later never rewrites how a past month went. That budget stays editable on its own. The app does the
 * same on launch; whichever side gets there first seals the month.
 *
 * @param {BudgetDocument} document The document.
 * @param {Date} now The current date.
 *
 * @returns {BudgetDocument} The document with every finished month sealed.
 */
export function sealCompletedMonths(document: BudgetDocument, now: Date = new Date()): BudgetDocument {
    const earliest = document.operations.reduce<Maybe<Date>>((first, operation) => (first === null || operation.date < first ? operation.date : first), null);

    if (earliest === null) {
        return document;
    }

    const snapshot = liveBudget(document);
    const history = { ...document.budgetHistory };
    const current = monthStart(now);

    for (let month = monthStart(earliest); month < current; month = shiftMonth(month, 1)) {
        history[monthKey(month)] ??= snapshot;
    }

    return { ...document, budgetHistory: history };
}

/**
 * @function latestLocation
 * @description Where the most recent in-person operation happened, to suggest it for the next one.
 */
export function latestLocation(operations: readonly Operation[]): Maybe<string> {
    const latest = operations.toSorted((left, right) => right.date.getTime() - left.date.getTime())
        .find((operation) => !operation.isOnline && (operation.location ?? '') !== '');

    return latest?.location ?? null;
}

/**
 * @function recentLocations
 * @description The places operations happened at, most recent first and each only once.
 */
export function recentLocations(operations: readonly Operation[]): string[] {
    const locations = new Map<string, string>();

    for (const operation of operations.toSorted((left, right) => right.date.getTime() - left.date.getTime())) {
        const location = operation.location?.trim() ?? '';

        if (location !== '' && !locations.has(location.toLowerCase())) {
            locations.set(location.toLowerCase(), location);
        }
    }

    return [...locations.values()];
}

/**
 * @constant WORD_SEPARATORS
 * @description What separates the words of a name or a place, so a suggestion matches from any of its words.
 */
const WORD_SEPARATORS = /[\s'’-]+/u;

/**
 * @function foldText
 * @description Reduces a text for matching what is typed against it: trimmed, in lower case and without accents.
 */
export function foldText(text: string): string {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * @function rankMatch
 * @description How well a text matches what is typed, already folded: 2 when it starts with it, 1 when one of its other
 * words does, 0 when it doesn't match.
 */
export function rankMatch(text: string, typed: string): number {
    const folded = foldText(text);

    if (folded.startsWith(typed)) {
        return 2;
    }

    return folded.split(WORD_SEPARATORS).some((word) => word.startsWith(typed)) ? 1 : 0;
}

/**
 * @interface NameUse
 * @description How an operation name has been used, to rank it among the suggestions.
 */
interface NameUse {
    name: string; /*!< The name, as last written */
    rank: number; /*!< How well it matches what is typed */
    count: number; /*!< How many operations bear it */
    latest: number; /*!< When it was last used, in milliseconds */
}

/**
 * @function compareNameUses
 * @description Orders the names suggested: the best match first, then the most used, then the latest.
 */
function compareNameUses(left: NameUse, right: NameUse): number {
    return right.rank - left.rank || right.count - left.count || right.latest - left.latest;
}

/**
 * @function nameSuggestions
 * @description The names of earlier operations matching what is typed, each once as last written, the best match, the
 * most used and the latest first. The name typed in full is left out: there is nothing left to complete.
 */
export function nameSuggestions(operations: readonly Operation[], typed: string, limit: number = 5): string[] {
    const folded = foldText(typed);
    const uses = new Map<string, NameUse>();

    if (folded === '') {
        return [];
    }

    for (const operation of operations) {
        const key = foldText(operation.name);
        const rank = rankMatch(operation.name, folded);
        const time = operation.date.getTime();
        const known = uses.get(key);

        if (key === folded || rank === 0) {
            continue;
        }

        if (known === undefined) {
            uses.set(key, { name: operation.name.trim(), rank, count: 1, latest: time });
            continue;
        }

        known.count += 1;

        if (time > known.latest) {
            known.latest = time;
            known.name = operation.name.trim();
        }
    }

    return [...uses.values()].toSorted(compareNameUses).slice(0, limit).map((use) => use.name);
}

/**
 * @function locationSuggestions
 * @description The places of earlier operations matching what is typed, the best match first, then the most recent. The
 * place typed in full is left out.
 */
export function locationSuggestions(operations: readonly Operation[], typed: string, limit: number = 3): string[] {
    const folded = foldText(typed);

    if (folded === '') {
        return [];
    }

    const matching = recentLocations(operations).filter((location) => foldText(location) !== folded && rankMatch(location, folded) > 0);

    return matching.toSorted((left, right) => rankMatch(right, folded) - rankMatch(left, folded)).slice(0, limit);
}

/**
 * @function lastUsedCurrency
 * @description The currency of the latest operation, which the next one most likely shares. The app remembers the
 * last currency picked on the phone; the bot reads the same intent off the data.
 */
export function lastUsedCurrency(operations: readonly Operation[]): string {
    const latest = operations.reduce<Maybe<Operation>>((last, operation) => (last === null || operation.date > last.date ? operation : last), null);

    return latest?.currencyCode ?? EURO.code;
}

/**
 * @function monthsWithOperations
 * @description Every month holding an operation, plus the current one, latest first.
 */
export function monthsWithOperations(operations: readonly Operation[], now: Date = new Date()): Date[] {
    const keys = new Set([monthKey(now), ...operations.map((operation) => monthKey(operation.date))]);

    return [...keys].sort().reverse().map((key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
}
