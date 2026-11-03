import type { RequestGenericInterface } from 'fastify';
import { z } from 'zod';

/**
 * @constant WATCH_REGION
 * @description The country whose streaming, rental and purchase offers are shown. Offers differ from one country to the
 * next, and the owner watches in France.
 */
export const WATCH_REGION = 'FR';

/**
 * @constant CATALOG_NOT_CONFIGURED
 * @description Why the catalog routes answer 503 when the server has no token for TMDB, in the error's `data.reason`.
 */
export const CATALOG_NOT_CONFIGURED = 'catalog-not-configured';

/**
 * @constant CATALOG_REFUSED
 * @description Why the catalog routes answer 503 when TMDB refuses the server's token, in the error's `data.reason`.
 */
export const CATALOG_REFUSED = 'catalog-refused';

/**
 * @constant MediaTypeSchema
 * @description Zod schema for what a title is: a film, or a series as a whole.
 */
export const MediaTypeSchema = z.enum(['movie', 'tv']);

/**
 * @constant CatalogLanguageSchema
 * @description Zod schema for the portal's languages, in which the catalog writes titles, summaries and genres.
 */
export const CatalogLanguageSchema = z.enum(['en', 'fr']);

/**
 * @constant TMDB_LANGUAGES
 * @description How the catalog names each of the portal's languages.
 */
export const TMDB_LANGUAGES: Record<CatalogLanguage, string> = {
    en: 'en-US',
    fr: 'fr-FR'
};

/**
 * @constant TmdbDateSchema
 * @description Zod schema for a date as the catalog writes it: YYYY-MM-DD, or an empty string when it is unknown.
 */
const TmdbDateSchema = z.string().optional().transform((value) => (value === undefined || value === '' ? null : value));

/**
 * @constant TmdbGenreSchema
 * @description Zod schema for a genre as the catalog names it.
 */
export const TmdbGenreSchema = z.object({
    id: z.number().int(),
    name: z.string()
});

/**
 * @constant TmdbSearchResultSchema
 * @description Zod schema for a film or series found by a search. The search also finds people, which don't match.
 */
export const TmdbSearchResultSchema = z.discriminatedUnion('media_type', [
    z.object({
        media_type: z.literal('movie'),
        id: z.number().int(),
        title: z.string(),
        original_title: z.string(),
        release_date: TmdbDateSchema,
        poster_path: z.string().nullish(),
        overview: z.string().default('')
    }),
    z.object({
        media_type: z.literal('tv'),
        id: z.number().int(),
        name: z.string(),
        original_name: z.string(),
        first_air_date: TmdbDateSchema,
        poster_path: z.string().nullish(),
        overview: z.string().default('')
    })
]);

/**
 * @constant TmdbSearchPayloadSchema
 * @description Zod schema for a page of search results, read loosely: each result is checked on its own.
 */
export const TmdbSearchPayloadSchema = z.object({
    results: z.array(z.unknown())
});

/**
 * @constant TmdbMovieSchema
 * @description Zod schema for a film's details.
 */
export const TmdbMovieSchema = z.object({
    id: z.number().int(),
    title: z.string(),
    original_title: z.string(),
    release_date: TmdbDateSchema,
    poster_path: z.string().nullish(),
    overview: z.string().default(''),
    runtime: z.number().int().nullish(),
    genres: z.array(TmdbGenreSchema).default([]),
    belongs_to_collection: z.object({ id: z.number().int(), name: z.string() }).nullish()
});

/**
 * @constant TmdbShowSchema
 * @description Zod schema for a series' details.
 */
export const TmdbShowSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    original_name: z.string(),
    first_air_date: TmdbDateSchema,
    poster_path: z.string().nullish(),
    overview: z.string().default(''),
    number_of_seasons: z.number().int().nullish(),
    genres: z.array(TmdbGenreSchema).default([])
});

/**
 * @constant TmdbProviderSchema
 * @description Zod schema for a streaming service, a store or a rental shop offering a title.
 */
export const TmdbProviderSchema = z.object({
    provider_id: z.number().int(),
    provider_name: z.string(),
    logo_path: z.string().nullish(),
    display_priority: z.number().default(0)
});

/**
 * @constant TmdbProvidersPayloadSchema
 * @description Zod schema for where a title can be watched, country by country. JustWatch provides this data.
 */
export const TmdbProvidersPayloadSchema = z.object({
    results: z.record(z.string(), z.object({
        link: z.string().optional(),
        flatrate: z.array(TmdbProviderSchema).default([]),
        free: z.array(TmdbProviderSchema).default([]),
        ads: z.array(TmdbProviderSchema).default([]),
        rent: z.array(TmdbProviderSchema).default([]),
        buy: z.array(TmdbProviderSchema).default([])
    }))
});

/**
 * @constant TmdbCollectionSchema
 * @description Zod schema for a saga: the films that follow one another.
 */
export const TmdbCollectionSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    parts: z.array(z.object({
        id: z.number().int(),
        title: z.string(),
        original_title: z.string(),
        release_date: TmdbDateSchema,
        poster_path: z.string().nullish(),
        overview: z.string().default('')
    }))
});

/**
 * @constant TmdbGenreListSchema
 * @description Zod schema for every genre of films or of series.
 */
