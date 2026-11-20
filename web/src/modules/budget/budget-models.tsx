import type { Maybe } from 'models';
import { fromWallClock } from 'modules/budget/budget-dates';
import type { ExchangeRates } from 'modules/budget/budget-rates';
import type { BudgetStore } from 'modules/budget/budget-store';
import type { ReactNode } from 'react';
import { z } from 'zod';

/**
 * @constant CategorySchema
 * @description Zod schema for one budget category.
 */
export const CategorySchema = z.object({
    id: z.string(),
    name: z.string(),
    symbol: z.string(),
    colorHex: z.number().int(),
    monthlyLimit: z.number()
});

/**
 * @constant PlaceReferenceSchema
 * @description Zod schema for a city the server checked: its OpenStreetMap identity and its name in each language.
 */
export const PlaceReferenceSchema = z.object({
    id: z.string(),
    nameEn: z.string(),
    nameFr: z.string()
});

/**
 * @constant OperationFieldsSchema
 * @description Zod schema for one logged operation as the server sends it, dated by the day and time it was logged at,
 * which no time zone moves.
 */
const OperationFieldsSchema = z.object({
    id: z.string(),
    day: z.string(),
    time: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    categoryId: z.string(),
    location: z.string().nullish(),
    placeId: z.string().nullish(),
    place: PlaceReferenceSchema.nullish(),
    amount: z.number(),
    currencyCode: z.string(),
    rateToEuro: z.number(),
    isOnline: z.boolean(),
    recurringId: z.string().nullish(),
    updatedAt: z.coerce.date().optional()
});

/**
 * @function withDate
 * @description An operation as the page holds it: its day and time made into a date on the device's clock, so every
 * calendar computation of the page reads them back as they were logged.
 *
 * @param {T} operation The operation as the server sends it.
 *
 * @returns {Omit<T, 'day' | 'time'> & { date: Date }} The operation, dated.
 */
function withDate<T extends { day: string; time: string }>({ day, time, ...operation }: T): Omit<T, 'day' | 'time'> & { date: Date } {
    return { ...operation, date: fromWallClock(day, time) };
}

/**
 * @constant OperationSchema
 * @description Zod schema for one logged operation, as the page holds it.
 */
export const OperationSchema = OperationFieldsSchema.transform(withDate);

/**
 * @constant RecurringOperationSchema
 * @description Zod schema for a recurring operation: what each occurrence logs, and when it comes back.
 */
export const RecurringOperationSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    categoryId: z.string(),
    location: z.string().nullish(),
    placeId: z.string().nullish(),
    place: PlaceReferenceSchema.nullish(),
    amount: z.number(),
    currencyCode: z.string(),
    isOnline: z.boolean(),
    firstDate: z.string(),
    intervalMonths: z.number().int(),
    endDate: z.string().nullish(),
    isPaused: z.boolean(),
    nextDate: z.string().nullish()
});

/**
 * @constant TrashedOperationSchema
 * @description Zod schema for an operation in the trash, with when it was deleted.
 */
export const TrashedOperationSchema = OperationFieldsSchema.extend({
    deletedAt: z.coerce.date()
}).transform(withDate);

/**
 * @constant MonthlyBudgetSchema
 * @description Zod schema for the budget of one finished month, editable at any time.
 */
export const MonthlyBudgetSchema = z.object({
    monthlyLimit: z.number(),
    categoryLimits: z.record(z.string(), z.number())
});

/**
 * @constant BudgetDocumentSchema
 * @description Zod schema for the budget document: the categories, the budget and the budgets of finished months. The
 * operations stay on the server, which sends them a page at a time and works out the figures they make.
 */
export const BudgetDocumentSchema = z.object({
    categories: z.array(CategorySchema),
    budget: z.object({ monthlyLimit: z.number() }),
    budgetHistory: z.record(z.string(), MonthlyBudgetSchema)
});

/**
 * @constant StoredStateSchema
 * @description Zod schema for the document as the backend stores it, with how many operations the budget holds and its
 * revision: a counter every write moves on.
 */
export const StoredStateSchema = BudgetDocumentSchema.extend({
    operationCount: z.number().int(),
    revision: z.number().int()
});

