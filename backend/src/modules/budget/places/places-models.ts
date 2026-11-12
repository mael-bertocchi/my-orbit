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
 * @constant PhotonPropertiesSchema
 * @description Zod schema for what Photon says of a place: its name, its kind, and the city, region and country it lies in.
 */
export const PhotonPropertiesSchema = z.object({
    name: z.string().optional(),
    type: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional()
});

/**
 * @constant PhotonPayloadSchema
 * @description Zod schema for Photon's answer, a GeoJSON collection of places, read loosely: each place is checked on its own.
 */
export const PhotonPayloadSchema = z.object({
    features: z.array(z.object({ properties: z.unknown() }))
});

/**
 * @interface Place
 * @description A city, as the operation editor suggests it.
 */
export interface Place {
    name: string; /*!< The city's name, what the editor fills in */
    detail: string; /*!< Its region and country, to tell two cities of the same name apart, empty when unknown */
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
 * @type PhotonProperties
 * @description Inferred type for what Photon says of a place.
 */
export type PhotonProperties = z.infer<typeof PhotonPropertiesSchema>;
