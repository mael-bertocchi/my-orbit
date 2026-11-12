import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import categoriesRoutes from 'src/modules/budget/categories/categories-routes';
import historyRoutes from 'src/modules/budget/history/history-routes';
import operationsRoutes from 'src/modules/budget/operations/operations-routes';
import placesRoutes from 'src/modules/budget/places/places-routes';
import ratesRoutes from 'src/modules/budget/rates/rates-routes';
import recurringRoutes from 'src/modules/budget/recurring/recurring-routes';
import settingsRoutes from 'src/modules/budget/settings/settings-routes';
import stateRoutes from 'src/modules/budget/state/state-routes';
import healthRoutes from 'src/modules/health/health-routes';
import identityRoutes from 'src/modules/identity/identity-routes';
import mcpRoutes from 'src/modules/mcp/mcp-routes';
import oauthRoutes from 'src/modules/oauth/oauth-routes';
import catalogRoutes from 'src/modules/watchlist/catalog/catalog-routes';
import entriesRoutes from 'src/modules/watchlist/entries/entries-routes';
import databasePlugin from 'src/plugins/database';
import environmentPlugin from 'src/plugins/environment';
import identityPlugin from 'src/plugins/identity';
import securityPlugin from 'src/plugins/security';
import type { RequestErrorResponse } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { ZodError } from 'zod';

/**
 * @constant fastify
 * @description Main Fastify application instance
 */
const fastify: FastifyInstance = Fastify({
    keepAliveTimeout: 5 * 1000,
    logger: {
        transport: {
            target: 'pino-pretty'
        }
    }
}).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

/**
 * @function handleGlobalError
 * @description Handles all unhandled route and runtime errors. A failure the server raises on purpose (`RequestError`)
 * keeps its message and data even as a server error, so the client can tell why; any other one is masked in production.
 */
function handleGlobalError(err: Error, request: FastifyRequest, reply: FastifyReply): FastifyReply {
    let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    const response: RequestErrorResponse = {
        message: 'Server Error',
        data: undefined
    };

    if (err instanceof RequestError) {
        statusCode = err.code;
        response.message = err.message;
        response.data = err.data;
    } else if (err instanceof ZodError) {
        statusCode = StatusCodes.BAD_REQUEST;
        response.message = 'Validation failed';
        response.data = { issues: err.issues };
    } else if (hasZodFastifySchemaValidationErrors(err)) {
        statusCode = StatusCodes.BAD_REQUEST;
        response.message = 'Validation failed';
        response.data = { issues: err.validation };
    } else if ('validation' in err) {
        statusCode = StatusCodes.BAD_REQUEST;
        response.message = 'Validation Error';
        response.data = err.validation;
    } else if ('statusCode' in err) {
        const errorStatusCode = err.statusCode;

        if (typeof errorStatusCode === 'number') {
            statusCode = errorStatusCode;
        }

        response.message = err.message;
    }

    if (statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
        request.log.error({ error: { message: err.message, stack: err.stack, type: err.name }, path: request.url }, 'Server Error');

        if (!(err instanceof RequestError)) {
            if (process.env.NODE_ENV === 'production') {
                response.message = 'Server Error';
            } else {
                response.data = err.stack;
            }
        }
    } else {
        request.log.warn({ message: err.message, code: statusCode, path: request.url }, 'Client Error');
    }

    request.log.info({ response, statusCode }, 'Response Sent');

    return reply.status(statusCode).send(response);
}

/**
 * @function handleNotFound
 * @description Handles requests to unknown endpoints
 */
function handleNotFound(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.status(StatusCodes.NOT_FOUND).send({
        message: "The resource you are looking for doesn't exist",
        data: {
            method: request.method,
            path: request.url
        }
    });
}

/**
 * @function startServer
 * @description Registers plugins, routes, and starts the HTTP server
 */
async function startServer(): Promise<void> {
    await fastify.register(environmentPlugin);
    await fastify.register(securityPlugin);
    await fastify.register(databasePlugin);
    await fastify.register(identityPlugin);

    fastify.setErrorHandler(handleGlobalError);

    await fastify.register(healthRoutes, { prefix: '/v1/health' });
    await fastify.register(identityRoutes, { prefix: '/v1/identity' });
    await fastify.register(ratesRoutes, { prefix: '/v1/budget/rates' });
    await fastify.register(stateRoutes, { prefix: '/v1/budget/state' });
    await fastify.register(operationsRoutes, { prefix: '/v1/budget/operations' });
    await fastify.register(recurringRoutes, { prefix: '/v1/budget/recurring' });
    await fastify.register(categoriesRoutes, { prefix: '/v1/budget/categories' });
    await fastify.register(settingsRoutes, { prefix: '/v1/budget/settings' });
    await fastify.register(historyRoutes, { prefix: '/v1/budget/history' });
    await fastify.register(placesRoutes, { prefix: '/v1/budget/places' });
    await fastify.register(catalogRoutes, { prefix: '/v1/watchlist/catalog' });
    await fastify.register(entriesRoutes, { prefix: '/v1/watchlist/entries' });
    await fastify.register(oauthRoutes);
    await fastify.register(mcpRoutes, { prefix: '/mcp' });

    fastify.setNotFoundHandler(handleNotFound);

    try {
        await fastify.listen({
            port: fastify.variables.PORT,
            host: '0.0.0.0'
        });
    } catch (err: unknown) {
        fastify.log.error(err);
        process.exit(1);
    }
}

await startServer();
