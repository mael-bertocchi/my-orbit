import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import { pkceChallenge } from 'src/modules/identity/identity-service';
import type { ConnectionSummary, OAuthClient } from 'src/modules/oauth/oauth-models';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { OneTimeStore } from 'src/shared/one-time-store';
import { z } from 'zod';

/**
 * @constant CODE_LIFETIME
 * @description How long a client has to trade the code it was sent back with.
 */
const CODE_LIFETIME = 5 * 60 * 1000;

/**
 * @constant LOOPBACK_HOSTS
 * @description The hosts a client may wait on over plain HTTP: the machine it runs on, as a command-line client does.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * @constant ClientPayloadSchema
 * @description Zod schema for what a client id carries: its addresses, its name, and when it registered.
 */
const ClientPayloadSchema = z.object({
    r: z.array(z.string()).min(1),
    n: z.string(),
    t: z.number()
});

/**
 * @interface PendingCode
 * @description What a code handed to a client stands for, until it is traded.
 */
interface PendingCode {
    clientId: string; /*!< The client it was handed to */
    redirectUri: string; /*!< Where it was sent */
    challenge: string; /*!< The client's PKCE challenge */
}

/**
 * @constant codes
 * @description The codes handed out and not traded yet.
 */
const codes = new OneTimeStore<PendingCode>(CODE_LIFETIME);

/**
 * @function signatureOf
 * @description The signature that vouches a client id was handed out by this server.
 *
 * @param {string} secret The server's secret.
 * @param {string} payload What the id carries, encoded.
 *
 * @returns {string} The signature.
 */
function signatureOf(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(`oauth-client.${payload}`).digest('base64url');
}

/**
 * @function isAllowedRedirect
 * @description Whether a client may be sent back to an address: over HTTPS, or over HTTP to the machine it runs on, and
 * never with a fragment.
 *
 * @param {string} uri The address.
 *
 * @returns {boolean} Whether it may.
 */
export function isAllowedRedirect(uri: string): boolean {
    let url: URL;

    try {
        url = new URL(uri);
    } catch {
        return false;
    }

    if (url.hash !== '' || url.username !== '' || url.password !== '') {
        return false;
    }

    return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
}

/**
 * @function registerClient
 * @description Hands a client its id. Nothing is stored: the id carries the client's addresses and name, signed with the
 * server's secret, so it outlives restarts and can't be forged. Anyone may register; only the owner's passkey authorizes.
 *
 * @param {string} secret The server's secret.
 * @param {string[]} redirectUris Where the client may be sent back.
 * @param {string} name Its name.
 * @param {number} issuedAt When it registers, in seconds.
 *
 * @returns {string} Its id.
 */
export function registerClient(secret: string, redirectUris: string[], name: string, issuedAt: number): string {
    const payload = Buffer.from(JSON.stringify({ r: redirectUris, n: name, t: issuedAt })).toString('base64url');

    return `${payload}.${signatureOf(secret, payload)}`;
}

/**
 * @function readClient
 * @description Reads a client from its id, checking the server handed it out.
 *
 * @param {string} secret The server's secret.
 * @param {string} clientId The id.
 *
 * @returns {Maybe<OAuthClient>} The client, or null when the id isn't one of the server's.
 */
export function readClient(secret: string, clientId: string): Maybe<OAuthClient> {
    const [payload, signature, ...rest] = clientId.split('.');

    if (payload === undefined || signature === undefined || rest.length > 0) {
        return null;
    }

    const expected = Buffer.from(signatureOf(secret, payload));
    const given = Buffer.from(signature);

    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        return null;
    }

    let decoded: unknown;

    try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }

    const parsed = ClientPayloadSchema.safeParse(decoded);

    return parsed.success ? { redirectUris: parsed.data.r, name: parsed.data.n, issuedAt: parsed.data.t } : null;
}

/**
 * @function openAuthorization
 * @description Hands out the code a client trades for tokens once the owner authorized it, bound to the client, the
 * address it waits on and its PKCE challenge.
 *
 * @param {PendingCode} pending What the code stands for.
 *
 * @returns {string} The code.
 */
export function openAuthorization(pending: PendingCode): string {
    const code = randomBytes(32).toString('base64url');

    codes.put(code, pending);

    return code;
}

/**
 * @function closeAuthorization
 * @description Takes a code back, once, checking it is traded by the client it was handed to, for the address it was sent
 * to, with the verifier matching its challenge.
 *
 * @param {string} code The code.
 * @param {string} clientId The client trading it.
 * @param {string} redirectUri The address it names.
 * @param {string} verifier Its PKCE verifier.
 *
 * @returns {boolean} Whether the code holds. A code that doesn't is spent all the same.
 */
export function closeAuthorization(code: string, clientId: string, redirectUri: string, verifier: string): boolean {
    const pending = codes.take(code);

    return pending !== undefined && pending.clientId === clientId && pending.redirectUri === redirectUri && pending.challenge === pkceChallenge(verifier);
}

/**
 * @function listConnections
 * @description The clients the owner authorized and that can still use their access, most recently used first. Each
 * connection has one live session at a time, the one its last rotation opened.
 *
 * @param {PrismaClient} prisma The database.
 * @param {string} userId The owner.
 *
 * @returns {Promise<ConnectionSummary[]>} The connections.
 */
export async function listConnections(prisma: PrismaClient, userId: string): Promise<ConnectionSummary[]> {
    const sessions = await prisma.identityRefreshSession.findMany({ where: { userId, connectionId: { not: null }, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' } });

    return sessions.flatMap((session) => (session.connectionId !== null && session.clientName !== null ? [{ id: session.connectionId, name: session.clientName, connectedAt: session.connectedAt, lastUsedAt: session.lastUsedAt ?? session.connectedAt }] : []));
}

/**
 * @function revokeConnection
 * @description Forgets a client's connection: its refresh token stops working at once, and so does its access token,
 * since the MCP endpoint checks the connection on every request.
 *
 * @param {PrismaClient} prisma The database.
 * @param {string} userId The owner.
 * @param {string} connectionId The connection.
 *
 * @returns {Promise<void>} Resolves when it is forgotten; rejects with 404 when there is none.
 */
export async function revokeConnection(prisma: PrismaClient, userId: string, connectionId: string): Promise<void> {
    const { count } = await prisma.identityRefreshSession.deleteMany({ where: { userId, connectionId } });

    if (count === 0) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown connection');
    }
}

/**
 * @function useConnection
 * @description Marks a client's connection as used now, when it still holds.
 *
 * @param {PrismaClient} prisma The database.
 * @param {string} connectionId The connection.
 *
 * @returns {Promise<boolean>} Whether it still holds: not revoked, and not lapsed.
 */
export async function useConnection(prisma: PrismaClient, connectionId: string): Promise<boolean> {
    const { count } = await prisma.identityRefreshSession.updateMany({ where: { connectionId, expiresAt: { gt: new Date() } }, data: { lastUsedAt: new Date() } });

    return count > 0;
}
