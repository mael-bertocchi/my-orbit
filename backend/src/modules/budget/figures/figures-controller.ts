import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { MonthFiguresRequest, SuggestionsRequest } from 'src/modules/budget/figures/figures-models';
import { analysisFigures, monthFigures, suggestionsFor } from 'src/modules/budget/figures/figures-service';
import { followTimeZone } from 'src/modules/budget/state/state-service';
import { dayAt } from 'src/shared/owner-day';

/**
 * @function ownerToday
 * @description The owner's day, in the time zone the app names in `X-Time-Zone`, or the last one an app named.
 *
 * @returns {Promise<string>} The day, as `YYYY-MM-DD`.
 */
async function ownerToday(request: FastifyRequest): Promise<string> {
    return dayAt(new Date(), await followTimeZone(request.server.prisma, request.headers['x-time-zone']));
}

/**
 * @function month
 * @description Sends the figures of a month.
 *
 * @returns {Promise<void>} Resolves when the figures are sent.
 */
async function month(request: FastifyRequest<MonthFiguresRequest>, reply: FastifyReply): Promise<void> {
    const figures = await monthFigures(request.server.prisma, request.query.month, await ownerToday(request));

    reply.status(StatusCodes.OK).send({ data: figures });
}

/**
 * @function analysis
 * @description Sends the figures of the Analysis tab.
 *
 * @returns {Promise<void>} Resolves when the figures are sent.
 */
async function analysis(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const figures = await analysisFigures(request.server.prisma, await ownerToday(request));

    reply.status(StatusCodes.OK).send({ data: figures });
}

/**
 * @function suggestions
 * @description Sends what the operation editor suggests for what is typed.
 *
 * @returns {Promise<void>} Resolves when the suggestions are sent.
 */
async function suggestions(request: FastifyRequest<SuggestionsRequest>, reply: FastifyReply): Promise<void> {
    const found = await suggestionsFor(request.server.prisma, request.query.name, request.query.city);

    reply.status(StatusCodes.OK).send({ data: found });
}

export default {
    month,
    analysis,
    suggestions
};
