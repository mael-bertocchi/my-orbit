import type { RequestGenericInterface } from 'fastify';
import { OperationSchema } from 'src/modules/budget/state/state-models';
import { IdSchema } from 'src/shared/schemas';
import { z } from 'zod';

/**
 * @constant OperationCreateSchema
 * @description Zod schema for logging an operation. The client mints its id, so a retried creation names the same one;
 * the server owns the update stamp, links an operation to the recurring one it is an occurrence of, and names its city.
 */
export const OperationCreateSchema = OperationSchema.omit({ updatedAt: true, recurringId: true, place: true });

/**
 * @constant OperationUpdateSchema
 * @description Zod schema for changing an operation. A field left out stays as it is, which is why `isOnline` loses
 * the default it has on creation; the id never changes.
 */
export const OperationUpdateSchema = OperationCreateSchema.omit({ id: true }).extend({ isOnline: z.boolean() }).partial();

/**
 * @constant OperationParamsSchema
 * @description Zod schema for the operation a request is about.
 */
export const OperationParamsSchema = z.object({
    operationId: IdSchema
});

/**
 * @interface OperationCreateRequest
 * @description Fastify request generic for logging an operation.
 *
 * @extends RequestGenericInterface
 */
export interface OperationCreateRequest extends RequestGenericInterface {
    Body: OperationCreate; /*!< The operation to log */
}

/**
 * @interface OperationUpdateRequest
 * @description Fastify request generic for changing an operation.
 *
 * @extends RequestGenericInterface
 */
export interface OperationUpdateRequest extends RequestGenericInterface {
    Params: z.infer<typeof OperationParamsSchema>; /*!< The operation */
    Body: OperationUpdate; /*!< What changes */
}

/**
 * @interface OperationTargetRequest
 * @description Fastify request generic for a request naming one operation and nothing more: deleting or restoring it.
 *
 * @extends RequestGenericInterface
 */
export interface OperationTargetRequest extends RequestGenericInterface {
    Params: z.infer<typeof OperationParamsSchema>; /*!< The operation */
}

/**
 * @type Operation
 * @description An operation as the routes send it.
 */
export type Operation = z.infer<typeof OperationSchema> & { updatedAt: Date };

/**
 * @type TrashedOperation
 * @description An operation in the trash, with when it was deleted.
 */
export type TrashedOperation = Operation & { deletedAt: Date };

/**
 * @type OperationCreate
 * @description What logging an operation says.
 */
export type OperationCreate = z.infer<typeof OperationCreateSchema>;

/**
 * @type OperationUpdate
 * @description What changing an operation says.
 */
export type OperationUpdate = z.infer<typeof OperationUpdateSchema>;
