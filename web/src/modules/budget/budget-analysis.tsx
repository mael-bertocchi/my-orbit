import type { Maybe } from 'models';
import { categoriesOf } from 'modules/budget/budget-categories';
import { monthKey, monthStart, shiftMonth, startOfDay } from 'modules/budget/budget-dates';
import { whereabouts } from 'modules/budget/budget-formatting';
import { euroAmount, monthlyBudgetFor, operationsIn } from 'modules/budget/budget-math';
import type { BudgetDocument, Category, Operation } from 'modules/budget/budget-models';

/**
 * @constant REFERENCE_MONTHS
 * @description How many past months "usual" is measured on, at most.
 */
const REFERENCE_MONTHS = 6;

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
 * @function referenceMonths
 * @description The past months "usual" is measured on: the latest ones holding operations, before the month and at
 * most six, latest first.
 *
 * @param {readonly Operation[]} operations Every operation.
 * @param {Date} month The month measured.
 *
 * @returns {Date[]} The first day of each reference month.
 */
export function referenceMonths(operations: readonly Operation[], month: Date): Date[] {
    const current = monthStart(month).getTime();
    const keys = new Set(operations.filter((operation) => monthStart(operation.date).getTime() < current).map((operation) => monthKey(operation.date)));

    return [...keys].sort().reverse().slice(0, REFERENCE_MONTHS).map((key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
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
 * @description The current month so far against the same point of the reference months: by today's day, or by their
 * last day when they are shorter. Comparing at the same day keeps a rent paid on the 1st, or a month only half gone,
 * from reading as a rise or a fall.
 *
 * @param {BudgetDocument} document The budget.
 * @param {Date} now The current date.
 *
 * @returns {MonthComparison} The comparison.
 */
export function compareMonth(document: BudgetDocument, now: Date = new Date()): MonthComparison {
    const month = monthStart(now);
    const today = now.getDate();
    const references = referenceMonths(document.operations, month);
    const current = operationsIn(document.operations, month).filter((operation) => operation.date.getDate() <= today);
    const past = references.map((reference) => operationsIn(document.operations, reference).filter((operation) => operation.date.getDate() <= today));
    const count = Math.max(1, references.length);

    /**
     * @function usualFor
     * @description What the reference months usually spent by today, on the operations a filter keeps.
     */
    const usualFor = (keep: (operation: Operation) => boolean): number => past.reduce((total, operations) => total + operations.filter(keep).reduce((sum, operation) => sum + euroAmount(operation), 0), 0) / count;

    const categories = categoriesOf(document.categories).map((category) => {
        const isOf = (operation: Operation): boolean => operation.categoryId === category.id;
        const spent = current.filter(isOf).reduce((total, operation) => total + euroAmount(operation), 0);
        const usual = references.length > 0 ? usualFor(isOf) : 0;

        return { category, spent, usual, change: changeOf(spent, usual) };
    });

    const spent = current.reduce((total, operation) => total + euroAmount(operation), 0);
    const usual = references.length > 0 ? usualFor(() => true) : 0;
    const shown = categories.filter((comparison) => comparison.spent > 0 || comparison.usual > 0).toSorted((left, right) => (right.spent - right.usual) - (left.spent - left.usual));

    return { referenceCount: references.length, spent, usual, change: changeOf(spent, usual), categories: shown };
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

    if (comparison.change === null) {
        return comparison.spent >= NOTABLE_AMOUNT;
    }

    return Math.abs(comparison.change) >= NOTABLE_CHANGE && Math.abs(comparison.spent - comparison.usual) >= NOTABLE_AMOUNT;
}

/**
 * @constant TREND_MONTHS
 * @description How many months the trends cover, the current one included.
 */
const TREND_MONTHS = 12;

/**
 * @constant HABIT_DAYS
 * @description How many days back the habits are measured on.
 */
const HABIT_DAYS = 90;

/**
 * @constant TOP_PLACES
 * @description How many places the habits list.
 */
const TOP_PLACES = 5;

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
 * first. The months before the first operation are left out.
 *
 * @param {BudgetDocument} document The budget.
 * @param {Date} now The current date.
 *
 * @returns {MonthTotal[]} The months.
 */
export function monthTotals(document: BudgetDocument, now: Date = new Date()): MonthTotal[] {
    const current = monthStart(now);
    const earliest = document.operations.reduce((first, operation) => (operation.date < first ? operation.date : first), current);
    const first = monthStart(earliest).getTime() > shiftMonth(current, 1 - TREND_MONTHS).getTime() ? monthStart(earliest) : shiftMonth(current, 1 - TREND_MONTHS);
    const totals: MonthTotal[] = [];

    for (let month = first; month.getTime() <= current.getTime(); month = shiftMonth(month, 1)) {
        const operations = operationsIn(document.operations, month);
        const byCategory: Record<string, number> = {};

        for (const operation of operations) {
            byCategory[operation.categoryId] = (byCategory[operation.categoryId] ?? 0) + euroAmount(operation);
        }

        totals.push({ month, spent: operations.reduce((total, operation) => total + euroAmount(operation), 0), limit: monthlyBudgetFor(document, month).monthlyLimit, byCategory, isCurrent: month.getTime() === current.getTime() });
    }

    return totals;
}

/**
 * @function spendingHabits
 * @description How the last ninety days were spent, recurring operations left out: what each weekday costs on average,
 * the share paid online, and the places most spent at.
 *
 * @param {BudgetDocument} document The budget.
 * @param {Date} now The current date.
 *
 * @returns {SpendingHabits} The habits.
 */
export function spendingHabits(document: BudgetDocument, now: Date = new Date()): SpendingHabits {
    const today = startOfDay(now);
    const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - HABIT_DAYS + 1);
    const operations = document.operations.filter((operation) => (operation.recurringId ?? '') === '' && operation.date >= since && operation.date <= now);
    const totals = Array.from({ length: 7 }, () => 0);
    const counts = Array.from({ length: 7 }, () => 0);
    const places = new Map<string, PlaceSpend>();

    for (let day = new Date(since); day <= today; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
        counts[day.getDay()] = (counts[day.getDay()] ?? 0) + 1;
    }

    for (const operation of operations.toSorted((left, right) => left.date.getTime() - right.date.getTime())) {
        const weekday = operation.date.getDay();
        const location = whereabouts(operation);

        totals[weekday] = (totals[weekday] ?? 0) + euroAmount(operation);

        if (!operation.isOnline && location !== '') {
            const key = operation.place?.id ?? location.toLowerCase();
            const known = places.get(key);

            places.set(key, { name: location, spent: (known?.spent ?? 0) + euroAmount(operation), count: (known?.count ?? 0) + 1 });
        }
    }

    const weekdays = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, average: (totals[weekday] ?? 0) / Math.max(1, counts[weekday] ?? 0) }));
    const online = operations.filter((operation) => operation.isOnline).reduce((total, operation) => total + euroAmount(operation), 0);
    const inPerson = operations.filter((operation) => !operation.isOnline).reduce((total, operation) => total + euroAmount(operation), 0);

    return { since, weekdays, online, inPerson, places: [...places.values()].toSorted((left, right) => right.spent - left.spent).slice(0, TOP_PLACES) };
}