/**
 * @constant OperationPageSchema
 * @description Zod schema for a page of operations, the latest first, with how many match in all.
 */
export const OperationPageSchema = z.object({
    operations: z.array(OperationSchema),
    total: z.number().int()
});

/**
 * @constant SpendingSchema
 * @description Zod schema for euros spent, in all and per category id.
 */
export const SpendingSchema = z.object({
    spent: z.number(),
    byCategory: z.record(z.string(), z.number())
});

/**
 * @constant MonthFiguresSchema
 * @description Zod schema for what a month spent, and in the current month how it compares with what the past months
 * usually had by the same day.
 */
export const MonthFiguresSchema = SpendingSchema.extend({
    month: z.string(),
    today: z.string(),
    operationCount: z.number().int(),
    comparison: z.object({
        referenceCount: z.number().int(),
        current: SpendingSchema,
        usual: SpendingSchema
    }).nullable()
});

/**
 * @constant AnalysisFiguresSchema
 * @description Zod schema for what the Analysis tab shows: the last twelve months and the habits of the last ninety
 * days, recurring operations left out.
 */
export const AnalysisFiguresSchema = z.object({
    today: z.string(),
    months: z.array(SpendingSchema.extend({ month: z.string(), isCurrent: z.boolean() })),
    habits: z.object({
        since: z.string(),
        weekdays: z.array(z.object({ weekday: z.number().int(), average: z.number() })),
        online: z.number(),
        inPerson: z.number(),
        places: z.array(z.object({ place: PlaceReferenceSchema.nullable(), location: z.string().nullable(), spent: z.number(), count: z.number().int() }))
    })
});

/**
 * @constant SuggestionsSchema
 * @description Zod schema for what the operation editor suggests: earlier names and cities matching what is typed, and
 * the city of the latest operation in person.
 */
export const SuggestionsSchema = z.object({
    names: z.array(z.string()),
    places: z.array(PlaceReferenceSchema),
    latestPlace: PlaceReferenceSchema.nullable()
});

/**
 * @constant RateSnapshotSchema
 * @description Zod schema for a set of reference rates: the euros one unit of each currency buys.
 */
export const RateSnapshotSchema = z.object({
    quoteDate: z.string(),
    fetchedAt: z.coerce.date(),
    rates: z.record(z.string(), z.number())
});

/**
 * @constant PlaceSchema
 * @description Zod schema for a city the server suggests: its identity, its names, and its region and country in the page's
 * language to tell it apart.
 */
export const PlaceSchema = PlaceReferenceSchema.extend({
    detail: z.string()
});

/**
 * @type PlaceReference
 * @description A city the server checked, named in each language
 */
export type PlaceReference = z.infer<typeof PlaceReferenceSchema>;

/**
 * @type Place
 * @description A city the server suggests
 */
export type Place = z.infer<typeof PlaceSchema>;

/**
 * @type Category
 * @description A spending category, with its monthly limit
 */
export type Category = z.infer<typeof CategorySchema>;

/**
 * @type Operation
 * @description An operation: an amount spent, in its currency and in euros
 */
export type Operation = z.infer<typeof OperationSchema>;

/**
 * @type RecurringOperation
 * @description A recurring operation, such as a rent or a subscription: each of its occurrences is logged as an operation
 */
export type RecurringOperation = z.infer<typeof RecurringOperationSchema>;

/**
 * @type RecurringFields
 * @description What describes a recurring operation, as the server takes it on creation or change: its city by identity
 * alone, which the server names
 */
export type RecurringFields = Omit<RecurringOperation, 'id' | 'nextDate' | 'place'>;

/**
 * @type TrashedOperation
 * @description An operation in the trash, with when it was deleted
 */
export type TrashedOperation = z.infer<typeof TrashedOperationSchema>;

/**
 * @type MonthlyBudget
 * @description The budget of one finished month, editable at any time
 */
export type MonthlyBudget = z.infer<typeof MonthlyBudgetSchema>;

/**
 * @type BudgetDocument
 * @description The whole budget, as the app and the page share it
 */
export type BudgetDocument = z.infer<typeof BudgetDocumentSchema>;

/**
 * @type OperationPage
 * @description A page of operations, with how many match in all.
 */
