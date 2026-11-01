import type { Maybe } from 'models';
import type { ReactNode } from 'react';
import { z } from 'zod';

/**
 * @constant MediaTypeSchema
 * @description A film, or a series as a whole.
 */
export const MediaTypeSchema = z.enum(['movie', 'tv']);

/**
 * @constant GenreSchema
 * @description A genre, named in the page's language.
 */
export const GenreSchema = z.object({
    id: z.number().int(),
    name: z.string()
});

/**
 * @constant CatalogTitleSchema
 * @description A film or a series as the catalog lists it, in a search or a saga.
 */
export const CatalogTitleSchema = z.object({
    tmdbId: z.number().int(),
    mediaType: MediaTypeSchema,
    title: z.string(),
    originalTitle: z.string(),
    releaseDate: z.string().nullable(),
    posterPath: z.string().nullable(),
    overview: z.string()
});

/**
 * @constant ProviderSchema
 * @description A service offering a title: a streaming service, a store, a rental shop.
 */
export const ProviderSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    logoPath: z.string().nullable()
});

/**
 * @constant OffersSchema
 * @description Where a title can be watched in France, by kind of offer.
 */
export const OffersSchema = z.object({
    link: z.string().nullable(),
    subscription: z.array(ProviderSchema),
    free: z.array(ProviderSchema),
    rent: z.array(ProviderSchema),
    buy: z.array(ProviderSchema)
});

/**
 * @constant TitleDetailsSchema
 * @description Everything shown about one title.
 */
export const TitleDetailsSchema = CatalogTitleSchema.extend({
    genres: z.array(GenreSchema),
    runtime: z.number().int().nullable(),
    seasons: z.number().int().nullable(),
    episodeCounts: z.array(z.number().int()).default([]),
    collection: GenreSchema.nullable(),
    offers: OffersSchema
});

/**
 * @constant CollectionSchema
 * @description A saga, its films in the order they came out.
 */
export const CollectionSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    parts: z.array(CatalogTitleSchema)
});

/**
 * @constant LocalizedTextSchema
 * @description A text kept in each of the portal's languages, such as a title.
 */
export const LocalizedTextSchema = z.object({
    en: z.string(),
    fr: z.string()
});

/**
 * @constant ProgressSchema
 * @description Where a series being watched is: the last episode seen, by season and episode, from 1.
 */
export const ProgressSchema = z.object({
    season: z.number().int(),
    episode: z.number().int()
});

/**
 * @constant EntrySchema
 * @description A title on the watchlist: to watch while it is neither started nor watched, being watched once
 * `startedAt` is set, watched once `watchedAt` is, then rated in half stars (1 to 10) and maybe commented on. A series
 * being watched may say which episode it is at, and keeps how many episodes each of its seasons has; a film being watched
 * may say where it stopped, in seconds. Its title and its saga's name are kept in both of the portal's languages.
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
    episodeCounts: z.array(z.number().int()).default([]),
    addedAt: z.coerce.date(),
    startedAt: z.coerce.date().nullable().default(null),
    progress: ProgressSchema.nullable().default(null),
    position: z.number().int().nullable().default(null),
    watchedAt: z.coerce.date().nullable(),
    rating: z.number().int().nullable(),
    comment: z.string().nullable()
});

/**
 * @type MediaType
 * @description A film, or a series.
 */
export type MediaType = z.infer<typeof MediaTypeSchema>;

/**
 * @type Genre
 * @description A genre.
 */
export type Genre = z.infer<typeof GenreSchema>;

/**
 * @type CatalogTitle
 * @description A film or a series as the catalog lists it.
 */
export type CatalogTitle = z.infer<typeof CatalogTitleSchema>;

/**
 * @type Provider
 * @description A service offering a title.
 */
export type Provider = z.infer<typeof ProviderSchema>;

/**
 * @type Offers
 * @description Where a title can be watched in France.
 */
export type Offers = z.infer<typeof OffersSchema>;

/**
 * @type TitleDetails
 * @description Everything shown about one title.
 */
export type TitleDetails = z.infer<typeof TitleDetailsSchema>;

/**
 * @type Collection
 * @description A saga.
 */
