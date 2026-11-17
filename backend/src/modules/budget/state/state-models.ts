import { PlaceIdSchema, PlaceReferenceSchema } from 'src/modules/budget/places/places-models';
import { DaySchema } from 'src/modules/budget/recurring/recurring-models';
import { ColorSchema, IdSchema } from 'src/shared/schemas';
import { z } from 'zod';

/**
 * @constant CategorySchema
 * @description Zod schema for one budget category.
 */
export const CategorySchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(60),
    symbol: z.string().min(1).max(60),
    colorHex: ColorSchema,
    monthlyLimit: z.number().min(0).max(1_000_000)
});

/**
 * @constant TimeSchema
 * @description Zod schema for a time of day, as `HH:MM`.
 */
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * @constant OperationSchema
 * @description Zod schema for one logged operation. The client-supplied `updatedAt` is accepted but the server owns the persisted value.
 * `day` and `time` are the wall clock it was logged at, in whatever time zone the owner was in, and never move with a
 * time zone; `date` is the same moment as an instant, kept for the apps that predate `day` and `time`.
 * `placeId` names the city it took place in, which the server checks and sends back named in each language as `place`;
 * `location` stays the place as written, for an operation logged before cities were checked.
 */
export const OperationSchema = z.object({
    id: IdSchema,
    day: DaySchema,
    time: TimeSchema,
    date: z.coerce.date(),
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullish(),
    categoryId: IdSchema,
    location: z.string().max(200).nullish(),
    placeId: PlaceIdSchema.nullish(),
    place: PlaceReferenceSchema.nullish(),
    amount: z.number().min(0).max(1_000_000_000),
    currencyCode: z.string().min(1).max(8),
    rateToEuro: z.number().min(0).max(1_000_000),
    isOnline: z.boolean().default(false),
    recurringId: IdSchema.nullish(),
    updatedAt: z.coerce.date().optional()
});

/**
 * @constant BudgetSettingsSchema
 * @description Zod schema for the overall monthly budget settings.
 */
export const BudgetSettingsSchema = z.object({
    monthlyLimit: z.number().min(0).max(1_000_000)
});

/**
 * @constant MonthlyBudgetSchema
 * @description Zod schema for the budget frozen against one finished month.
 */
export const MonthlyBudgetSchema = z.object({
    monthlyLimit: z.number().min(0).max(1_000_000),
    categoryLimits: z.record(IdSchema, z.number().min(0).max(1_000_000))
});

/**
 * @constant StoredCategoryLimitsSchema
 * @description Zod schema for the category limits kept in a history row's JSON column: a limit by category id.
 */
export const StoredCategoryLimitsSchema = z.record(z.string(), z.number());

/**
 * @constant StateSchema
 * @description Zod schema for the whole budget document, as the read endpoint sends it.
 */
export const StateSchema = z.object({
    categories: z.array(CategorySchema),
    operations: z.array(OperationSchema),
    budget: BudgetSettingsSchema,
    budgetHistory: z.record(z.string().regex(/^\d{4}-\d{2}$/), MonthlyBudgetSchema)
});

/**
 * @type StateBody
 * @description Inferred type for the full budget document.
 */
export type StateBody = z.infer<typeof StateSchema>;

/**
 * @type StoredStateBody
 * @description The budget document as stored, with its revision: a counter every write moves on, so a client can tell
 * whether anything changed since it last read.
 */
export type StoredStateBody = StateBody & { revision: number };
