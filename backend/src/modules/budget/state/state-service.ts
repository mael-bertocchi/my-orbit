import type { Prisma, PrismaClient } from 'prisma/generated/prisma/client';
import type { StoredStateBody } from 'src/modules/budget/state/state-models';
import { StoredCategoryLimitsSchema } from 'src/modules/budget/state/state-models';
import { OWNER_ID } from 'src/plugins/identity';

/**
 * @constant DEFAULT_MONTHLY_LIMIT
 * @description The monthly budget assumed before the client has ever stored its settings.
 */
export const DEFAULT_MONTHLY_LIMIT = 3000;

/**
 * @function pullState
 * @description Reads the whole budget document back for the owner, in the order the client expects to render it. The
 * operations in the trash are left out.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<StoredStateBody>} The full budget document and its revision.
 */
export async function pullState(prisma: PrismaClient): Promise<StoredStateBody> {
    const [categories, operations, history, state] = await Promise.all([
        prisma.budgetCategory.findMany({ orderBy: { position: 'asc' } }),
        prisma.budgetOperation.findMany({ where: { deletedAt: null }, orderBy: { date: 'desc' } }),
        prisma.budgetHistory.findMany({ orderBy: { month: 'asc' } }),
        prisma.budgetState.findUnique({ where: { id: OWNER_ID } })
    ]);

    return {
        categories: categories.map((category) => ({
            id: category.id,
            name: category.name,
            symbol: category.symbol,
            colorHex: category.colorHex,
            monthlyLimit: category.monthlyLimit
        })),
        operations: operations.map((operation) => ({
            id: operation.id,
            date: operation.date,
            name: operation.name,
            description: operation.description,
            categoryId: operation.categoryId,
            location: operation.location,
            amount: operation.amount,
            currencyCode: operation.currencyCode,
            rateToEuro: operation.rateToEuro,
            isOnline: operation.isOnline,
            isRecurring: operation.isRecurring,
            recurringId: operation.recurringId,
            updatedAt: operation.updatedAt
        })),
        budget: { monthlyLimit: state?.monthlyLimit ?? DEFAULT_MONTHLY_LIMIT },
        budgetHistory: Object.fromEntries(
            history.map((entry) => [
                entry.month,
                {
                    monthlyLimit: entry.monthlyLimit,
                    categoryLimits: StoredCategoryLimitsSchema.parse(entry.categoryLimits)
                }
            ])
        ),
        revision: state?.revision ?? 0
    };
}

/**
 * @function bumpRevision
 * @description Moves the budget on to its next revision. Every write calls it inside its own transaction, so a client
 * comparing revisions sees any change, whichever route made it.
 *
 * @param {Prisma.TransactionClient} transaction The open transaction.
 *
 * @returns {Promise<number>} The new revision.
 */
export async function bumpRevision(transaction: Prisma.TransactionClient): Promise<number> {
    const state = await transaction.budgetState.upsert({
        where: { id: OWNER_ID },
        update: { revision: { increment: 1 } },
        create: { id: OWNER_ID, monthlyLimit: DEFAULT_MONTHLY_LIMIT, revision: 1 }
    });

    return state.revision;
}