export type Collection = z.infer<typeof CollectionSchema>;

/**
 * @type LocalizedText
 * @description A text kept in each of the portal's languages.
 */
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/**
 * @type Progress
 * @description Where a series being watched is.
 */
export type Progress = z.infer<typeof ProgressSchema>;

/**
 * @type Entry
 * @description A title on the watchlist.
 */
export type Entry = z.infer<typeof EntrySchema>;

/**
 * @type EntryStatus
 * @description Where a title stands: to watch, being watched, or watched.
 */
export type EntryStatus = 'toWatch' | 'watching' | 'watched';

/**
 * @interface TitleReference
 * @description Which title is meant, on the watchlist or not.
 */
export interface TitleReference {
    mediaType: MediaType; /*!< A film or a series */
    tmdbId: number; /*!< Its identifier in the catalog */
}

/**
 * @interface EntryChanges
 * @description What changing a title says. A field left out stays as it is.
 */
export interface EntryChanges {
    startedAt?: Maybe<Date>; /*!< When it was started, or null to put it back to watch */
    progress?: Maybe<Progress>; /*!< The last episode seen of a series being watched */
    position?: Maybe<number>; /*!< Where a film being watched stopped, in seconds */
    watchedAt?: Maybe<Date>; /*!< When it was watched, or null to watch it again */
    rating?: Maybe<number>; /*!< Its rating in half stars, 1 to 10 */
    comment?: Maybe<string>; /*!< What to say about it */
}

/**
 * @interface SaveHandle
 * @description How to store a change to a title, and whether one is on its way
 */
export interface SaveHandle {
    save: (changes: EntryChanges) => Promise<boolean>; /*!< Stores a change, telling whether it went through */
    isSaving: boolean; /*!< Whether a change is on its way */
}

/**
 * @interface WatchlistServer
 * @description What the watchlist needs from the server.
 */
export interface WatchlistServer {
    getEntries: () => Promise<Entry[]>; /*!< Reads every title on the watchlist */
    addEntry: (title: TitleReference) => Promise<Entry>; /*!< Puts a title on it */
    updateEntry: (id: string, changes: EntryChanges) => Promise<Entry>; /*!< Changes one */
    removeEntry: (id: string) => Promise<void>; /*!< Takes one off */
    getGenres: () => Promise<Genre[]>; /*!< Reads every genre, in the page's language */
}

/**
 * @type WatchlistStatus
 * @description Where the watchlist stands with the server: being read, read, or not readable.
 */
export type WatchlistStatus = 'loading' | 'ready' | 'failed';

/**
 * @interface WatchlistSnapshot
 * @description The watchlist as the pages render it.
 */
export interface WatchlistSnapshot {
    entries: Maybe<Entry[]>; /*!< Its titles, once read */
    genres: ReadonlyMap<number, string>; /*!< Every genre's name, by identifier, once read */
    status: WatchlistStatus; /*!< Where it stands with the server */
    error: Maybe<string>; /*!< Why it couldn't be read */
}

/**
 * @interface WatchlistProviderProps
 * @description What the watchlist's provider wraps.
 */
export interface WatchlistProviderProps {
    children: ReactNode; /*!< The pages or the tile sharing the watchlist */
}

/**
 * @type WatchlistSheetRoute
 * @description What the watchlist's sheet shows: the search, or one title (reached from the search or not).
 */
export type WatchlistSheetRoute =
    | { kind: 'closed' }
    | { kind: 'search' }
    | { kind: 'title'; title: TitleReference; fromSearch: boolean };

/**
 * @interface WatchlistSheetContextProps
 * @description What opens the watchlist's sheet from anywhere in the app.
 */
export interface WatchlistSheetContextProps {
    route: WatchlistSheetRoute; /*!< What it shows */
    openSearch: () => void; /*!< Opens the search */
    openTitle: (title: TitleReference, fromSearch?: boolean) => void; /*!< Opens one title */
    close: () => void; /*!< Closes it */
}

/**
 * @interface WatchlistSheetProviderProps
 * @description What the sheet's provider wraps.
 */
export interface WatchlistSheetProviderProps {
    children: ReactNode; /*!< The app */
}