export const TmdbGenreListSchema = z.object({
    genres: z.array(TmdbGenreSchema)
});

/**
 * @constant CatalogTitleSchema
 * @description Zod schema for a title as the portal shows it in a list.
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
 * @constant CatalogProviderSchema
 * @description Zod schema for a service offering a title.
 */
export const CatalogProviderSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    logoPath: z.string().nullable()
});

/**
 * @constant CatalogOffersSchema
 * @description Zod schema for where a title can be watched in the watch region, by kind of offer.
 */
export const CatalogOffersSchema = z.object({
    link: z.string().nullable(),
    subscription: z.array(CatalogProviderSchema),
    free: z.array(CatalogProviderSchema),
    rent: z.array(CatalogProviderSchema),
    buy: z.array(CatalogProviderSchema)
});

/**
 * @constant CatalogDetailsSchema
 * @description Zod schema for everything the portal shows about one title.
 */
export const CatalogDetailsSchema = CatalogTitleSchema.extend({
    genres: z.array(TmdbGenreSchema),
    runtime: z.number().int().nullable(),
    seasons: z.number().int().nullable(),
    collection: TmdbGenreSchema.nullable(),
    offers: CatalogOffersSchema
});

/**
 * @constant CatalogCollectionSchema
 * @description Zod schema for a saga, its films in the order they came out.
 */
export const CatalogCollectionSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    parts: z.array(CatalogTitleSchema)
});

/**
 * @constant CatalogLanguageQuerySchema
 * @description Zod schema for the language a catalog answer is written in.
 */
export const CatalogLanguageQuerySchema = z.object({
    language: CatalogLanguageSchema.default('fr')
});

/**
 * @constant CatalogSearchQuerySchema
 * @description Zod schema for a search of the catalog.
 */
export const CatalogSearchQuerySchema = CatalogLanguageQuerySchema.extend({
    query: z.string().trim().min(1).max(100)
});

/**
 * @constant CatalogTitleParamsSchema
 * @description Zod schema for the title a details lookup asks about.
 */
export const CatalogTitleParamsSchema = z.object({
    mediaType: MediaTypeSchema,
    tmdbId: z.coerce.number().int().positive()
});

/**
 * @constant CatalogCollectionParamsSchema
 * @description Zod schema for the saga a lookup asks about.
 */
export const CatalogCollectionParamsSchema = z.object({
    collectionId: z.coerce.number().int().positive()
});

/**
 * @interface CatalogSearchRequest
 * @description Fastify request generic for a search.
 *
 * @extends RequestGenericInterface
 */
export interface CatalogSearchRequest extends RequestGenericInterface {
    Querystring: z.infer<typeof CatalogSearchQuerySchema>; /*!< What to look for, and in which language */
}

/**
 * @interface CatalogLanguageRequest
 * @description Fastify request generic for an answer that only depends on the language.
 *
 * @extends RequestGenericInterface
 */
export interface CatalogLanguageRequest extends RequestGenericInterface {
    Querystring: z.infer<typeof CatalogLanguageQuerySchema>; /*!< The language to write in */
}

/**
 * @interface CatalogTitleRequest
 * @description Fastify request generic for a title's details.
 *
 * @extends RequestGenericInterface
 */
export interface CatalogTitleRequest extends RequestGenericInterface {
    Params: z.infer<typeof CatalogTitleParamsSchema>; /*!< The title */
    Querystring: z.infer<typeof CatalogLanguageQuerySchema>; /*!< The language to write in */
}

/**
 * @interface CatalogCollectionRequest
 * @description Fastify request generic for a saga.
 *
 * @extends RequestGenericInterface
 */
export interface CatalogCollectionRequest extends RequestGenericInterface {
    Params: z.infer<typeof CatalogCollectionParamsSchema>; /*!< The saga */
    Querystring: z.infer<typeof CatalogLanguageQuerySchema>; /*!< The language to write in */
}

/**
 * @type MediaType
 * @description A film, or a series.
 */
export type MediaType = z.infer<typeof MediaTypeSchema>;

/**
 * @type CatalogLanguage
 * @description One of the portal's languages.
 */
export type CatalogLanguage = z.infer<typeof CatalogLanguageSchema>;

/**
 * @type CatalogGenre
 * @description A genre, named in one language.
 */
export type CatalogGenre = z.infer<typeof TmdbGenreSchema>;

/**
 * @type CatalogTitle
 * @description A title as the portal shows it in a list.
 */
export type CatalogTitle = z.infer<typeof CatalogTitleSchema>;

/**
 * @type CatalogProvider
 * @description A service offering a title.
 */
export type CatalogProvider = z.infer<typeof CatalogProviderSchema>;

/**
 * @type CatalogOffers
 * @description Where a title can be watched in the watch region.
 */
export type CatalogOffers = z.infer<typeof CatalogOffersSchema>;

/**
 * @type CatalogDetails
 * @description Everything the portal shows about one title.
 */
export type CatalogDetails = z.infer<typeof CatalogDetailsSchema>;

/**
 * @type CatalogCollection
 * @description A saga.
 */
export type CatalogCollection = z.infer<typeof CatalogCollectionSchema>;

/**
 * @type TmdbProvider
 * @description A service offering a title, as the catalog describes it.
 */
export type TmdbProvider = z.infer<typeof TmdbProviderSchema>;
