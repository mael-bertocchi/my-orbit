import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { verifySignIn } from 'src/modules/identity/identity-service';
import type { AuthorizationRequest, ClientRequest, ConnectionDeleteRequest, OAuthClient, RegistrationRequest } from 'src/modules/oauth/oauth-models';
import { TokenSchema } from 'src/modules/oauth/oauth-models';
import { closeAuthorization, isAllowedRedirect, listConnections, openAuthorization, readClient, registerClient, revokeConnection } from 'src/modules/oauth/oauth-service';
import type { IdentityTokens } from 'src/plugins/identity';
import { OWNER_ID } from 'src/plugins/identity';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { publicOrigin } from 'src/shared/public-origin';

/**
 * @constant SCOPE
 * @description The single scope a token carries: everything the owner can do.
 */
const SCOPE = 'my-orbit';

/**
 * @constant DEFAULT_CLIENT_NAME
 * @description The name shown for a client that gave none.
 */
const DEFAULT_CLIENT_NAME = 'MCP client';

/**
 * @function oauthError
 * @description Answers with an error in OAuth's own shape, which OAuth clients read.
 *
 * @param {FastifyReply} reply The reply.
 * @param {string} error The error's code, such as `invalid_grant`.
 * @param {string} description What went wrong.
 */
function oauthError(reply: FastifyReply, error: string, description: string): void {
    reply.status(StatusCodes.BAD_REQUEST).header('Cache-Control', 'no-store').send({ error, error_description: description });
}

/**
 * @function clientFor
 * @description The client an id names, when the address it waits on is one of its own.
 *
 * @param {FastifyRequest} request The request.
 * @param {string} clientId The client's id.
 * @param {string} redirectUri The address.
 *
 * @returns {Maybe<OAuthClient>} The client, or null.
 */
function clientFor(request: FastifyRequest, clientId: string, redirectUri: string): Maybe<OAuthClient> {
    const client = readClient(request.server.variables.JWT_SECRET, clientId);

    return client !== null && client.redirectUris.includes(redirectUri) ? client : null;
}

/**
 * @function resourceMetadata
 * @description Tells an MCP client which server authorizes access to the MCP endpoint (RFC 9728).
 *
 * @returns {void} Returns once the metadata is sent.
 */
