import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { Prisma, PrismaClient } from 'prisma/generated/prisma/client';
import type { RecurringRow } from 'src/modules/budget/places/places-service';
import { placeReferenceOf, WITH_PLACE } from 'src/modules/budget/places/places-service';
import { rateToEuroOn } from 'src/modules/budget/rates/rates-service';
import type { RecurringCreate, RecurringOperation, RecurringUpdate, Schedule } from 'src/modules/budget/recurring/recurring-models';
import { nextOccurrence, pendingOccurrences } from 'src/modules/budget/recurring/recurring-schedule';
import { bumpRevision, ownerTimeZone } from 'src/modules/budget/state/state-service';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { dayAt, instantAt } from 'src/shared/owner-day';

/**
 * @constant LOGGED_TIME
 * @description The time of day an operation the server logs on its own is dated at, whether an occurrence or one logged
 * by a model, which only give its day.
 */
export const LOGGED_TIME = '12:00';

/**
 * @function scheduleOf
 * @description The schedule of a stored recurring operation.
 *
 * @param {RecurringRow} row The stored row.
 *
 * @returns {Schedule} Its schedule.
 */
function scheduleOf(row: RecurringRow): Schedule {
    return { firstDate: row.firstDate, intervalMonths: row.intervalMonths, endDate: row.endDate, isPaused: row.isPaused, generatedThrough: row.generatedThrough };
}

/**
 * @function recurringOf
 * @description A recurring operation as the routes send it, from its stored row.
 *
 * @param {RecurringRow} row The stored row.
 *
 * @returns {RecurringOperation} The recurring operation.
 */
export function recurringOf(row: RecurringRow): RecurringOperation {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        categoryId: row.categoryId,
        location: row.location,
        placeId: row.placeId,
        place: placeReferenceOf(row.place),
        amount: row.amount,
        currencyCode: row.currencyCode,
        isOnline: row.isOnline,
        firstDate: row.firstDate,
        intervalMonths: row.intervalMonths,
        endDate: row.endDate,
        isPaused: row.isPaused,
        nextDate: nextOccurrence(scheduleOf(row)),
        updatedAt: row.updatedAt
    };
}

/**
 * @function occurrenceId
 * @description The id of the operation an occurrence logs: the same for the same recurring operation and day, so an
 * occurrence is never logged twice, even by two reads at once, nor logged again once it went to the trash.
 *
 * @param {string} recurringId The recurring operation's id.
 * @param {string} day The occurrence's day, as `YYYY-MM-DD`.
 *
 * @returns {string} The operation's id.
 */
export function occurrenceId(recurringId: string, day: string): string {
    return `${recurringId}-${day.replaceAll('-', '')}`;
}

/**
 * @function todayOf
 * @description The owner's current day, in the time zone the apps last said they are in.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<string>} The day, as `YYYY-MM-DD`.
 */
export async function todayOf(prisma: PrismaClient): Promise<string> {
    return dayAt(new Date(), await ownerTimeZone(prisma));
}

/**
 * @function pricedOccurrences
 * @description Prices the pending occurrences of a recurring operation at their day's rate, the earliest first. It stops
 * at the first one no rate can be had for, so the rest wait for a later read.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {RecurringRow} row The recurring operation.
 * @param {string[]} days The pending occurrences.
 *
 * @returns {Promise<Prisma.BudgetOperationCreateManyInput[]>} The operations they log.
 */
async function pricedOccurrences(prisma: PrismaClient, logger: FastifyBaseLogger, row: RecurringRow, days: string[]): Promise<Prisma.BudgetOperationCreateManyInput[]> {
    const timeZone = await ownerTimeZone(prisma);
    const operations: Prisma.BudgetOperationCreateManyInput[] = [];

    for (const day of days) {
        const rateToEuro = await rateToEuroOn(prisma, logger, row.currencyCode, day).catch((error: unknown) => {
            logger.warn({ error, recurringId: row.id, day }, 'No rate for a recurring operation\'s occurrence, left for a later read');

            return undefined;
        });

        if (rateToEuro === undefined) {
            break;
        }

        operations.push({ id: occurrenceId(row.id, day), day, time: LOGGED_TIME, date: instantAt(day, LOGGED_TIME, timeZone), name: row.name, description: row.description, categoryId: row.categoryId, location: row.location, placeId: row.placeId, amount: row.amount, currencyCode: row.currencyCode, rateToEuro, isOnline: row.isOnline, recurringId: row.id });
    }

    return operations;
}

/**
 * @function catchUpOne
 * @description Logs the occurrences of one recurring operation that fell due up to a day and are not logged yet. A
 * paused one has them skipped instead, so resuming it does not log what fell due meanwhile.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {RecurringRow} row The recurring operation.
 * @param {string} today The current day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<RecurringRow>} The recurring operation, as it stands after.
 */
