import type { Maybe } from 'models';
import { categoriesOf } from 'modules/budget/budget-categories';
import { daysInMonth, isSameMonth, monthKey, monthStart, startOfDay } from 'modules/budget/budget-dates';
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
    dailyAverage: number; /*!< Euros spent on average each day of the month */
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
 * @description The figures around a month's budget ring, from what it spent as the server worked it out.
 */
export function summary(spent: number, month: Date, budget: MonthlyBudget, now: Date = new Date()): MonthSummary {
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
        dailyAverage: spent / daysInMonth(month),
        progress
    };
}

/**
 * @function categorySpends
 * @description What each category spent against its limit in a month, in category order, from what each spent as the
 * server worked it out.
 */
export function categorySpends(byCategory: Readonly<Record<string, number>>, categories: readonly Category[], budget: MonthlyBudget): CategorySpend[] {
    return categoriesOf(categories).map((category) => {
        const spent = byCategory[category.id] ?? 0;
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
 * @function foldText
 * @description Reduces a text for matching what is typed against it: trimmed, in lower case and without accents.
 */
export function foldText(text: string): string {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

