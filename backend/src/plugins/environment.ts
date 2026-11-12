import fastifyEnv from '@fastify/env';
import { Type, type Static } from '@sinclair/typebox';
import addFormats from 'ajv-formats';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * @constant variables
 * @description JSON Schema definition for required environment variables, used for validation and type inference
 */
export const variables = Type.Object({
    NODE_ENV: Type.Union([Type.Literal('development'), Type.Literal('production'), Type.Literal('test')]),
    PORT: Type.Number(),
    DATABASE_URL: Type.String({ minLength: 1 }),
    IDENTITY_ORIGIN: Type.String({ pattern: '^https?://[^/]+$' }),
    IDENTITY_OWNER_NAME: Type.String({ minLength: 1, default: 'Owner' }),
    IDENTITY_ENROLLMENT_TOKEN: Type.String({ pattern: '^(.{32,})?$', default: '' }),
    CORS_ORIGIN: Type.String({ default: '' }),
    JWT_SECRET: Type.String({ minLength: 32 }),
    JWT_ACCESS_EXPIRY: Type.String({ minLength: 1 }),
    JWT_REFRESH_EXPIRY: Type.String({ minLength: 1 }),
    WATCHLIST_TMDB_TOKEN: Type.String({ default: '' }),
    WATCHLIST_TMDB_URL: Type.String({ pattern: '^https?://[^ ]+[^/]$', default: 'https://api.themoviedb.org/3' }),
    BUDGET_PLACES_URL: Type.String({ pattern: '^https?://[^ ]+[^/]$', default: 'https://api.geoapify.com/v1/geocode' }),
    GEOAPIFY_API_KEY: Type.String({ default: '' })
});

/**
 * @type Variables
 * @description TypeScript type representing the shape of the environment variables, derived from schema
 */
export type Variables = Static<typeof variables>;

/**
 * @function environmentPlugin
 * @description Registers the environment variables plugin
 */
export default fp(async function (fastify: FastifyInstance): Promise<void> {
    await fastify.register(fastifyEnv, {
        confKey: 'variables',
        ajv: {
            /**
             * @method customOptions
             * @description Teaches the validator the standard string formats
             */
            customOptions(ajvInstance) {
                addFormats(ajvInstance);
                return ajvInstance;
            }
        },
        schema: variables,
        dotenv: true
    });
}, {
    name: 'environment'
});
