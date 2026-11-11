import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { catchUpRecurring } from 'src/modules/budget/recurring/recurring-service';
import { pullState } from 'src/modules/budget/state/state-service';

/**
 * @function getState
 * @description Returns the owner's whole budget document (categories, operations, budget settings) and its revision,
 * once the recurring operations' due occurrences are logged.
 *
 * @returns {Promise<void>} Resolves when the document is sent.
 */
async function getState(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await catchUpRecurring(request.server.prisma, request.log);

    const state = await pullState(request.server.prisma);

    reply.status(StatusCodes.OK).send({ data: state });
}

export default {
    getState
};
