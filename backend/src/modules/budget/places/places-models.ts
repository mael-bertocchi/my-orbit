import type { RequestGenericInterface } from 'fastify';
import { z } from 'zod';

/**
 * @constant PlacesLanguageSchema
 * @description Zod schema for the portal's languages, in which the cities are named.
 */
export const PlacesLanguageSchema = z.enum(['en', 'fr']);

/**
 * @constant CoordinateSchema
 * @description Zod schema for a latitude or a longitude, rounded to two decimals, about a kilometre: enough to tell the
 * city, and no more of where the owner stands leaves the server.
 */
const CoordinateSchema = z.coerce.number().finite().transform((value) => Math.round(value * 100) / 100);

/**
 * @constant PlacesSearchQuerySchema
 * @description Zod schema for a search of the cities whose name starts with what is typed.
 */
export const PlacesSearchQuerySchema = z.object({
    query: z.string().trim().min(2).max(100),
    language: PlacesLanguageSchema.default('fr')
});

/**
 * @constant PlacesLocateQuerySchema
 * @description Zod schema for the position whose city is looked up.
 */
export const PlacesLocateQuerySchema = z.object({
    latitude: CoordinateSchema.pipe(z.number().min(-90).max(90)),
    longitude: CoordinateSchema.pipe(z.number().min(-180).max(180)),
    language: PlacesLanguageSchema.default('fr')
});

/**
 * @constant GeoapifyResultSchema
 * @description Zod schema for what Geoapify says of a city: its OpenStreetMap identity when it gives it, its position,
 * its name, its kind, and the region and country it lies in.
 */
export const GeoapifyResultSchema = z.object({
    name: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    result_type: z.string().optional(),
    place_id: z.string().optional(),
    lat: z.number().finite(),
    lon: z.number().finite(),
    datasource: z.object({ raw: z.object({ osm_type: z.string().optional(), osm_id: z.number().int().optional() }).optional() }).optional()
});

/**
 * @constant GeoapifyPayloadSchema
 * @description Zod schema for Geoapify's answer, a list of places, read loosely: each place is checked on its own.
 */
export const GeoapifyPayloadSchema = z.object({
    results: z.array(z.unknown())
});

/**
 * @constant PlaceIdSchema
 * @description Zod schema for a city's identity: its OpenStreetMap kind (N, W or R) and number, such as `R71525`, or,
 * when the geocoder doesn't give it, G and its position to five decimals, such as `G37.56667,126.97806`.
 */
export const PlaceIdSchema = z.string().regex(/^([NWR]\d{1,15}|G-?\d{1,3}\.\d{5},-?\d{1,3}\.\d{5})$/);

/**
 * @constant PlaceReferenceSchema
 * @description Zod schema for the city an operation took place in: its identity and its name in each of the portal's
 * languages, so the apps show it in the one picked.
 */
export const PlaceReferenceSchema = z.object({
    id: PlaceIdSchema,
    nameEn: z.string(),
    nameFr: z.string()
});

/**
 * @interface PlaceReference
 * @description The city an operation took place in, named in each of the portal's languages.
 */
export interface PlaceReference {
    id: string; /*!< Its identity, such as `R71525` */
    nameEn: string; /*!< Its name in English */
    nameFr: string; /*!< Its name in French */
}

/**
 * @interface Place
 * @description A city, as the operation editor suggests it.
 */
export interface Place extends PlaceReference {
    detail: string; /*!< Its region and country in the language asked, to tell two cities of the same name apart, empty when unknown */
}

/**
 * @interface PlacesSearchRequest
 * @description Fastify request generic for a search of the cities.
 *
 * @extends RequestGenericInterface
 */
export interface PlacesSearchRequest extends RequestGenericInterface {
    Querystring: z.infer<typeof PlacesSearchQuerySchema>; /*!< What is typed, and in which language */
}

/**
 * @interface PlacesLocateRequest
 * @description Fastify request generic for the city at a position.
 *
 * @extends RequestGenericInterface
 */
export interface PlacesLocateRequest extends RequestGenericInterface {
    Querystring: z.infer<typeof PlacesLocateQuerySchema>; /*!< The position, and the language */
}

/**
 * @type PlacesLanguage
 * @description Inferred type for the portal's languages.
 */
export type PlacesLanguage = z.infer<typeof PlacesLanguageSchema>;

/**
 * @type GeoapifyResult
 * @description Inferred type for what Geoapify says of a city.
 */
export type GeoapifyResult = z.infer<typeof GeoapifyResultSchema>;
