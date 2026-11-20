import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import { monthOf, shiftMonth } from 'src/modules/budget/figures/figures-math';
import type { MonthlyBudget } from 'src/modules/budget/history/history-models';
import { StoredCategoryLimitsSchema } from 'src/modules/budget/state/state-models';
import { bumpRevision, DEFAULT_MONTHLY_LIMIT } from 'src/modules/budget/state/state-service';
import { OWNER_ID } from 'src/plugins/identity';
import { RequestError } from 'src/shared/models';

/**
 * @function storeMonth
 * @description Freezes the budget of a finished month, or replaces what was frozen. Sealing the same month twice is
 * harmless.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} month The month, as `YYYY-MM`.
 * @param {MonthlyBudget} body Its budget.
 *
 * @returns {Promise<MonthlyBudget>} The stored budget.
 */
export async function storeMonth(prisma: PrismaClient, month: string, body: MonthlyBudget): Promise<MonthlyBudget> {
    return await prisma.$transaction(async (transaction) => {
        const row = await transaction.budgetHistory.upsert({
            where: { month },
            update: body,
            create: { month, ...body }
        });

        await bumpRevision(transaction);

        return { monthlyLimit: row.monthlyLimit, categoryLimits: StoredCategoryLimitsSchema.parse(row.categoryLimits) };
    });
}

/**
 * @function deleteMonth
 * @description Forgets the budget frozen against a month.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} month The month, as `YYYY-MM`.
 *
 * @returns {Promise<void>} Resolves once it is forgotten.
 */
export async function deleteMonth(prisma: PrismaClient, month: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
        const removed = await transaction.budgetHistory.deleteMany({ where: { month } });

        if (removed.count === 0) {
            throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown month');
        }

        await bumpRevision(transaction);
    });
}

/**
 * @function sealCompletedMonths
 * @description Gives every finished month since the first operation that has none yet a budget of its own, copied from
 * the live one, so changing the live limits later never rewrites how a past month went. That budget stays editable on
 * its own. Sealing twice is harmless: a month already sealed is left as it is.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<void>} Resolves once every finished month is sealed.
 */
export async function sealCompletedMonths(prisma: PrismaClient, today: string): Promise<void> {
    const earliest = await prisma.budgetOperation.aggregate({ where: { deletedAt: null }, _min: { day: true } });
    const first = earliest._min.day;

    if (first === null) {
        return;
    }

    const current = monthOf(today);
    const sealed = new Set((await prisma.budgetHistory.findMany({ select: { month: true } })).map((row) => row.month));
    const missing: string[] = [];

    for (let month = monthOf(first); month < current; month = shiftMonth(month, 1)) {
        if (!sealed.has(month)) {
            missing.push(month);
        }
    }

    if (missing.length === 0) {
        return;
    }

    const [categories, state] = await Promise.all([
        prisma.budgetCategory.findMany(),
        prisma.budgetState.findUnique({ where: { id: OWNER_ID } })
    ]);
    const monthlyLimit = state?.monthlyLimit ?? DEFAULT_MONTHLY_LIMIT;
    const categoryLimits = Object.fromEntries(categories.map((category) => [category.id, category.monthlyLimit]));

    await prisma.$transaction(async (transaction) => {
        await transaction.budgetHistory.createMany({ data: missing.map((month) => ({ month, monthlyLimit, categoryLimits })), skipDuplicates: true });
        await bumpRevision(transaction);
    });
}
