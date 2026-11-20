import type { RequestGenericInterface } from 'fastify';
import { DaySchema } from 'src/modules/budget/recurring/recurring-models';
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
 * @constant IdListSchema
 * @description Zod schema for ids sent in the address, separated by commas, as a list without the empty ones.
 */
const IdListSchema = z.string().max(2000).default('').transform((text) => text.split(',').filter((id) => id !== ''));

/**
 * @constant OperationListQuerySchema
 * @description Zod schema for a page of operations: the categories picked (any category when none is), the first and
 * last days included, the search, and the page itself, which holds whole days only. The search matches the name, the
 * note, the place and the categories named in `queryCategories`: the app names the categories whose name, in its own
 * language, matches it.
 */
export const OperationListQuerySchema = z.object({
    categories: IdListSchema,
    from: DaySchema.optional(),
    to: DaySchema.optional(),
    query: z.string().trim().max(120).default(''),
    queryCategories: IdListSchema,
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(40)
});

/**
 * @interface OperationListRequest
 * @description Fastify request generic for a page of operations.
 *
 * @extends RequestGenericInterface
 */
export interface OperationListRequest extends RequestGenericInterface {
    Querystring: OperationListQuery; /*!< The filters and the page */
}

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
 * @type OperationListQuery
 * @description What a page of operations asks for.
 */
export type OperationListQuery = z.infer<typeof OperationListQuerySchema>;

/**
 * @interface OperationPage
 * @description A page of operations, the latest first, with how many match in all.
 */
export interface OperationPage {
    operations: Operation[]; /*!< The operations of the page */
    total: number; /*!< How many operations match the filters */
}

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