async function catchUpOne(prisma: PrismaClient, logger: FastifyBaseLogger, row: RecurringRow, today: string): Promise<RecurringRow> {
    const days = pendingOccurrences(scheduleOf(row), today);

    if (days.length === 0) {
        return row;
    }

    const operations = row.isPaused ? [] : await pricedOccurrences(prisma, logger, row, days);
    const passedCount = row.isPaused ? days.length : operations.length;
    const passedThrough: Maybe<string> = days[passedCount - 1] ?? null;

    if (passedThrough === null) {
        return row;
    }

    return await prisma.$transaction(async (transaction) => {
        const { count } = await transaction.budgetOperation.createMany({ data: operations, skipDuplicates: true });
        const updated = await transaction.budgetRecurringOperation.update({ where: { id: row.id }, data: { generatedThrough: passedThrough }, include: WITH_PLACE });

        if (count > 0) {
            await bumpRevision(transaction);
        }

        return updated;
    });
}

/**
 * @function catchUpRecurring
 * @description Logs every occurrence of the recurring operations that fell due up to a day and is not logged yet. Every
 * read of the budget calls it first, so the apps and the MCP server all find the occurrences there.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} today The current day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<RecurringRow[]>} Every recurring operation, as it stands after, in the order they were created.
 */
export async function catchUpRecurring(prisma: PrismaClient, logger: FastifyBaseLogger, today: string): Promise<RecurringRow[]> {
    const rows = await prisma.budgetRecurringOperation.findMany({ orderBy: { createdAt: 'asc' }, include: WITH_PLACE });
    const updated: RecurringRow[] = [];

    for (const row of rows) {
        updated.push(await catchUpOne(prisma, logger, row, today));
    }

    return updated;
}

/**
 * @function listRecurring
 * @description Reads the recurring operations, once their due occurrences are logged.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 *
 * @returns {Promise<RecurringOperation[]>} The recurring operations, in the order they were created.
 */
export async function listRecurring(prisma: PrismaClient, logger: FastifyBaseLogger): Promise<RecurringOperation[]> {
    const rows = await catchUpRecurring(prisma, logger, await todayOf(prisma));

    return rows.map(recurringOf);
}

/**
 * @function assertCategory
 * @description Refuses a category the budget does not hold.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} categoryId The category's id.
 *
 * @returns {Promise<void>} Resolves when it is known. Rejects with 400 otherwise.
 */
async function assertCategory(prisma: PrismaClient, categoryId: string): Promise<void> {
    if (await prisma.budgetCategory.findUnique({ where: { id: categoryId } }) === null) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Unknown category');
    }
}

/**
 * @function createRecurring
 * @description Creates a recurring operation under the id the client minted, then logs its occurrences already due. An
 * id already taken is refused with a conflict, so a retried creation never creates it twice.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {RecurringCreate} body The recurring operation.
 *
 * @returns {Promise<RecurringOperation>} The stored recurring operation.
 */
export async function createRecurring(prisma: PrismaClient, logger: FastifyBaseLogger, body: RecurringCreate): Promise<RecurringOperation> {
    await assertCategory(prisma, body.categoryId);

    if (await prisma.budgetRecurringOperation.findUnique({ where: { id: body.id } }) !== null) {
        throw new RequestError(StatusCodes.CONFLICT, 'A recurring operation with this id already exists');
    }

    const row = await prisma.budgetRecurringOperation.create({
        data: { ...body, description: body.description ?? null, location: body.location ?? null, placeId: body.placeId ?? null, endDate: body.endDate ?? null },
        include: WITH_PLACE
    });

    return recurringOf(await catchUpOne(prisma, logger, row, await todayOf(prisma)));
}

/**
 * @function updateRecurring
 * @description Changes the fields of a recurring operation the request names, then logs its occurrences now due. What
 * changes applies to the occurrences still to come; those already logged stay as they are.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} id The recurring operation's id.
 * @param {RecurringUpdate} body What changes.
 *
 * @returns {Promise<RecurringOperation>} The stored recurring operation.
 */
export async function updateRecurring(prisma: PrismaClient, logger: FastifyBaseLogger, id: string, body: RecurringUpdate): Promise<RecurringOperation> {
    const existing = await prisma.budgetRecurringOperation.findUnique({ where: { id } });

    if (existing === null) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown recurring operation');
    }

    if (body.categoryId !== undefined) {
        await assertCategory(prisma, body.categoryId);
    }

    const firstDate = body.firstDate ?? existing.firstDate;
    const endDate = body.endDate !== undefined ? body.endDate : existing.endDate;

    if (endDate !== null && endDate < firstDate) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'The end date comes before the first one');
    }

    const row = await prisma.budgetRecurringOperation.update({ where: { id }, data: body, include: WITH_PLACE });

    return recurringOf(await catchUpOne(prisma, logger, row, await todayOf(prisma)));
}

/**
 * @function deleteRecurring
 * @description Deletes a recurring operation: no occurrence is logged anymore. Those already logged stay in the budget,
 * as plain recurring operations.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The recurring operation's id.
 *
 * @returns {Promise<void>} Resolves once it is deleted.
 */
export async function deleteRecurring(prisma: PrismaClient, id: string): Promise<void> {
    await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const removed = await transaction.budgetRecurringOperation.deleteMany({ where: { id } });

        if (removed.count === 0) {
            throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown recurring operation');
        }

        const { count } = await transaction.budgetOperation.updateMany({ where: { recurringId: id }, data: { recurringId: null } });

        if (count > 0) {
            await bumpRevision(transaction);
        }
    });
}
