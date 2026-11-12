import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { OperationCreateRequest, OperationTargetRequest, OperationUpdateRequest } from 'src/modules/budget/operations/operations-models';
import { createOperation, deleteOperation, listTrash, restoreOperation, updateOperation } from 'src/modules/budget/operations/operations-service';
import { placesContextOf, withPlace } from 'src/modules/budget/places/places-service';

/**
 * @function trash
 * @description Sends the operations in the trash.
 *
 * @returns {Promise<void>} Resolves when the operations are sent.
 */
async function trash(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const operations = await listTrash(request.server.prisma);

    reply.status(StatusCodes.OK).send({ data: operations });
}

/**
 * @function create
 * @description Logs an operation.
 *
 * @returns {Promise<void>} Resolves when the stored operation is sent.
 */
async function create(request: FastifyRequest<OperationCreateRequest>, reply: FastifyReply): Promise<void> {
    const operation = await createOperation(request.server.prisma, await withPlace(placesContextOf(request), request.body));

    reply.status(StatusCodes.CREATED).send({ data: operation });
}

/**
 * @function update
 * @description Changes an operation.
 *
 * @returns {Promise<void>} Resolves when the stored operation is sent.
 */
async function update(request: FastifyRequest<OperationUpdateRequest>, reply: FastifyReply): Promise<void> {
    const operation = await updateOperation(request.server.prisma, request.params.operationId, await withPlace(placesContextOf(request), request.body));

    reply.status(StatusCodes.OK).send({ data: operation });
}

/**
 * @function remove
 * @description Moves an operation to the trash.
 *
 * @returns {Promise<void>} Resolves when the answer is sent.
 */
async function remove(request: FastifyRequest<OperationTargetRequest>, reply: FastifyReply): Promise<void> {
    await deleteOperation(request.server.prisma, request.params.operationId);

    reply.status(StatusCodes.NO_CONTENT).send();
}

/**
 * @function restore
 * @description Takes an operation out of the trash.
 *
 * @returns {Promise<void>} Resolves when the restored operation is sent.
 */
async function restore(request: FastifyRequest<OperationTargetRequest>, reply: FastifyReply): Promise<void> {
    const operation = await restoreOperation(request.server.prisma, request.params.operationId);

    reply.status(StatusCodes.OK).send({ data: operation });
}

export default {
    trash,
    create,
    update,
    remove,
    restore
};
