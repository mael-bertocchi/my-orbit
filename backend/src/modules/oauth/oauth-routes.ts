import type { FastifyInstance } from 'fastify';
import oauthController from 'src/modules/oauth/oauth-controller';
import type { AuthorizationRequest, ClientRequest, ConnectionDeleteRequest, RegistrationRequest } from 'src/modules/oauth/oauth-models';
import { AuthorizationSchema, ClientQuerySchema, ConnectionParamsSchema, RegistrationSchema } from 'src/modules/oauth/oauth-models';

/**
 * @constant OAUTH_LIMIT
 * @description How often an address may register a client, authorize one or ask for tokens, per minute.
 */
const OAUTH_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

/**
 * @function parseForm
 * @description Reads a form-encoded body, as OAuth clients send to the token endpoint.
 *
 * @param {string} body The body.
 *
 * @returns {Record<string, string>} Its fields.
 */
function parseForm(body: string): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(body));
}

/**
 * @function oauthRoutes
 * @description Defines the OAuth 2.1 server MCP clients such as Claude go through: the metadata telling them how, their
 * registration, the portal's authorization with the passkey, the tokens, and the list of clients the owner authorized.
 */
export default function (fastify: FastifyInstance): void {
    fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
        done(null, parseForm(typeof body !== 'string' ? body.toString('utf8') : body));
    });

    fastify.get('/.well-known/oauth-protected-resource', oauthController.resourceMetadata);

    fastify.get('/.well-known/oauth-protected-resource/mcp', oauthController.resourceMetadata);

    fastify.get('/.well-known/oauth-authorization-server', oauthController.serverMetadata);

    fastify.post<RegistrationRequest>('/oauth/register', {
        config: OAUTH_LIMIT,
        schema: {
            body: RegistrationSchema
        }
    }, oauthController.register);

    fastify.post('/oauth/token', {
        config: OAUTH_LIMIT
    }, oauthController.token);

    fastify.get<ClientRequest>('/v1/oauth/client', {
        schema: {
            querystring: ClientQuerySchema
        }
    }, oauthController.client);

    fastify.post<AuthorizationRequest>('/v1/oauth/authorize', {
        config: OAUTH_LIMIT,
        schema: {
            body: AuthorizationSchema
        }
    }, oauthController.authorize);

    fastify.get('/v1/oauth/connections', {
        preHandler: [fastify.identity.authenticate]
    }, oauthController.connections);

    fastify.delete<ConnectionDeleteRequest>('/v1/oauth/connections/:id', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            params: ConnectionParamsSchema
        }
    }, oauthController.deleteConnection);
}
