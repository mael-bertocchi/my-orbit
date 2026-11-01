import type { RequestGenericInterface } from 'fastify';
import { MediaTypeSchema } from 'src/modules/watchlist/catalog/catalog-models';
import { z } from 'zod';

/**
 * @constant RATING_MAX
 * @description The best rating, in half stars: five stars.
 */
export const RATING_MAX = 10;

/**
 * @constant COMMENT_MAX
 * @description How long a comment may be, in characters.
 */
export const COMMENT_MAX = 2000;

/**
 * @constant POSITION_MAX
 * @description The furthest a film can be stopped at, in seconds: a day.
 */
export const POSITION_MAX = 86400;

/**
 * @constant LocalizedTextSchema
 * @description Zod schema for a text the catalog writes in each of the portal's languages, such as a title.
 */
export const LocalizedTextSchema = z.object({
    en: z.string(),
    fr: z.string()
});

/**
 * @constant ProgressSchema
 * @description Zod schema for where a series being watched is: the last episode seen, by season and episode, from 1.
 */
export const ProgressSchema = z.object({
    season: z.number().int().min(1),
    episode: z.number().int().min(1)
});

/**
 * @constant EntrySchema
 * @description Zod schema for a title on the watchlist: to watch while `startedAt` and `watchedAt` are null, being
 * watched once `startedAt` is set, watched once `watchedAt` is, with a rating in half stars (1 to 10) and a comment. A
 * series being watched may say which episode it is at, and keeps how many episodes each of its seasons has; a film being
 * watched may say where it stopped, in seconds. Its title and its saga's name are kept in both of the portal's
 * languages.
 */
export const EntrySchema = z.object({
    id: z.string(),
    tmdbId: z.number().int(),
    mediaType: MediaTypeSchema,
    title: LocalizedTextSchema,
    originalTitle: z.string(),
    releaseDate: z.string().nullable(),
    posterPath: z.string().nullable(),
    genreIds: z.array(z.number().int()),
    collectionId: z.number().int().nullable(),
    collectionName: LocalizedTextSchema.nullable(),
    runtime: z.number().int().nullable(),
    seasons: z.number().int().nullable(),
    episodeCounts: z.array(z.number().int()),
    addedAt: z.date(),
    startedAt: z.date().nullable(),
    progress: ProgressSchema.nullable(),
    position: z.number().int().nullable(),
    watchedAt: z.date().nullable(),
    rating: z.number().int().nullable(),
    comment: z.string().nullable()
});

/**
 * @constant EntryCreateSchema
 * @description Zod schema for adding a title. The server reads what it is from the catalog itself.
 */
export const EntryCreateSchema = z.object({
    mediaType: MediaTypeSchema,
    tmdbId: z.number().int().positive()
});

/**
 * @constant EntryUpdateSchema
 * @description Zod schema for changing a title: starting it, saying where a series or a film is, marking it watched (or not),
 * rating it, commenting on it. A field left out stays as it is; an empty comment is no comment.
 */
export const EntryUpdateSchema = z.object({
    startedAt: z.coerce.date().nullable().optional(),
    progress: ProgressSchema.nullable().optional(),
    position: z.number().int().min(0).max(POSITION_MAX).nullable().optional(),
    watchedAt: z.coerce.date().nullable().optional(),
    rating: z.number().int().min(1).max(RATING_MAX).nullable().optional(),
    comment: z.string().trim().max(COMMENT_MAX).nullable().optional().transform((value) => (value === '' ? null : value))
});

/**
 * @constant EntryParamsSchema
 * @description Zod schema for the title a change is about.
 */
export const EntryParamsSchema = z.object({
    entryId: z.uuid()
});

/**
 * @interface EntryCreateRequest
 * @description Fastify request generic for adding a title.
 *
 * @extends RequestGenericInterface
 */
export interface EntryCreateRequest extends RequestGenericInterface {
    Body: z.infer<typeof EntryCreateSchema>; /*!< The title to add */
}

/**
 * @interface EntryUpdateRequest
 * @description Fastify request generic for changing a title.
 *
 * @extends RequestGenericInterface
 */
export interface EntryUpdateRequest extends RequestGenericInterface {
    Params: z.infer<typeof EntryParamsSchema>; /*!< The title */
    Body: z.infer<typeof EntryUpdateSchema>; /*!< What changes */
}

/**
 * @interface EntryDeleteRequest
 * @description Fastify request generic for taking a title off the watchlist.
 *
 * @extends RequestGenericInterface
 */
export interface EntryDeleteRequest extends RequestGenericInterface {
    Params: z.infer<typeof EntryParamsSchema>; /*!< The title */
}

/**
 * @type Entry
 * @description A title on the watchlist.
 */
export type Entry = z.infer<typeof EntrySchema>;

/**
 * @type Progress
 * @description Where a series being watched is.
 */
export type Progress = z.infer<typeof ProgressSchema>;

/**
 * @type EntryCreate
 * @description What adding a title says.
 */
export type EntryCreate = z.infer<typeof EntryCreateSchema>;

/**
 * @type EntryUpdate
 * @description What changing a title says.
 */
export type EntryUpdate = z.infer<typeof EntryUpdateSchema>;