function resourceMetadata(request: FastifyRequest, reply: FastifyReply): void {
    const origin = publicOrigin(request);

    reply.status(StatusCodes.OK).send({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'], scopes_supported: [SCOPE], resource_name: 'Orbit' });
}

/**
 * @function serverMetadata
 * @description Tells an OAuth client where to register, where the owner authorizes it (the portal, with the passkey) and
 * where to get its tokens (RFC 8414).
 *
 * @returns {void} Returns once the metadata is sent.
 */
function serverMetadata(request: FastifyRequest, reply: FastifyReply): void {
    const origin = publicOrigin(request);

    reply.status(StatusCodes.OK).send({
        issuer: origin,
        authorization_endpoint: `${request.server.variables.IDENTITY_ORIGIN}/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        scopes_supported: [SCOPE],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none']
    });
}

/**
 * @function register
 * @description Registers a client (RFC 7591), with the addresses it waits on.
 *
 * @returns {void} Returns once its id is sent.
 */
function register(request: FastifyRequest<RegistrationRequest>, reply: FastifyReply): void {
    const redirectUris = request.body.redirect_uris;

    if (!redirectUris.every(isAllowedRedirect)) {
        reply.status(StatusCodes.BAD_REQUEST).send({ error: 'invalid_redirect_uri', error_description: 'Redirect URIs must use HTTPS, or HTTP on the loopback address' });

        return;
    }

    const name = request.body.client_name || DEFAULT_CLIENT_NAME;
    const issuedAt = Math.floor(Date.now() / 1000);

    reply.status(StatusCodes.CREATED).send({
        client_id: registerClient(request.server.variables.JWT_SECRET, redirectUris, name, issuedAt),
        client_id_issued_at: issuedAt,
        client_name: name,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
    });
}

/**
 * @function client
 * @description Tells the portal who a client is, so the owner sees what they authorize. A client unknown to the server,
 * or an address that isn't its own, is refused.
 *
 * @returns {void} Returns once the client is described.
 */
function client(request: FastifyRequest<ClientRequest>, reply: FastifyReply): void {
    const found = clientFor(request, request.query.clientId, request.query.redirectUri);

    if (found === null) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Unknown client or redirect URI');
    }

    reply.status(StatusCodes.OK).send({ data: { name: found.name, redirectHost: new URL(request.query.redirectUri).host } });
}

/**
 * @function authorize
 * @description Checks the passkey's signed answer, made on the portal's authorization page, and returns the address to
 * send the client back to, with its code and state.
 *
 * @returns {Promise<void>} Resolves when the address is sent.
 */
async function authorize(request: FastifyRequest<AuthorizationRequest>, reply: FastifyReply): Promise<void> {
    const { identity, prisma } = request.server;
    const { clientId, redirectUri, codeChallenge, state } = request.body;

    if (clientFor(request, clientId, redirectUri) === null) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Unknown client or redirect URI');
    }

    await verifySignIn(prisma, identity, request.body.response);

    const redirect = new URL(redirectUri);

    redirect.searchParams.set('code', openAuthorization({ clientId, redirectUri, challenge: codeChallenge }));
    redirect.searchParams.set('iss', publicOrigin(request));

    if (state !== undefined) {
        redirect.searchParams.set('state', state);
    }

    reply.status(StatusCodes.OK).send({ data: { redirectUrl: redirect.toString() } });
}

/**
 * @function tokenResponse
 * @description Tokens in OAuth's shape, with how long the access token lasts.
 *
 * @param {FastifyRequest} request The request.
 * @param {IdentityTokens} tokens The tokens.
 *
 * @returns {Record<string, unknown>} The answer.
 */
function tokenResponse(request: FastifyRequest, tokens: IdentityTokens): Record<string, unknown> {
    const decoded = request.server.jwt.decode<{ exp: number }>(tokens.accessToken);
    const expiresIn = decoded === null ? undefined : Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));

    return { access_token: tokens.accessToken, token_type: 'Bearer', expires_in: expiresIn, refresh_token: tokens.refreshToken, scope: SCOPE };
}

/**
 * @function token
 * @description Trades a code with its PKCE verifier, or a refresh token, for a fresh access/refresh token pair.
 *
 * @returns {Promise<void>} Resolves when the tokens, or OAuth's error, are sent.
 */
async function token(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = TokenSchema.safeParse(request.body);

    if (!parsed.success) {
        oauthError(reply, 'invalid_request', 'Missing or malformed parameters');

        return;
    }

    const { identity } = request.server;
    const grant = parsed.data;

    if (grant.grant_type === 'authorization_code') {
        const authorized = readClient(request.server.variables.JWT_SECRET, grant.client_id);

        if (authorized === null || !closeAuthorization(grant.code, grant.client_id, grant.redirect_uri, grant.code_verifier)) {
            oauthError(reply, 'invalid_grant', 'Invalid or expired code');

            return;
        }

        reply.status(StatusCodes.OK).header('Cache-Control', 'no-store').send(tokenResponse(request, await identity.issueTokens(OWNER_ID, authorized.name)));

        return;
    }

    let tokens: IdentityTokens;

    try {
        tokens = await identity.rotateTokens(grant.refresh_token);
    } catch (error: unknown) {
        if (error instanceof RequestError) {
            oauthError(reply, 'invalid_grant', 'Invalid or expired refresh token');

            return;
        }

        throw error;
    }

    reply.status(StatusCodes.OK).header('Cache-Control', 'no-store').send(tokenResponse(request, tokens));
}

/**
 * @function connections
 * @description Lists the clients the owner authorized and that still hold their access.
 *
 * @returns {Promise<void>} Resolves when the list is sent.
 */
async function connections(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(StatusCodes.OK).send({ data: await listConnections(request.server.prisma, request.user.id) });
}

/**
 * @function deleteConnection
 * @description Revokes a client's access.
 *
 * @returns {Promise<void>} Resolves when it is revoked.
 */
async function deleteConnection(request: FastifyRequest<ConnectionDeleteRequest>, reply: FastifyReply): Promise<void> {
    await revokeConnection(request.server.prisma, request.user.id, request.params.id);

    reply.status(StatusCodes.OK).send({ data: { message: 'Connection revoked' } });
}

export default {
    resourceMetadata,
    serverMetadata,
    register,
    client,
    authorize,
    token,
    connections,
    deleteConnection
};
