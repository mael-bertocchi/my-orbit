import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { sealCompletedMonths } from 'src/modules/budget/history/history-service';
import { repriceRecent } from 'src/modules/budget/operations/operations-service';
import { catchUpRecurring } from 'src/modules/budget/recurring/recurring-service';
import { followTimeZone, pullState } from 'src/modules/budget/state/state-service';
import { dayAt } from 'src/shared/owner-day';

/**
 * @function getState
 * @description Returns the owner's whole budget document (categories, operations, budget settings) and its revision,
 * once the recurring operations' due occurrences are logged, recent foreign operations priced at their own day's rate,
 * and every finished month given a budget of its own. The app names its device's time zone in `X-Time-Zone`, which the
 * server keeps to count the owner's days.
 *
 * @returns {Promise<void>} Resolves when the document is sent.
 */
async function getState(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const timeZone = await followTimeZone(request.server.prisma, request.headers['x-time-zone']);

    const today = dayAt(new Date(), timeZone);

    await catchUpRecurring(request.server.prisma, request.log, today);
    await repriceRecent(request.server.prisma, request.log, today);
    await sealCompletedMonths(request.server.prisma, today);

    const state = await pullState(request.server.prisma);

    reply.status(StatusCodes.OK).send({ data: state });
}

export default {
    getState
};
