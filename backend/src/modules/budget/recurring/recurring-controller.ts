import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { placesContextOf, withPlace } from 'src/modules/budget/places/places-service';
import type { RecurringCreateRequest, RecurringTargetRequest, RecurringUpdateRequest } from 'src/modules/budget/recurring/recurring-models';
import { createRecurring, deleteRecurring, listRecurring, updateRecurring } from 'src/modules/budget/recurring/recurring-service';

/**
 * @function list
 * @description Sends the recurring operations, once their due occurrences are logged.
 *
 * @returns {Promise<void>} Resolves when the recurring operations are sent.
 */
async function list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const recurring = await listRecurring(request.server.prisma, request.log);

    reply.status(StatusCodes.OK).send({ data: recurring });
}

/**
 * @function create
 * @description Creates a recurring operation.
 *
 * @returns {Promise<void>} Resolves when the stored recurring operation is sent.
 */
async function create(request: FastifyRequest<RecurringCreateRequest>, reply: FastifyReply): Promise<void> {
    const recurring = await createRecurring(request.server.prisma, request.log, await withPlace(placesContextOf(request), request.body));

    reply.status(StatusCodes.CREATED).send({ data: recurring });
}

/**
 * @function update
 * @description Changes a recurring operation.
 *
 * @returns {Promise<void>} Resolves when the stored recurring operation is sent.
 */
async function update(request: FastifyRequest<RecurringUpdateRequest>, reply: FastifyReply): Promise<void> {
    const recurring = await updateRecurring(request.server.prisma, request.log, request.params.recurringId, await withPlace(placesContextOf(request), request.body));

    reply.status(StatusCodes.OK).send({ data: recurring });
}

/**
 * @function remove
 * @description Deletes a recurring operation.
 *
 * @returns {Promise<void>} Resolves when the answer is sent.
 */
async function remove(request: FastifyRequest<RecurringTargetRequest>, reply: FastifyReply): Promise<void> {
    await deleteRecurring(request.server.prisma, request.params.recurringId);

    reply.status(StatusCodes.NO_CONTENT).send();
}

export default {
    list,
    create,
    update,
    remove
};
