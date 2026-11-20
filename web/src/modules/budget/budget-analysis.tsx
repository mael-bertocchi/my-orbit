import type { Maybe } from 'models';
import { categoriesOf } from 'modules/budget/budget-categories';
import { parseDayKey, parseMonthKey } from 'modules/budget/budget-dates';
import { whereabouts } from 'modules/budget/budget-formatting';
import { monthlyBudgetFor } from 'modules/budget/budget-math';
import type { AnalysisFigures, BudgetDocument, Category, MonthFigures } from 'modules/budget/budget-models';

/**
 * @constant NOTABLE_CHANGE
 * @description How far a category must stray from its usual spending, as a fraction, for the change to be worth showing.
 */
const NOTABLE_CHANGE = 0.15;

/**
 * @constant NOTABLE_AMOUNT
 * @description How many euros a category must stray from its usual spending for the change to be worth showing, so a
 * coffee more never reads as a rise.
 */
const NOTABLE_AMOUNT = 10;

/**
 * @interface CategoryComparison
 * @description What one category spent this month so far, against what it usually had by the same day.
 */
export interface CategoryComparison {
    category: Category; /*!< The category */
    spent: number; /*!< Euros spent this month so far */
    usual: number; /*!< Euros it usually had by the same day */
    change: Maybe<number>; /*!< The change as a fraction (0.4 for +40%), or null when it usually spent nothing */
}

/**
 * @interface MonthComparison
 * @description The current month so far against the same point of the reference months, in all and per category.
 */
export interface MonthComparison {
    referenceCount: number; /*!< How many past months "usual" is measured on, 0 without history */
    spent: number; /*!< Euros spent this month so far */
    usual: number; /*!< Euros usually spent by the same day */
    change: Maybe<number>; /*!< The change as a fraction, or null when nothing was usually spent */
    categories: CategoryComparison[]; /*!< Each category that spent this month or usually does, the largest rise first */
}

/**
 * @function changeOf
 * @description How much a figure moved from its usual value, as a fraction.
 *
 * @param {number} spent The figure.
 * @param {number} usual Its usual value.
 *
 * @returns {Maybe<number>} The change, or null when the usual value is nothing.
 */
function changeOf(spent: number, usual: number): Maybe<number> {
    return usual > 0 ? spent / usual - 1 : null;
}

/**
 * @function compareMonth
 * @description The current month so far against what the reference months usually had by the same day, in all and per
 * category, from the figures the server worked out: comparing at the same day keeps a rent paid on the 1st, or a month
 * only half gone, from reading as a rise or a fall.
 *
 * @param {BudgetDocument} document The budget.
 * @param {NonNullable<MonthFigures['comparison']>} comparison The month so far and the usual, as the server sent them.
 *
 * @returns {MonthComparison} The comparison.
 */
export function compareMonth(document: BudgetDocument, comparison: NonNullable<MonthFigures['comparison']>): MonthComparison {
    const categories = categoriesOf(document.categories).map((category) => {
        const spent = comparison.current.byCategory[category.id] ?? 0;
        const usual = comparison.usual.byCategory[category.id] ?? 0;

        return { category, spent, usual, change: changeOf(spent, usual) };
    });
    const shown = categories.filter((entry) => entry.spent > 0 || entry.usual > 0).toSorted((left, right) => (right.spent - right.usual) - (left.spent - left.usual));

    return { referenceCount: comparison.referenceCount, spent: comparison.current.spent, usual: comparison.usual.spent, change: changeOf(comparison.current.spent, comparison.usual.spent), categories: shown };
}

/**
 * @function isNotable
 * @description Whether a category's change from usual is worth showing: it spent something this month, since nothing
 * spent yet only means the month is young, and it strays from usual by at least 15% and 10 euros. One that usually spends
 * nothing counts once it spent 10 euros.
 *
 * @param {CategoryComparison} comparison The category, this month and usually.
 *
 * @returns {boolean} Whether to show its change.
 */
export function isNotable(comparison: CategoryComparison): boolean {
    if (comparison.spent <= 0) {
        return false;
    }

    if (comparison.change !== null) {
        return Math.abs(comparison.change) >= NOTABLE_CHANGE && Math.abs(comparison.spent - comparison.usual) >= NOTABLE_AMOUNT;
    }

    return comparison.spent >= NOTABLE_AMOUNT;
}

/**
 * @interface MonthTotal
 * @description What a month spent, in all and per category, against its budget.
 */
export interface MonthTotal {
    month: Date; /*!< The first day of the month */
    spent: number; /*!< Euros spent */
    limit: number; /*!< Its budget */
    byCategory: Record<string, number>; /*!< Euros spent per category id */
    isCurrent: boolean; /*!< Whether it is the current month, still under way */
}

/**
 * @interface WeekdaySpend
 * @description What a weekday usually costs.
 */
export interface WeekdaySpend {
    weekday: number; /*!< The weekday, 0 for Sunday like `Date.getDay` */
    average: number; /*!< Euros spent on such a day, on average */
}

/**
 * @interface PlaceSpend
 * @description Where money goes, place by place.
 */
export interface PlaceSpend {
    name: string; /*!< The place, as last written */
    spent: number; /*!< Euros spent there */
    count: number; /*!< How many operations */
}

/**
 * @interface SpendingHabits
 * @description How the recent spending is spread: over the weekdays, online and in person, and over the places. Recurring
 * operations are left out, since they say nothing of habits.
 */
export interface SpendingHabits {
    since: Date; /*!< The first day measured */
    weekdays: WeekdaySpend[]; /*!< Each weekday, Monday first */
    online: number; /*!< Euros spent online */
    inPerson: number; /*!< Euros spent in person */
    places: PlaceSpend[]; /*!< The places most spent at, the largest first */
}

/**
 * @function monthTotals
 * @description What each of the last twelve months spent, in all and per category, against its budget, the oldest
 * first, from the figures the server worked out.
 *
 * @param {BudgetDocument} document The budget.
 * @param {AnalysisFigures} figures The figures, as the server sent them.
 *
 * @returns {MonthTotal[]} The months.
 */
export function monthTotals(document: BudgetDocument, figures: AnalysisFigures): MonthTotal[] {
    return figures.months.flatMap((total) => {
        const month = parseMonthKey(total.month);

        return month !== null ? [{ month, spent: total.spent, limit: monthlyBudgetFor(document, month).monthlyLimit, byCategory: total.byCategory, isCurrent: total.isCurrent }] : [];
    });
}

/**
 * @function spendingHabits
 * @description How the last ninety days were spent, recurring operations left out, from the figures the server worked
 * out: each place reads in the page's language.
 *
 * @param {AnalysisFigures} figures The figures, as the server sent them.
 *
 * @returns {SpendingHabits} The habits.
 */
export function spendingHabits(figures: AnalysisFigures): SpendingHabits {
    const habits = figures.habits;
    const places = habits.places.map((entry) => ({ name: whereabouts(entry), spent: entry.spent, count: entry.count }));

    return { since: parseDayKey(habits.since) ?? new Date(), weekdays: habits.weekdays, online: habits.online, inPerson: habits.inPerson, places };
}
