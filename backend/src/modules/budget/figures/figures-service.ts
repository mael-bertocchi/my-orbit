import type { PrismaClient } from 'prisma/generated/prisma/client';
import type { MonthComparison, MonthTotal, Spending, SpendingHabits } from 'src/modules/budget/figures/figures-math';
import { compareMonth, latestPlace, monthOf, monthTotals, nameSuggestions, placeSuggestions, spendingHabits, spendingOf } from 'src/modules/budget/figures/figures-math';
import type { PlaceReference } from 'src/modules/budget/places/places-models';
import type { OperationRow } from 'src/modules/budget/places/places-service';
import { WITH_PLACE } from 'src/modules/budget/places/places-service';
import type { Maybe } from 'src/shared/models';

/**
 * @interface MonthFigures
 * @description What a month spent, and in the current month how it compares with the usual.
 */
export interface MonthFigures extends Spending {
    month: string; /*!< The month, as `YYYY-MM` */
    today: string; /*!< The owner's day the figures were worked out on, as `YYYY-MM-DD` */
    operationCount: number; /*!< How many operations it holds */
    comparison: Maybe<MonthComparison>; /*!< The current month against the usual, null for any other month */
}

/**
 * @interface AnalysisFigures
 * @description What the Analysis tab shows: the last twelve months and the recent habits.
 */
export interface AnalysisFigures {
    today: string; /*!< The owner's day the figures were worked out on, as `YYYY-MM-DD` */
    months: MonthTotal[]; /*!< The last twelve months, the oldest first */
    habits: SpendingHabits; /*!< The habits of the last ninety days */
}

/**
 * @interface Suggestions
 * @description What the operation editor suggests.
 */
export interface Suggestions {
    names: string[]; /*!< The names of earlier operations matching the name typed */
    places: PlaceReference[]; /*!< The cities of earlier operations matching the city typed */
    latestPlace: Maybe<PlaceReference>; /*!< The city of the latest in-person operation, for a new one */
}

/**
 * @function liveRows
 * @description Reads every operation in the budget, the latest first, the trash left out.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<OperationRow[]>} The operations.
 */
async function liveRows(prisma: PrismaClient): Promise<OperationRow[]> {
    return await prisma.budgetOperation.findMany({ where: { deletedAt: null }, orderBy: [{ day: 'desc' }, { time: 'desc' }], include: WITH_PLACE });
}

/**
 * @function monthFigures
 * @description Works out what a month spent, in all and per category, and in the current month how it compares with
 * what the past months usually had by the same day, which needs every month: the whole budget is read.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} month The month, as `YYYY-MM`.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<MonthFigures>} The figures.
 */
export async function monthFigures(prisma: PrismaClient, month: string, today: string): Promise<MonthFigures> {
    const rows = await liveRows(prisma);
    const inMonth = rows.filter((row) => monthOf(row.day) === month);

    return { month, today, operationCount: inMonth.length, ...spendingOf(inMonth), comparison: month === monthOf(today) ? compareMonth(rows, today) : null };
}

/**
 * @function analysisFigures
 * @description Works out what the Analysis tab shows.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<AnalysisFigures>} The figures.
 */
export async function analysisFigures(prisma: PrismaClient, today: string): Promise<AnalysisFigures> {
    const rows = await liveRows(prisma);

    return { today, months: monthTotals(rows, today), habits: spendingHabits(rows, today) };
}

/**
 * @function suggestionsFor
 * @description Works out what the operation editor suggests for what is typed.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} name The name typed.
 * @param {string} city The city typed.
 *
 * @returns {Promise<Suggestions>} The suggestions.
 */
export async function suggestionsFor(prisma: PrismaClient, name: string, city: string): Promise<Suggestions> {
    const rows = await liveRows(prisma);

    return { names: nameSuggestions(rows, name), places: placeSuggestions(rows, city), latestPlace: latestPlace(rows) };
}
