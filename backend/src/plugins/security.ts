import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import type { errorResponseBuilderContext } from '@fastify/rate-limit';
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { StatusCodes } from 'http-status-codes';
import { firstHeader } from 'src/shared/public-origin';

/**
 * @constant PREFLIGHT_CACHE
 * @description How long, in seconds, a browser may reuse a preflight answer before asking again.
 */
const PREFLIGHT_CACHE = 10 * 60;

/**
 * @function allowedOrigins
 * @description The web origins allowed to call the API from a browser, read from the comma-separated `CORS_ORIGIN`.
 *
 * @param {string} value The variable's value.
 *
 * @returns {string[]} The origins, none when the variable is empty.
 */
export function allowedOrigins(value: string): string[] {
    return value.split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter((origin) => origin !== '');
}

/**
 * @function securityPlugin
 * @description Registers security-related plugins such as Helmet, CORS and rate limiting. CORS only opens the API to the
 * origins listed in `CORS_ORIGIN` (the portal's) and to nothing at all when it is empty; the app isn't a browser and
 * needs none. It is registered before the rate limit so a refused request still reaches the page readable.
 */
export default fp(async function (fastify: FastifyInstance): Promise<void> {
    await fastify.register(fastifyHelmet);

    const origins = allowedOrigins(fastify.variables.CORS_ORIGIN);

    if (origins.length > 0) {
        await fastify.register(fastifyCors, {
            origin: origins,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            allowedHeaders: ['Authorization', 'Content-Type'],
            maxAge: PREFLIGHT_CACHE
        });
    }

    await fastify.register(fastifyRateLimit, {
        timeWindow: '1 minute',
        max: 120,

        /**
         * @function keyGenerator
         * @description Counts each visitor apart by the address Cloudflare saw. The server only sees the proxy in front of
         * it, so its own address would put every visitor in one count, and anyone could use up the owner's sign-in tries.
         */
        keyGenerator: (request: FastifyRequest): string => firstHeader(request, 'cf-connecting-ip') ?? request.ip,

        /**
         * @function errorResponseBuilder
         * @description Builds the response payload when the rate limit is exceeded
         */
        errorResponseBuilder: (request: FastifyRequest, context: errorResponseBuilderContext) => ({
            message: `Rate limit exceeded. Try again in ${context.after}`,
            statusCode: StatusCodes.TOO_MANY_REQUESTS
        })
    });
}, {
    name: 'security',
    dependencies: ['environment']
});
