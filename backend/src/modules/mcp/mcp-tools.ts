import { randomUUID } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';
import type { BudgetOperation, Prisma, PrismaClient, WatchlistEntry } from 'prisma/generated/prisma/client';
import { createOperation, deleteOperation, updateOperation } from 'src/modules/budget/operations/operations-service';
import { CurrencyCodeSchema } from 'src/modules/budget/rates/rates-models';
import { pullRatesForDay } from 'src/modules/budget/rates/rates-service';
import { StoredCategoryLimitsSchema } from 'src/modules/budget/state/state-models';
import { DEFAULT_MONTHLY_LIMIT } from 'src/modules/budget/state/state-service';
import type { CatalogDetails, CatalogTitle } from 'src/modules/watchlist/catalog/catalog-models';
import { MediaTypeSchema } from 'src/modules/watchlist/catalog/catalog-models';
import { searchCatalog, titleDetails } from 'src/modules/watchlist/catalog/catalog-service';
import { addEntry, updateEntry } from 'src/modules/watchlist/entries/entries-service';
import type { Variables } from 'src/plugins/environment';
import { OWNER_ID } from 'src/plugins/identity';
import type { Maybe, Perhaps } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { z } from 'zod';

/**
 * @constant SEARCH_SCAN_MAX
 * @description How many operations a search reads at most to count and total its matches.
 */
const SEARCH_SCAN_MAX = 5000;

/**
 * @interface ToolContext
 * @description What a tool works with.
 */
export interface ToolContext {
    prisma: PrismaClient; /*!< The database client */
    variables: Variables; /*!< The environment, holding the catalog's address and token */
    logger: FastifyBaseLogger; /*!< The request logger */
    language: 'en' | 'fr'; /*!< The language the owner reads */
    today: string; /*!< The owner's day, as `YYYY-MM-DD` */
}

/**
 * @interface ToolOutcome
 * @description What running a tool gives: what to tell the model.
 */
export interface ToolOutcome {
    result: Record<string, unknown>; /*!< What the model reads back */
}

/**
 * @interface ToolDeclaration
 * @description A tool as a model is told about it.
 */
export interface ToolDeclaration {
    name: string; /*!< Its name, after the app it works on */
    description: string; /*!< What it does and when to use it */
    parameters: Record<string, unknown>; /*!< Its arguments, as a JSON schema */
}

/**
 * @interface ServerTool
 * @description A tool a model may call, which runs on the server.
 */
export interface ServerTool {
    declaration: ToolDeclaration; /*!< How the model is told about it */
    isReadOnly: boolean; /*!< Whether it only reads */
    isDestructive: boolean; /*!< Whether it takes something away, such as moving an operation to the trash */
    run: (context: ToolContext, args: Record<string, unknown>) => Promise<ToolOutcome>; /*!< What it does */
}

/**
 * @constant DaySchema
 * @description Zod schema for a day, as `YYYY-MM-DD`.
 */
export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * @function invalid
 * @description The outcome of a call whose arguments don't hold up, telling the model what to fix.
 *
 * @param {z.ZodError} error What went wrong.
 *
 * @returns {ToolOutcome} The outcome.
 */
