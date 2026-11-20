import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { Prisma, PrismaClient } from 'prisma/generated/prisma/client';
import { shiftDay } from 'src/modules/budget/figures/figures-math';
import type { Operation, OperationCreate, OperationListQuery, OperationPage, OperationUpdate, TrashedOperation } from 'src/modules/budget/operations/operations-models';
import type { OperationRow } from 'src/modules/budget/places/places-service';
import { placeReferenceOf, WITH_PLACE } from 'src/modules/budget/places/places-service';
import { BASE_CURRENCY } from 'src/modules/budget/rates/rates-models';
import { rateToEuroOn } from 'src/modules/budget/rates/rates-service';
import { bumpRevision } from 'src/modules/budget/state/state-service';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';

/**
 * @function operationOf
 * @description An operation as the routes send it, from its stored row.
 *
 * @param {OperationRow} row The stored row.
 *
 * @returns {Operation} The operation.
 */
export function operationOf(row: OperationRow): Operation {
    return {
        id: row.id,
        day: row.day,
        time: row.time,
        name: row.name,
        description: row.description,
        categoryId: row.categoryId,
        location: row.location,
        placeId: row.placeId,
        place: placeReferenceOf(row.place),
        amount: row.amount,
        currencyCode: row.currencyCode,
        rateToEuro: row.rateToEuro,
        isOnline: row.isOnline,
        recurringId: row.recurringId,
        updatedAt: row.updatedAt
    };
}

/**
 * @function trashedOf
 * @description An operation in the trash as the routes send it, from its stored row.
 *
 * @param {OperationRow} row The stored row, deleted.
 * @param {Date} deletedAt When it was deleted.
 *
 * @returns {TrashedOperation} The operation and when it was deleted.
 */
function trashedOf(row: OperationRow, deletedAt: Date): TrashedOperation {
    return { ...operationOf(row), deletedAt };
}

/**
 * @function findOperation
 * @description Reads one operation, in the budget or in the trash.
 *
 * @param {Prisma.TransactionClient} transaction The open transaction.
 * @param {string} id The operation's id.
 *
 * @returns {Promise<Maybe<OperationRow>>} Its row, or null when there is none.
 */
async function findOperation(transaction: Prisma.TransactionClient, id: string): Promise<Maybe<OperationRow>> {
    return await transaction.budgetOperation.findUnique({ where: { id }, include: WITH_PLACE });
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
    const rows = await prisma.budgetOperation.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, include: WITH_PLACE });

    return rows.flatMap((row) => (row.deletedAt !== null ? [trashedOf(row, row.deletedAt)] : []));
}

/**
 * @constant REPRICE_DAYS
 * @description How far back foreign operations are priced again. Only recent ones can still be waiting on their day's
 * rate.
 */
const REPRICE_DAYS = 7;

/**
 * @constant RATE_EPSILON
 * @description The smallest rate difference worth rewriting an operation for.
 */
const RATE_EPSILON = 1e-9;

/**
 * @function textFilter
 * @description The ways an operation can match words searched, regardless of case: in its name, its note, its place or
 * its city in either language. The History and Claude's search both look through these.
 *
 * @param {string} text The words searched.
 *
 * @returns {Prisma.BudgetOperationWhereInput[]} The conditions, any of which is a match.
 */
export function textFilter(text: string): Prisma.BudgetOperationWhereInput[] {
    return [
        { name: { contains: text, mode: 'insensitive' } },
        { description: { contains: text, mode: 'insensitive' } },
        { location: { contains: text, mode: 'insensitive' } },
        { place: { nameEn: { contains: text, mode: 'insensitive' } } },
        { place: { nameFr: { contains: text, mode: 'insensitive' } } }
    ];
}

/**
 * @function listFilter
 * @description The operations in the budget a page asks for: in one of the categories picked, within the days picked,
 * and matching the search, regardless of case.
 *
 * @param {OperationListQuery} query The filters.
 *
 * @returns {Prisma.BudgetOperationWhereInput} The filter, for the database.
 */
function listFilter(query: OperationListQuery): Prisma.BudgetOperationWhereInput {
    const search: Prisma.BudgetOperationWhereInput[] = [...textFilter(query.query), { categoryId: { in: query.queryCategories } }];

    return {
        deletedAt: null,
        categoryId: query.categories.length > 0 ? { in: query.categories } : undefined,
        day: { gte: query.from, lte: query.to },
        OR: query.query !== '' ? search : undefined
    };
}

