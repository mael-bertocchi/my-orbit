import type { FastifyInstance } from 'fastify';
import operationsController from 'src/modules/budget/operations/operations-controller';
import type { OperationCreateRequest, OperationListRequest, OperationTargetRequest, OperationUpdateRequest } from 'src/modules/budget/operations/operations-models';
import { OperationCreateSchema, OperationListQuerySchema, OperationParamsSchema, OperationUpdateSchema } from 'src/modules/budget/operations/operations-models';

/**
 * @function operationsRoutes
 * @description Defines the routes of the operations: reading a page of them or one of them, logging one, changing one, moving one or all of them to the trash,
 * listing the trash and restoring from it.
 */
export default function (fastify: FastifyInstance): void {
    fastify.get<OperationListRequest>('/', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            querystring: OperationListQuerySchema
        }
    }, operationsController.list);

    fastify.get('/trash', {
        preHandler: [fastify.identity.authenticate]
    }, operationsController.trash);

    fastify.get<OperationTargetRequest>('/:operationId', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            params: OperationParamsSchema
        }
    }, operationsController.read);

    fastify.post<OperationCreateRequest>('/', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            body: OperationCreateSchema
        }
    }, operationsController.create);

    fastify.patch<OperationUpdateRequest>('/:operationId', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            params: OperationParamsSchema,
            body: OperationUpdateSchema
        }
    }, operationsController.update);

    fastify.delete<OperationTargetRequest>('/:operationId', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            params: OperationParamsSchema
        }
    }, operationsController.remove);

    fastify.delete('/', {
        preHandler: [fastify.identity.authenticate]
    }, operationsController.removeAll);

    fastify.post<OperationTargetRequest>('/:operationId/restore', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            params: OperationParamsSchema
        }
    }, operationsController.restore);
}
