import type { RequestGenericInterface } from 'fastify';
import type { PlaceReference } from 'src/modules/budget/places/places-models';
import { PlaceIdSchema } from 'src/modules/budget/places/places-models';
import { IsoDaySchema } from 'src/modules/budget/rates/rates-models';
import { isRealDay } from 'src/modules/budget/recurring/recurring-schedule';
import type { Maybe } from 'src/shared/models';
import { IdSchema } from 'src/shared/schemas';
import { z } from 'zod';

/**
 * @constant INTERVALS
 * @description How many months may lie between two occurrences: every month, quarter, half year or year.
 */
export const INTERVALS = [1, 3, 6, 12] as const;

/**
 * @constant DaySchema
 * @description Zod schema for a day of the calendar, as `YYYY-MM-DD`.
 */
const DaySchema = IsoDaySchema.refine(isRealDay, { message: 'Not a day of the calendar' });

/**
 * @constant RecurringFieldsSchema
 * @description Zod schema for what describes a recurring operation: the operation each occurrence logs, and its schedule.
 */
const RecurringFieldsSchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullish(),
    categoryId: IdSchema,
    location: z.string().trim().max(200).nullish(),
    placeId: PlaceIdSchema.nullish(),
    amount: z.number().positive().max(1_000_000_000),
    currencyCode: z.string().min(1).max(8),
    isOnline: z.boolean().default(false),
    firstDate: DaySchema,
    intervalMonths: z.union(INTERVALS.map((interval) => z.literal(interval))),
    endDate: DaySchema.nullish(),
    isPaused: z.boolean().default(false)
});

/**
 * @constant RecurringCreateSchema
 * @description Zod schema for creating a recurring operation. The client mints its id, so a retried creation names the
 * same one.
 */
export const RecurringCreateSchema = RecurringFieldsSchema.extend({ id: IdSchema }).refine((body) => body.endDate === undefined || body.endDate === null || body.endDate >= body.firstDate, { message: 'The end date comes before the first one', path: ['endDate'] });

/**
 * @constant RecurringUpdateSchema
 * @description Zod schema for changing a recurring operation. A field left out stays as it is.
 */
export const RecurringUpdateSchema = RecurringFieldsSchema.extend({ isOnline: z.boolean(), isPaused: z.boolean() }).partial();

/**
 * @constant RecurringParamsSchema
 * @description Zod schema for the recurring operation a request is about.
 */
export const RecurringParamsSchema = z.object({
    recurringId: IdSchema
});

/**
 * @interface RecurringCreateRequest
 * @description Fastify request generic for creating a recurring operation.
 *
 * @extends RequestGenericInterface
 */
export interface RecurringCreateRequest extends RequestGenericInterface {
    Body: RecurringCreate; /*!< The recurring operation */
}

/**
 * @interface RecurringUpdateRequest
 * @description Fastify request generic for changing a recurring operation.
 *
 * @extends RequestGenericInterface
 */
export interface RecurringUpdateRequest extends RequestGenericInterface {
    Params: z.infer<typeof RecurringParamsSchema>; /*!< The recurring operation */
    Body: RecurringUpdate; /*!< What changes */
}

/**
 * @interface RecurringTargetRequest
 * @description Fastify request generic for a request naming one recurring operation and nothing more.
 *
 * @extends RequestGenericInterface
 */
export interface RecurringTargetRequest extends RequestGenericInterface {
    Params: z.infer<typeof RecurringParamsSchema>; /*!< The recurring operation */
}

/**
 * @type RecurringCreate
 * @description What creating a recurring operation says.
 */
export type RecurringCreate = z.infer<typeof RecurringCreateSchema>;

/**
 * @type RecurringUpdate
 * @description What changing a recurring operation says.
 */
export type RecurringUpdate = z.infer<typeof RecurringUpdateSchema>;

/**
 * @interface Schedule
 * @description When a recurring operation comes back, and how far it was already logged.
 */
export interface Schedule {
    firstDate: string; /*!< Its first occurrence, as `YYYY-MM-DD`; its day of the month is the one every occurrence falls on */
    intervalMonths: number; /*!< How many months lie between two occurrences */
    endDate: Maybe<string>; /*!< The last day it may fall on, if it ends */
    isPaused: boolean; /*!< Whether it is paused, its occurrences skipped meanwhile */
    generatedThrough: Maybe<string>; /*!< The day of the last occurrence already passed, logged or skipped */
}

/**
 * @interface RecurringOperation
 * @description A recurring operation as the routes send it.
 */
export interface RecurringOperation {
    id: string; /*!< Its identifier */
    name: string; /*!< The name each occurrence is logged under */
    description: Maybe<string>; /*!< A note each occurrence carries */
    categoryId: string; /*!< Its category */
    location: Maybe<string>; /*!< Where it is paid, as written */
    placeId: Maybe<string>; /*!< The city it is paid in, if checked */
    place: Maybe<PlaceReference>; /*!< That city, named in each language */
    amount: number; /*!< The amount, in its currency */
    currencyCode: string; /*!< Its currency */
    isOnline: boolean; /*!< Whether it is paid online */
    firstDate: string; /*!< Its first occurrence, as `YYYY-MM-DD` */
    intervalMonths: number; /*!< How many months lie between two occurrences */
    endDate: Maybe<string>; /*!< The last day it may fall on, if it ends */
    isPaused: boolean; /*!< Whether it is paused */
    nextDate: Maybe<string>; /*!< Its next occurrence still to be logged, or null when it has ended */
    updatedAt: Date; /*!< When it last changed */
}