export function invalid(error: z.ZodError): ToolOutcome {
    return { result: { error: `Invalid arguments: ${error.issues.map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`).join('; ')}` } };
}

/**
 * @function euros
 * @description An amount rounded to the cent.
 *
 * @param {number} value The amount.
 *
 * @returns {number} The rounded amount.
 */
export function euros(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * @interface OperationLine
 * @description An operation in a few fields, as the model sees it.
 */
export interface OperationLine {
    id: string; /*!< Its id */
    date: Date; /*!< When it happened */
    name: string; /*!< What it was */
    categoryId: string; /*!< Its category */
    amount: number; /*!< Its amount, in its currency */
    currencyCode: string; /*!< Its currency */
    euroAmount: number; /*!< Its amount in euros */
}

/**
 * @function summaryOf
 * @description An operation as the model sees it.
 *
 * @param {BudgetOperation} row The stored operation.
 *
 * @returns {OperationLine} Its summary.
 */
export function summaryOf(row: BudgetOperation): OperationLine {
    return {
        id: row.id,
        date: row.date,
        name: row.name,
        categoryId: row.categoryId,
        amount: row.amount,
        currencyCode: row.currencyCode,
        euroAmount: euros(row.amount * row.rateToEuro)
    };
}

/**
 * @function monthBounds
 * @description The first instant of a month and of the next one.
 *
 * @param {string} month The month, as `YYYY-MM`.
 *
 * @returns {{ start: Date; end: Date }} Its bounds.
 */
function monthBounds(month: string): { start: Date; end: Date } {
    const [year, index] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year ?? 1970, (index ?? 1) - 1, 1));
    const end = new Date(Date.UTC(year ?? 1970, index ?? 1, 1));

    return { start, end };
}

/**
 * @function findLiveOperation
 * @description Reads an operation still in the budget.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id Its id.
 *
 * @returns {Promise<Perhaps<BudgetOperation>>} The operation, or undefined when it is unknown or in the trash.
 */
export async function findLiveOperation(prisma: PrismaClient, id: string): Promise<Perhaps<BudgetOperation>> {
    const row = await prisma.budgetOperation.findUnique({ where: { id } });

    return row === null || row.deletedAt !== null ? undefined : row;
}

/**
 * @function unknownCategory
 * @description Checks a category id against the stored categories.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {Perhaps<string>} categoryId The id, if the call names one.
 *
 * @returns {Promise<Perhaps<ToolOutcome>>} An outcome telling the model the valid ids when it is unknown, undefined otherwise.
 */
export async function unknownCategory(prisma: PrismaClient, categoryId: Perhaps<string>): Promise<Perhaps<ToolOutcome>> {
    if (categoryId === undefined) {
        return undefined;
    }

    const categories = await prisma.budgetCategory.findMany({ orderBy: { position: 'asc' } });

    if (categories.some((category) => category.id === categoryId)) {
        return undefined;
    }

    return { result: { error: `Unknown category "${categoryId}". Use one of: ${categories.map((category) => category.id).join(', ')}` } };
}

/**
 * @constant SearchOperationsSchema
 * @description Zod schema for the arguments of `budget_search_operations`.
 */
const SearchOperationsSchema = z.object({
    query: z.string().trim().min(1).max(100).optional(),
    categoryId: z.string().optional(),
    from: DaySchema.optional(),
    to: DaySchema.optional(),
    limit: z.number().int().min(1).max(50).default(20)
});

/**
 * @constant searchOperations
 * @description Finds operations in the budget, the latest first, with how many match and their total in euros.
 */
export const searchOperations: ServerTool = {
    isReadOnly: true,
    isDestructive: false,
    declaration: {
        name: 'budget_search_operations',
        description: 'Finds logged operations (expenses) in the budget, latest first. Returns how many match, their total in euros, and up to `limit` of them. Every filter is optional.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Words to look for in the name, note or place, case-insensitive' },
                categoryId: { type: 'string', description: 'Only this category' },
                from: { type: 'string', description: 'First day included, YYYY-MM-DD' },
                to: { type: 'string', description: 'Last day included, YYYY-MM-DD' },
                limit: { type: 'integer', description: 'How many operations to list, 1 to 50, 20 by default' }
            }
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = SearchOperationsSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const { query, categoryId, from, to, limit } = parsed.data;
        const rows = await context.prisma.budgetOperation.findMany({
            where: {
                deletedAt: null,
                categoryId,
                date: { gte: from === undefined ? undefined : new Date(`${from}T00:00:00.000Z`), lte: to === undefined ? undefined : new Date(`${to}T23:59:59.999Z`) },
                OR: query === undefined ? undefined : [
                    { name: { contains: query, mode: 'insensitive' } },
                    { description: { contains: query, mode: 'insensitive' } },
                    { location: { contains: query, mode: 'insensitive' } }
                ]
            },
            orderBy: { date: 'desc' },
            take: SEARCH_SCAN_MAX
        });

        return {
            result: {
                count: rows.length,
                totalEuros: euros(rows.reduce((total, row) => total + row.amount * row.rateToEuro, 0)),
                operations: rows.slice(0, limit).map((row) => ({ ...summaryOf(row), description: row.description, location: row.location, isOnline: row.isOnline, isRecurring: row.isRecurring }))
            }
        };
    }
};

/**
 * @constant MonthSummarySchema
 * @description Zod schema for the arguments of `budget_month_summary`.
 */
const MonthSummarySchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/)
});

/**
 * @constant monthSummary
 * @description Sums up one month: the budget, what was spent, and each category against its limit.
 */
export const monthSummary: ServerTool = {
    isReadOnly: true,
    isDestructive: false,
    declaration: {
        name: 'budget_month_summary',
        description: 'Sums up one month of the budget: the monthly budget, what was spent in euros, what is left, and each category\'s spending against its limit.',
        parameters: {
            type: 'object',
            properties: {
                month: { type: 'string', description: 'The month, YYYY-MM' }
            },
            required: ['month']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = MonthSummarySchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const { start, end } = monthBounds(parsed.data.month);
        const [rows, categories, frozen, state] = await Promise.all([
            context.prisma.budgetOperation.findMany({ where: { deletedAt: null, date: { gte: start, lt: end } } }),
            context.prisma.budgetCategory.findMany({ orderBy: { position: 'asc' } }),
            context.prisma.budgetHistory.findUnique({ where: { month: parsed.data.month } }),
            context.prisma.budgetState.findUnique({ where: { id: OWNER_ID } })
        ]);
        const limits = frozen === null ? Object.fromEntries(categories.map((category) => [category.id, category.monthlyLimit])) : StoredCategoryLimitsSchema.parse(frozen.categoryLimits);
        const monthlyLimit = frozen?.monthlyLimit ?? state?.monthlyLimit ?? DEFAULT_MONTHLY_LIMIT;
        const spent = new Map<string, number>();

        for (const row of rows) {
            spent.set(row.categoryId, (spent.get(row.categoryId) ?? 0) + row.amount * row.rateToEuro);
        }

        const total = [...spent.values()].reduce((sum, value) => sum + value, 0);
        const ids = new Set([...categories.map((category) => category.id), ...spent.keys()]);

        return {
            result: {
                month: parsed.data.month,
                monthlyLimit,
                spentEuros: euros(total),
                leftEuros: euros(monthlyLimit - total),
                operationCount: rows.length,
                categories: [...ids].map((id) => ({
                    id,
                    name: categories.find((category) => category.id === id)?.name ?? id,
                    spentEuros: euros(spent.get(id) ?? 0),
                    limitEuros: limits[id] ?? 0
                }))
            }
        };
    }
};

/**
 * @constant SearchWatchlistSchema
 * @description Zod schema for the arguments of `watchlist_search`.
 */
const SearchWatchlistSchema = z.object({
    query: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['toWatch', 'watching', 'watched', 'all']).default('all'),
    limit: z.number().int().min(1).max(50).default(20)
});

/**
 * @constant WATCHLIST_STATUS_FILTERS
 * @description Which stored titles each status of `watchlist_search` keeps.
 */
const WATCHLIST_STATUS_FILTERS: Record<z.infer<typeof SearchWatchlistSchema>['status'], Prisma.WatchlistEntryWhereInput> = {
    toWatch: { startedAt: null, watchedAt: null },
    watching: { startedAt: { not: null }, watchedAt: null },
    watched: { watchedAt: { not: null } },
    all: {}
};

/**
 * @function statusOf
 * @description Where a stored title stands: to watch, being watched, or watched.
 *
 * @param {WatchlistEntry} row The stored title.
 *
 * @returns {'toWatch' | 'watching' | 'watched'} Its status.
 */
function statusOf(row: WatchlistEntry): 'toWatch' | 'watching' | 'watched' {
    if (row.watchedAt !== null) {
        return 'watched';
    }

    return row.startedAt === null ? 'toWatch' : 'watching';
}

/**
 * @constant searchWatchlist
 * @description Finds films and series on the watchlist.
 */
export const searchWatchlist: ServerTool = {
    isReadOnly: true,
    isDestructive: false,
    declaration: {
        name: 'watchlist_search',
        description: 'Finds films and series on the watchlist, the latest added first: their id, title, kind, runtime in minutes or seasons, their status, once started the day and for a series the last episode seen, and once watched, the day, the rating (in half stars, 1 to 10) and the comment.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Words to look for in the title, case-insensitive' },
                status: { type: 'string', enum: ['toWatch', 'watching', 'watched', 'all'], description: 'Still to watch, being watched, already watched, or all of them (the default)' },
                limit: { type: 'integer', description: 'How many titles to list, 1 to 50, 20 by default' }
            }
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = SearchWatchlistSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const { query, status, limit } = parsed.data;
        const rows = await context.prisma.watchlistEntry.findMany({
            where: WATCHLIST_STATUS_FILTERS[status],
            orderBy: { addedAt: 'desc' }
        });
        const needle = query?.toLocaleLowerCase();
        const matches = needle === undefined ? rows : rows.filter((row) => [row.titleEn, row.titleFr, row.originalTitle].some((title) => title.toLocaleLowerCase().includes(needle)));

        return {
            result: {
                count: matches.length,
                titles: matches.slice(0, limit).map((row) => ({
                    id: row.id,
                    title: context.language === 'fr' ? row.titleFr : row.titleEn,
                    mediaType: row.mediaType,
                    releaseDate: row.releaseDate,
                    runtime: row.runtime,
                    seasons: row.seasons,
                    status: statusOf(row),
                    startedAt: row.startedAt,
                    lastEpisode: row.season === null || row.episode === null ? null : { season: row.season, episode: row.episode },
                    watchedAt: row.watchedAt,
                    rating: row.rating,
                    comment: row.comment
                }))
            }
        };
    }
};

/**
 * @constant CATALOG_UNAVAILABLE
 * @description What the model reads when the catalog can't be asked, so it says so instead of answering from memory.
 */
const CATALOG_UNAVAILABLE: ToolOutcome = { result: { error: 'The film and series catalog is unavailable right now: say so, and do not describe the title from memory' } };

/**
 * @constant OTHER_MATCHES
 * @description How many other titles a search by name lists besides the one it describes, for the model to tell them apart.
 */
const OTHER_MATCHES = 4;

/**
 * @function yearOf
 * @description The year of a release date.
 *
 * @param {Maybe<string>} date The date, as `YYYY-MM-DD`, or null.
 *
 * @returns {Maybe<string>} Its year, or null.
 */
function yearOf(date: Maybe<string>): Maybe<string> {
    return date === null || date === '' ? null : date.slice(0, 4);
}

/**
 * @function watchlistEntryOf
 * @description The watchlist's entry for a title of the catalog.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {CatalogTitle} title The title.
 *
 * @returns {Promise<Maybe<string>>} The entry's id, or null when the title isn't on the watchlist.
 */
export async function watchlistEntryOf(prisma: PrismaClient, title: Pick<CatalogTitle, 'mediaType' | 'tmdbId'>): Promise<Maybe<string>> {
    const entry = await prisma.watchlistEntry.findFirst({ where: { mediaType: title.mediaType, tmdbId: title.tmdbId } });

    return entry?.id ?? null;
}

/**
 * @function describedTitle
 * @description A title of the catalog as the model reads it: what it is about, its genres, its length, its saga, where to
 * watch it, and whether it is on the watchlist.
 *
 * @param {CatalogDetails} details The title's details.
 * @param {Maybe<string>} entryId Its watchlist entry, or null.
 *
 * @returns {Record<string, unknown>} The title.
 */
function describedTitle(details: CatalogDetails, entryId: Maybe<string>): Record<string, unknown> {
    const names = (providers: CatalogDetails['offers']['subscription']): string[] => providers.map((provider) => provider.name);

    return {
        tmdbId: details.tmdbId,
        mediaType: details.mediaType,
        title: details.title,
        originalTitle: details.originalTitle,
        year: yearOf(details.releaseDate),
        overview: details.overview,
        genres: details.genres.map((genre) => genre.name),
        runtime: details.runtime,
        seasons: details.seasons,
        saga: details.collection?.name ?? null,
        whereToWatch: { subscription: names(details.offers.subscription), free: names(details.offers.free), rent: names(details.offers.rent), buy: names(details.offers.buy) },
        watchlistEntryId: entryId
    };
}

/**
 * @constant TitleDetailsSchema
 * @description Zod schema for the arguments of `watchlist_title_details`: a watchlist entry, a title of the catalog, or a
 * name to look for.
 */
const TitleDetailsSchema = z.object({
    entryId: z.uuid().optional(),
    mediaType: MediaTypeSchema.optional(),
    tmdbId: z.number().int().positive().optional(),
    query: z.string().trim().min(1).max(100).optional()
}).refine((args) => args.entryId !== undefined || (args.mediaType !== undefined && args.tmdbId !== undefined) || args.query !== undefined, { message: 'Give entryId, mediaType and tmdbId, or query' });

/**
 * @constant watchlistTitleDetails
 * @description Reads what a film or a series is about from the catalog, on the watchlist or not.
 */
export const watchlistTitleDetails: ServerTool = {
    isReadOnly: true,
    isDestructive: false,
    declaration: {
        name: 'watchlist_title_details',
        description: 'Reads a film or a series from the catalog (TMDB): its synopsis, year, genres, runtime or seasons, saga, the services it can be watched on, and its watchlist entry id if it is on the watchlist. Name it by its watchlist entry id, by mediaType and tmdbId, or by a query; a query describes the best match and lists a few others.',
        parameters: {
            type: 'object',
            properties: {
                entryId: { type: 'string', description: 'A watchlist entry id, from watchlist_search' },
                mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'Film or series, with tmdbId' },
                tmdbId: { type: 'integer', description: 'The title\'s catalog id, with mediaType' },
                query: { type: 'string', description: 'The title\'s name, to look for in the catalog' }
            }
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = TitleDetailsSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const { entryId, mediaType, tmdbId, query } = parsed.data;
        let target: Perhaps<Pick<CatalogTitle, 'mediaType' | 'tmdbId'>> = mediaType !== undefined && tmdbId !== undefined ? { mediaType, tmdbId } : undefined;
        let others: CatalogTitle[] = [];

        try {
            if (entryId !== undefined) {
                const entry = await context.prisma.watchlistEntry.findUnique({ where: { id: entryId } });
                const entryMedia = MediaTypeSchema.safeParse(entry?.mediaType);

                if (entry === null || !entryMedia.success) {
                    return { result: { error: 'Unknown title: find its id with watchlist_search' } };
                }

                target = { mediaType: entryMedia.data, tmdbId: entry.tmdbId };
            } else if (target === undefined && query !== undefined) {
                const [best, ...rest] = await searchCatalog(context.variables, context.logger, query, context.language);

                if (best === undefined) {
                    return { result: { error: `Nothing in the catalog matches "${query}"` } };
                }

                target = best;
                others = rest.slice(0, OTHER_MATCHES);
            }

            if (target === undefined) {
                return { result: { error: 'Give entryId, mediaType and tmdbId, or query' } };
            }

            const details = await titleDetails(context.variables, context.logger, target.mediaType, target.tmdbId, context.language);
            const otherMatches = others.map((title) => ({ tmdbId: title.tmdbId, mediaType: title.mediaType, title: title.title, year: yearOf(title.releaseDate) }));

            return { result: { ...describedTitle(details, await watchlistEntryOf(context.prisma, details)), otherMatches } };
        } catch (error: unknown) {
            if (error instanceof RequestError) {
                return CATALOG_UNAVAILABLE;
            }

            throw error;
        }
    }
};

/**
 * @constant BANK_MARKUP
 * @description What the owner's bank adds on top of the reference rate of any currency but the euro, as the apps apply it.
 */
const BANK_MARKUP = 0.01;

/**
 * @constant EURO
 * @description The euro's code: the budget's own currency, at a rate of 1.
 */
const EURO = 'EUR';

/**
 * @constant LOGGED_AT
 * @description The time of day an operation logged by a model is dated at, in UTC: noon falls on the same day in every
 * time zone around Europe, where the owner lives, so the apps show it on the day it was given.
 */
const LOGGED_AT = 'T12:00:00.000Z';

/**
 * @function failed
 * @description The outcome of a call the server refused, telling the model why in the server's words.
 *
 * @param {unknown} error What the server threw.
 *
 * @returns {ToolOutcome} The outcome. Anything other than a refusal is thrown again.
 */
function failed(error: unknown): ToolOutcome {
    if (error instanceof RequestError) {
        return { result: { error: error.message } };
    }

    throw error;
}

/**
 * @function momentOf
 * @description The moment an operation dated on a day is stored at.
 *
 * @param {string} day The day, as `YYYY-MM-DD`.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {Perhaps<Date>} The moment, or undefined for a day still to come.
 */
function momentOf(day: string, today: string): Perhaps<Date> {
    return day > today ? undefined : new Date(`${day}${LOGGED_AT}`);
}

/**
 * @function rateOn
 * @description The euros one unit of a currency cost on a day, the bank's markup included, as the apps price an operation.
 *
 * @param {ToolContext} context What the tool works with.
 * @param {string} code The currency.
 * @param {string} day The day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<Perhaps<number>>} The rate, or undefined when the currency has none. Rejects with 503 when no rate can
 * be had.
 */
async function rateOn(context: ToolContext, code: string, day: string): Promise<Perhaps<number>> {
    if (code === EURO) {
        return 1;
    }

    const snapshot = await pullRatesForDay(context.prisma, context.logger, day);
    const reference = snapshot.rates[code];

    return reference === undefined ? undefined : reference * (1 + BANK_MARKUP);
}

/**
 * @constant listCategories
 * @description Lists the budget's categories, for their ids.
 */
export const listCategories: ServerTool = {
    isReadOnly: true,
    isDestructive: false,
    declaration: {
        name: 'budget_list_categories',
        description: 'Lists the budget\'s categories: their id, name and monthly limit in euros. Every operation belongs to one of them.',
        parameters: {
            type: 'object',
            properties: {}
        }
    },
    run: async (context: ToolContext): Promise<ToolOutcome> => {
        const categories = await context.prisma.budgetCategory.findMany({ orderBy: { position: 'asc' } });

        return { result: { categories: categories.map((category) => ({ id: category.id, name: category.name, limitEuros: category.monthlyLimit })) } };
    }
};

/**
 * @constant CreateOperationSchema
 * @description Zod schema for the arguments of `budget_create_operation`.
 */
const CreateOperationSchema = z.object({
    date: DaySchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    categoryId: z.string().min(1),
    location: z.string().trim().max(200).optional(),
    amount: z.number().positive().max(1_000_000_000),
    currencyCode: CurrencyCodeSchema,
    isOnline: z.boolean().default(false),
    isRecurring: z.boolean().default(false)
});

/**
 * @constant createOperationTool
 * @description Logs an operation, priced at its day's rate as the apps price one.
 */
export const createOperationTool: ServerTool = {
    isReadOnly: false,
    isDestructive: false,
    declaration: {
        name: 'budget_create_operation',
        description: 'Logs an operation (an expense) in the budget, priced in euros at its day\'s rate. Use a category id from budget_list_categories.',
        parameters: {
            type: 'object',
            properties: {
                date: { type: 'string', description: 'The day it happened, YYYY-MM-DD, today or before' },
                name: { type: 'string', description: 'What it was, usually the merchant' },
                description: { type: 'string', description: 'A note, if the owner gave one' },
                categoryId: { type: 'string', description: 'One of the category ids' },
                location: { type: 'string', description: 'The city or place, if any' },
                amount: { type: 'number', description: 'The amount in its own currency' },
                currencyCode: { type: 'string', description: 'ISO 4217 code, EUR unless the owner said otherwise' },
                isOnline: { type: 'boolean', description: 'Whether it was paid online, false by default' },
                isRecurring: { type: 'boolean', description: 'Whether it comes back every month, false by default' }
            },
            required: ['date', 'name', 'categoryId', 'amount', 'currencyCode']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = CreateOperationSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const { date, description, location, ...draft } = parsed.data;
        const refusal = await unknownCategory(context.prisma, draft.categoryId);

        if (refusal !== undefined) {
            return refusal;
        }

        const moment = momentOf(date, context.today);

        if (moment === undefined) {
            return { result: { error: 'The day is still to come: an operation is logged on the day it happened or after' } };
        }

        try {
            const rateToEuro = await rateOn(context, draft.currencyCode, date);

            if (rateToEuro === undefined) {
                return { result: { error: `No exchange rate for ${draft.currencyCode}` } };
            }

            const operation = await createOperation(context.prisma, { ...draft, id: randomUUID().toUpperCase(), date: moment, description: description ?? null, location: location ?? null, rateToEuro });

            return { result: { status: 'Logged', operation: { ...operation, euroAmount: euros(operation.amount * operation.rateToEuro) } } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};

/**
 * @constant UpdateOperationSchema
 * @description Zod schema for the arguments of `budget_update_operation`.
 */
const UpdateOperationSchema = z.object({
    operationId: z.string().min(1),
    changes: z.object({
        date: DaySchema.optional(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        categoryId: z.string().min(1).optional(),
        location: z.string().trim().max(200).nullable().optional(),
        amount: z.number().positive().max(1_000_000_000).optional(),
        currencyCode: CurrencyCodeSchema.optional(),
        isOnline: z.boolean().optional(),
        isRecurring: z.boolean().optional()
    })
});

/**
 * @constant updateOperationTool
 * @description Changes an operation. It is priced again only when its currency or its day changes.
 */
export const updateOperationTool: ServerTool = {
    isReadOnly: false,
    isDestructive: false,
    declaration: {
        name: 'budget_update_operation',
        description: 'Changes an existing operation, found first with budget_search_operations. Only the fields given change; a note or a place set to null is cleared. A new currency or day prices it again at that day\'s rate.',
        parameters: {
            type: 'object',
            properties: {
                operationId: { type: 'string', description: 'The operation\'s id' },
                changes: {
                    type: 'object',
                    description: 'Only the fields that change',
                    properties: {
                        date: { type: 'string', description: 'YYYY-MM-DD, today or before' },
                        name: { type: 'string' },
                        description: { type: ['string', 'null'] },
                        categoryId: { type: 'string' },
                        location: { type: ['string', 'null'] },
                        amount: { type: 'number' },
                        currencyCode: { type: 'string' },
                        isOnline: { type: 'boolean' },
                        isRecurring: { type: 'boolean' }
                    }
                }
            },
            required: ['operationId', 'changes']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = UpdateOperationSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const existing = await findLiveOperation(context.prisma, parsed.data.operationId);

        if (existing === undefined) {
            return { result: { error: 'Unknown operation: find its id with budget_search_operations' } };
        }

        const { date, ...changes } = parsed.data.changes;
        const refusal = await unknownCategory(context.prisma, changes.categoryId);

        if (refusal !== undefined) {
            return refusal;
        }

        const moment = date === undefined ? undefined : momentOf(date, context.today);

        if (date !== undefined && moment === undefined) {
            return { result: { error: 'The day is still to come: an operation is dated on the day it happened or before' } };
        }

        try {
            const isRepriced = date !== undefined || changes.currencyCode !== undefined;
            const code = changes.currencyCode ?? existing.currencyCode;
            const rateToEuro = isRepriced ? await rateOn(context, code, date ?? existing.date.toISOString().slice(0, 10)) : existing.rateToEuro;

            if (rateToEuro === undefined) {
                return { result: { error: `No exchange rate for ${code}` } };
            }

            const operation = await updateOperation(context.prisma, existing.id, { ...changes, date: moment, rateToEuro });

            return { result: { status: 'Changed', operation: { ...operation, euroAmount: euros(operation.amount * operation.rateToEuro) } } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};

/**
 * @constant DeleteOperationSchema
 * @description Zod schema for the arguments of `budget_delete_operation`.
 */
const DeleteOperationSchema = z.object({
    operationId: z.string().min(1)
});

/**
 * @constant deleteOperationTool
 * @description Moves one operation to the trash, where the apps can restore it.
 */
export const deleteOperationTool: ServerTool = {
    isReadOnly: false,
    isDestructive: true,
    declaration: {
        name: 'budget_delete_operation',
        description: 'Moves one operation, found first with budget_search_operations, to the trash, where the owner can restore it from the apps. Delete one operation per call, and only the ones the owner asked for.',
        parameters: {
            type: 'object',
            properties: {
                operationId: { type: 'string', description: 'The operation\'s id' }
            },
            required: ['operationId']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = DeleteOperationSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const existing = await findLiveOperation(context.prisma, parsed.data.operationId);

        if (existing === undefined) {
            return { result: { error: 'Unknown operation: find its id with budget_search_operations' } };
        }

        try {
            await deleteOperation(context.prisma, existing.id);

            return { result: { status: 'Moved to the trash', operation: summaryOf(existing) } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};

/**
 * @constant RateTitleSchema
 * @description Zod schema for the arguments of `watchlist_rate_title`.
 */
const RateTitleSchema = z.object({
    entryId: z.uuid(),
    rating: z.number().int().min(1).max(10),
    comment: z.string().trim().max(2000).optional(),
    watchedAt: DaySchema.optional()
});

/**
 * @constant rateTitleTool
 * @description Marks a title of the watchlist watched, with a rating and a comment.
 */
export const rateTitleTool: ServerTool = {
    isReadOnly: false,
    isDestructive: false,
    declaration: {
        name: 'watchlist_rate_title',
        description: 'Marks a watchlist title as watched, with a rating and an optional comment. Find its id first with watchlist_search.',
        parameters: {
            type: 'object',
            properties: {
                entryId: { type: 'string', description: 'The title\'s id' },
                rating: { type: 'integer', description: 'In half stars, 1 to 10 (10 is five stars)' },
                comment: { type: 'string', description: 'What the owner thought, in their words' },
                watchedAt: { type: 'string', description: 'The day it was watched, YYYY-MM-DD, today by default' }
            },
            required: ['entryId', 'rating']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = RateTitleSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const moment = momentOf(parsed.data.watchedAt ?? context.today, context.today);

        if (moment === undefined) {
            return { result: { error: 'The day is still to come: a title is marked watched on the day it was watched' } };
        }

        try {
            const entry = await updateEntry(context.prisma, parsed.data.entryId, { watchedAt: moment, rating: parsed.data.rating, comment: parsed.data.comment === '' ? null : parsed.data.comment ?? null });

            return { result: { status: 'Rated', title: context.language === 'fr' ? entry.title.fr : entry.title.en, rating: entry.rating, comment: entry.comment } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};

/**
 * @constant AddTitleSchema
 * @description Zod schema for the arguments of `watchlist_add_title`.
 */
const AddTitleSchema = z.object({
    mediaType: MediaTypeSchema,
    tmdbId: z.number().int().positive()
});

/**
 * @constant addTitleTool
 * @description Puts a film or a series on the watchlist.
 */
export const addTitleTool: ServerTool = {
    isReadOnly: false,
    isDestructive: false,
    declaration: {
        name: 'watchlist_add_title',
        description: 'Adds a film or a series to the watchlist, found first with watchlist_title_details.',
        parameters: {
            type: 'object',
            properties: {
                mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'Film or series' },
                tmdbId: { type: 'integer', description: 'The title\'s catalog id' }
            },
            required: ['mediaType', 'tmdbId']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = AddTitleSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        try {
            const entry = await addEntry(context.prisma, context.variables, context.logger, parsed.data);

            return { result: { status: 'Added', entryId: entry.id, title: context.language === 'fr' ? entry.title.fr : entry.title.en } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};

/**
 * @constant MCP_TOOLS
 * @description Every tool the MCP server offers, named after the app it works on: five that read, five that write.
 */
export const MCP_TOOLS: readonly ServerTool[] = [
    listCategories,
    searchOperations,
    monthSummary,
    createOperationTool,
    updateOperationTool,
    deleteOperationTool,
    searchWatchlist,
    watchlistTitleDetails,
    rateTitleTool,
    addTitleTool
];