export type OperationPage = z.infer<typeof OperationPageSchema>;

/**
 * @type MonthFigures
 * @description What a month spent, worked out by the server.
 */
export type MonthFigures = z.infer<typeof MonthFiguresSchema>;

/**
 * @type AnalysisFigures
 * @description What the Analysis tab shows, worked out by the server.
 */
export type AnalysisFigures = z.infer<typeof AnalysisFiguresSchema>;

/**
 * @type Suggestions
 * @description What the operation editor suggests.
 */
export type Suggestions = z.infer<typeof SuggestionsSchema>;

/**
 * @interface OperationQuery
 * @description Which operations a page lists: the categories picked (any when none is), the first and last days, the
 * search, and the categories whose name matches it in the page's language.
 */
export interface OperationQuery {
    categories: readonly string[]; /*!< The categories picked, none for every category */
    from: Maybe<string>; /*!< The first day included, as `YYYY-MM-DD`, none for no bound */
    to: Maybe<string>; /*!< The last day included, as `YYYY-MM-DD`, none for no bound */
    query: string; /*!< The search */
    queryCategories: readonly string[]; /*!< The categories whose name matches the search */
}

/**
 * @type StoredState
 * @description The whole budget as the server holds it, with its revision
 */
export type StoredState = z.infer<typeof StoredStateSchema>;

/**
 * @type RateSnapshot
 * @description A set of reference rates: the euros one unit of each currency buys
 */
export type RateSnapshot = z.infer<typeof RateSnapshotSchema>;

/**
 * @interface BudgetServer
 * @description The budget's routes on the portal's server, as the store and the rates use them
 */
export interface BudgetServer {
    getState: () => Promise<StoredState>; /*!< Reads the budget document and its revision */
    createOperation: (operation: Operation) => Promise<void>; /*!< Logs an operation under its id */
    updateOperation: (operation: Operation) => Promise<void>; /*!< Changes an operation */
    deleteOperation: (id: string) => Promise<void>; /*!< Moves an operation to the trash */
    restoreOperation: (id: string) => Promise<void>; /*!< Brings an operation back from the trash */
    deleteEveryOperation: () => Promise<void>; /*!< Moves every operation to the trash */
    storeCategory: (category: Category, position: number) => Promise<void>; /*!< Creates or replaces a category */
    deleteCategory: (id: string) => Promise<void>; /*!< Removes a category */
    storeSettings: (monthlyLimit: number) => Promise<void>; /*!< Stores the monthly budget */
    storeMonth: (month: string, budget: MonthlyBudget) => Promise<void>; /*!< Stores the budget of a finished month */
    deleteMonth: (month: string) => Promise<void>; /*!< Forgets the budget of a finished month */
    getRates: () => Promise<RateSnapshot>; /*!< Reads the latest reference rates */
    getRatesOn: (day: string) => Promise<RateSnapshot>; /*!< Reads one day's reference rates */
}

/**
 * @interface BudgetServices
 * @description The long-lived objects the budget shares between its pages and its tile on the home page
 */
export interface BudgetServices {
    store: BudgetStore; /*!< The budget */
    rates: ExchangeRates; /*!< The exchange rates */
}

/**
 * @interface BudgetProviderProps
 * @description Budget provider properties
 */
export interface BudgetProviderProps {
    children: ReactNode; /*!< The budget's pages, or its tile */
}

/**
 * @type BudgetEditorRoute
 * @description What the operation sheet is open on
 */
export type BudgetEditorRoute = { kind: 'new' } | { kind: 'edit'; operation: Operation };

/**
 * @interface BudgetEditorContextProps
 * @description Opening the operation sheet from any page of the budget
 */
export interface BudgetEditorContextProps {
    route: Maybe<BudgetEditorRoute>; /*!< What the sheet is open on, none while closed */
    openNew: () => void; /*!< Opens it on a new operation */
    openEdit: (operation: Operation) => void; /*!< Opens it on an existing one */
    close: () => void; /*!< Closes it */
}

/**
 * @interface BudgetEditorProviderProps
 * @description Budget editor provider properties
 */
export interface BudgetEditorProviderProps {
    children: ReactNode; /*!< The budget's pages */
}
