import type { Prisma, PrismaClient } from 'prisma/generated/prisma/client';
import type { StoredStateBody } from 'src/modules/budget/state/state-models';
import { StoredCategoryLimitsSchema } from 'src/modules/budget/state/state-models';
import { OWNER_ID } from 'src/plugins/identity';
import { DEFAULT_TIME_ZONE, isTimeZone } from 'src/shared/owner-day';

/**
 * @constant DEFAULT_MONTHLY_LIMIT
 * @description The monthly budget assumed before the client has ever stored its settings.
 */
export const DEFAULT_MONTHLY_LIMIT = 3000;

/**
 * @function pullState
 * @description Reads the budget document back for the owner, in the order the client expects to render it, with how
 * many operations it holds outside the trash. The operations themselves are read a page at a time.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<StoredStateBody>} The budget document and its revision.
 */
export async function pullState(prisma: PrismaClient): Promise<StoredStateBody> {
    const [categories, history, state, operationCount] = await Promise.all([
        prisma.budgetCategory.findMany({ orderBy: { position: 'asc' } }),
        prisma.budgetHistory.findMany({ orderBy: { month: 'asc' } }),
        prisma.budgetState.findUnique({ where: { id: OWNER_ID } }),
        prisma.budgetOperation.count({ where: { deletedAt: null } })
    ]);

    return {
        categories: categories.map((category) => ({
            id: category.id,
            name: category.name,
            symbol: category.symbol,
            colorHex: category.colorHex,
            monthlyLimit: category.monthlyLimit
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
        operationCount,
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

/**
 * @function ownerTimeZone
 * @description The time zone the owner's days are counted in: the one an app last said its device is in.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<string>} The time zone, such as `Asia/Seoul`.
 */
export async function ownerTimeZone(prisma: PrismaClient): Promise<string> {
    const state = await prisma.budgetState.findUnique({ where: { id: OWNER_ID } });

    return state?.timeZone ?? DEFAULT_TIME_ZONE;
}

/**
 * @function followTimeZone
 * @description Keeps the time zone an app says its device is in, so the server counts the owner's days as the apps do.
 * A name the runtime does not know is ignored, and keeping it moves no revision on, since no entry changes.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {unknown} name The time zone the app sent, if any.
 *
 * @returns {Promise<string>} The owner's time zone, as it stands after.
 */
export async function followTimeZone(prisma: PrismaClient, name: unknown): Promise<string> {
    const current = await ownerTimeZone(prisma);

    if (typeof name !== 'string' || name === current || !isTimeZone(name)) {
        return current;
    }

    await prisma.budgetState.upsert({
        where: { id: OWNER_ID },
        update: { timeZone: name },
        create: { id: OWNER_ID, monthlyLimit: DEFAULT_MONTHLY_LIMIT, timeZone: name }
    });

    return name;
}