/**
 * @function wholeDays
 * @description Keeps the whole days of a page read one operation past its limit: the operations of the day the next one
 * falls on are left for the next page, so no day is split between two. A single day holding more than the limit is cut,
 * as the page could not move on otherwise.
 *
 * @param {T[]} rows The operations read, the latest first, one more than the limit when there are more.
 * @param {number} limit The most operations a page holds.
 *
 * @returns {T[]} The operations of the page.
 */
export function wholeDays<T extends { day: string }>(rows: T[], limit: number): T[] {
    const next = rows[limit];

    if (next === undefined) {
        return rows;
    }

    const kept = rows.slice(0, limit).filter((row) => row.day !== next.day);

    return kept.length > 0 ? kept : rows.slice(0, limit);
}

/**
 * @function listOperations
 * @description Reads a page of the operations in the budget matching the filters, the latest first, with how many match
 * in all. A page holds whole days only, up to its limit.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {OperationListQuery} query The filters and the page.
 *
 * @returns {Promise<OperationPage>} The page.
 */
export async function listOperations(prisma: PrismaClient, query: OperationListQuery): Promise<OperationPage> {
    const where = listFilter(query);
    const [rows, total] = await Promise.all([
        prisma.budgetOperation.findMany({ where, orderBy: [{ day: 'desc' }, { time: 'desc' }, { id: 'asc' }], skip: query.offset, take: query.limit + 1, include: WITH_PLACE }),
        prisma.budgetOperation.count({ where })
    ]);

    return { operations: wholeDays(rows, query.limit).map(operationOf), total };
}

/**
 * @function readOperation
 * @description Reads one operation in the budget.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The operation's id.
 *
 * @returns {Promise<Operation>} The operation. Rejects with a 404 when it is unknown or in the trash.
 */
export async function readOperation(prisma: PrismaClient, id: string): Promise<Operation> {
    const row = await prisma.budgetOperation.findUnique({ where: { id }, include: WITH_PLACE });

    if (row === null || row.deletedAt !== null) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown operation');
    }

    return operationOf(row);
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
            data: { ...body, description: body.description ?? null, location: body.location ?? null, placeId: body.placeId ?? null },
            include: WITH_PLACE
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

        const row = await transaction.budgetOperation.update({ where: { id }, data: body, include: WITH_PLACE });

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
 * @function deleteEveryOperation
 * @description Moves every operation in the budget to the trash, as a reset does: they can still be restored from there.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<void>} Resolves once they are in the trash.
 */
export async function deleteEveryOperation(prisma: PrismaClient): Promise<void> {
    await prisma.$transaction(async (transaction) => {
        const moved = await transaction.budgetOperation.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });

        if (moved.count > 0) {
            await bumpRevision(transaction);
        }
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

        const row = await transaction.budgetOperation.update({ where: { id }, data: { deletedAt: null }, include: WITH_PLACE });

        await bumpRevision(transaction);

        return operationOf(row);
    });
}

/**
 * @function repriceRecent
 * @description Prices recent foreign operations again at the rate published for their own day. One logged before the
 * day's publication (around 16:00 CET) was priced at the previous day's rate; this corrects it. A rate that can't be had
 * leaves the operation for a later read.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<void>} Resolves once every rate that could be had is right.
 */
export async function repriceRecent(prisma: PrismaClient, logger: FastifyBaseLogger, today: string): Promise<void> {
    const rows = await prisma.budgetOperation.findMany({ where: { deletedAt: null, day: { gte: shiftDay(today, -REPRICE_DAYS) }, currencyCode: { not: BASE_CURRENCY } } });
    const corrections: { id: string; rateToEuro: number }[] = [];

    for (const row of rows) {
        const published = await rateToEuroOn(prisma, logger, row.currencyCode, row.day).catch((error: unknown) => {
            logger.warn({ error, operationId: row.id }, 'No rate to price an operation again, left for a later read');

            return undefined;
        });

        if (published !== undefined && Math.abs(published - row.rateToEuro) > RATE_EPSILON) {
            corrections.push({ id: row.id, rateToEuro: published });
        }
    }

    if (corrections.length === 0) {
        return;
    }

    await prisma.$transaction(async (transaction) => {
        for (const correction of corrections) {
            await transaction.budgetOperation.update({ where: { id: correction.id }, data: { rateToEuro: correction.rateToEuro } });
        }

        await bumpRevision(transaction);
    });
}
