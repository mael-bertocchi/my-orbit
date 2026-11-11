import type { FastifyInstance } from 'fastify';
import recurringController from 'src/modules/budget/recurring/recurring-controller';
import type { RecurringCreateRequest, RecurringTargetRequest, RecurringUpdateRequest } from 'src/modules/budget/recurring/recurring-models';
import { RecurringCreateSchema, RecurringParamsSchema, RecurringUpdateSchema } from 'src/modules/budget/recurring/recurring-models';

/**
 * @function recurringRoutes
 * @description Defines the routes of the recurring operations: listing them, creating one, changing one and deleting one.
 */
export default function (fastify: FastifyInstance): void {
    fastify.get('/', {
        preHandler: [fastify.identity.authenticate]
    }, recurringController.list);

    fastify.post<RecurringCreateRequest>('/', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            body: RecurringCreateSchema
        }
    }, recurringController.create);

    fastify.patch<RecurringUpdateRequest>('/:recurringId', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            params: RecurringParamsSchema,
            body: RecurringUpdateSchema
        }
    }, recurringController.update);

    fastify.delete<RecurringTargetRequest>('/:recurringId', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            params: RecurringParamsSchema
        }
    }, recurringController.remove);
}
