import { PlaceIdSchema, PlaceReferenceSchema } from 'src/modules/budget/places/places-models';
import { ColorSchema, IdSchema } from 'src/shared/schemas';
import { z } from 'zod';

/**
 * @constant MAX_ITEMS
 * @description Upper bound on the number of items of each kind a budget document holds.
 */
const MAX_ITEMS = 5000;

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
 * @constant OperationSchema
 * @description Zod schema for one logged operation. The client-supplied `updatedAt` is accepted but the server owns the persisted value.
 * `placeId` names the city it took place in, which the server checks and sends back named in each language as `place`;
 * `location` stays the place as written, for an operation logged before cities were checked.
 */
export const OperationSchema = z.object({
    id: IdSchema,
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
    categories: z.array(CategorySchema).max(MAX_ITEMS),
    operations: z.array(OperationSchema).max(MAX_ITEMS),
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
