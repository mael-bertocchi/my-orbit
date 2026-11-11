import { StatusCodes } from 'http-status-codes';
import type { BudgetOperation, Prisma, PrismaClient } from 'prisma/generated/prisma/client';
import type { Operation, OperationCreate, OperationUpdate, TrashedOperation } from 'src/modules/budget/operations/operations-models';
import { bumpRevision } from 'src/modules/budget/state/state-service';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';

/**
 * @function operationOf
 * @description An operation as the routes send it, from its stored row.
 *
 * @param {BudgetOperation} row The stored row.
 *
 * @returns {Operation} The operation.
 */
export function operationOf(row: BudgetOperation): Operation {
    return {
        id: row.id,
        date: row.date,
        name: row.name,
        description: row.description,
        categoryId: row.categoryId,
        location: row.location,
        amount: row.amount,
        currencyCode: row.currencyCode,
        rateToEuro: row.rateToEuro,
        isOnline: row.isOnline,
        isRecurring: row.isRecurring,
        recurringId: row.recurringId,
        updatedAt: row.updatedAt
    };
}

/**
 * @function trashedOf
 * @description An operation in the trash as the routes send it, from its stored row.
 *
 * @param {BudgetOperation} row The stored row, deleted.
 * @param {Date} deletedAt When it was deleted.
 *
 * @returns {TrashedOperation} The operation and when it was deleted.
 */
function trashedOf(row: BudgetOperation, deletedAt: Date): TrashedOperation {
    return { ...operationOf(row), deletedAt };
}

/**
 * @function findOperation
 * @description Reads one operation, in the budget or in the trash.
 *
 * @param {Prisma.TransactionClient} transaction The open transaction.
 * @param {string} id The operation's id.
 *
 * @returns {Promise<Maybe<BudgetOperation>>} Its row, or null when there is none.
 */
async function findOperation(transaction: Prisma.TransactionClient, id: string): Promise<Maybe<BudgetOperation>> {
    return await transaction.budgetOperation.findUnique({ where: { id } });
}

/**
 * @function listTrash
 * @description Reads the operations in the trash, the most recently deleted first.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<TrashedOperation[]>} The deleted operations.
 */
export async function listTrash(prisma: PrismaClient): Promise<TrashedOperation[]> {
    const rows = await prisma.budgetOperation.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } });

    return rows.flatMap((row) => (row.deletedAt === null ? [] : [trashedOf(row, row.deletedAt)]));
}

/**
 * @function createOperation
 * @description Logs an operation under the id the client minted. An id already taken, in the budget or in the trash,
 * is refused with a conflict, so a retried creation never logs the operation twice.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {OperationCreate} body The operation.
 *
 * @returns {Promise<Operation>} The stored operation.
 */
export async function createOperation(prisma: PrismaClient, body: OperationCreate): Promise<Operation> {
    return await prisma.$transaction(async (transaction) => {
        if (await findOperation(transaction, body.id) !== null) {
            throw new RequestError(StatusCodes.CONFLICT, 'An operation with this id already exists');
        }

        const row = await transaction.budgetOperation.create({
            data: { ...body, description: body.description ?? null, location: body.location ?? null }
        });

        await bumpRevision(transaction);

        return operationOf(row);
    });
}

/**
 * @function updateOperation
 * @description Changes the fields of an operation the request names. An operation in the trash has to be restored
 * before it can be changed.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The operation's id.
 * @param {OperationUpdate} body What changes.
 *
 * @returns {Promise<Operation>} The stored operation.
 */
export async function updateOperation(prisma: PrismaClient, id: string, body: OperationUpdate): Promise<Operation> {
    return await prisma.$transaction(async (transaction) => {
        const existing = await findOperation(transaction, id);

        if (existing === null || existing.deletedAt !== null) {
            throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown operation');
        }

        const row = await transaction.budgetOperation.update({ where: { id }, data: body });

        await bumpRevision(transaction);

        return operationOf(row);
    });
}

/**
 * @function deleteOperation
 * @description Moves an operation to the trash. Deleting one already there changes nothing, so a retried deletion
 * succeeds.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The operation's id.
 *
 * @returns {Promise<void>} Resolves once it is in the trash.
 */
export async function deleteOperation(prisma: PrismaClient, id: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
        const existing = await findOperation(transaction, id);

        if (existing === null) {
            throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown operation');
        }

        if (existing.deletedAt !== null) {
            return;
        }

        await transaction.budgetOperation.update({ where: { id }, data: { deletedAt: new Date() } });
        await bumpRevision(transaction);
    });
}

/**
 * @function restoreOperation
 * @description Takes an operation out of the trash, back into the budget. Restoring one already in the budget changes
 * nothing.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The operation's id.
 *
 * @returns {Promise<Operation>} The restored operation.
 */
export async function restoreOperation(prisma: PrismaClient, id: string): Promise<Operation> {
    return await prisma.$transaction(async (transaction) => {
        const existing = await findOperation(transaction, id);

        if (existing === null) {
            throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown operation');
        }

        if (existing.deletedAt === null) {
            return operationOf(existing);
        }

        const row = await transaction.budgetOperation.update({ where: { id }, data: { deletedAt: null } });

        await bumpRevision(transaction);

        return operationOf(row);
    });
}
