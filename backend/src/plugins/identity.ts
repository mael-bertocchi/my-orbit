import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { StatusCodes } from 'http-status-codes';
import type { Maybe, Perhaps } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { OneTimeStore } from 'src/shared/one-time-store';

/**
 * @constant OWNER_ID
 * @description The single account's stable identifier. Everything the API stores belongs to it.
 */
export const OWNER_ID = 'owner';

/**
 * @constant CHALLENGE_LIFETIME
 * @description How long a passkey has to sign the challenge it was handed.
 */
const CHALLENGE_LIFETIME = 5 * 60 * 1000;

/**
 * @constant CONNECTION_LIFETIME
 * @description How long the app has to trade the one-time code the portal hands it for a session.
 */
const CONNECTION_LIFETIME = 2 * 60 * 1000;

/**
 * @type ChallengePurpose
 * @description What a challenge was handed out for: signing in with a passkey, or creating one.
 */
export type ChallengePurpose = 'authentication' | 'registration';

/**
 * @interface RelyingParty
 * @description Who the passkeys belong to, in WebAuthn's words: the portal, at its own origin.
 */
export interface RelyingParty {
    id: string; /*!< The host name every passkey is bound to */
    name: string; /*!< The name shown when a passkey is created */
    origin: string; /*!< The portal's origin, the only page allowed to use them */
}

/**
 * @interface TokenPayload
 * @description The signed JWT payload. Refresh tokens additionally carry the id of their persisted session.
 */
export interface TokenPayload {
    id: string; /*!< The owner's identifier */
    type: 'access' | 'refresh'; /*!< Distinguishes an access token from a refresh token */
    sid?: string; /*!< Refresh-session id, present on refresh tokens only */
    cid?: string; /*!< The connection's id, present on the tokens of a client the owner authorized, such as Claude */
}

/**
 * @interface ClientConnection
 * @description A client the owner authorized, such as Claude, as its sessions remember it from one rotation to the next.
 */
export interface ClientConnection {
    id: string; /*!< The connection's id, kept by every session it rotates into */
    name: string; /*!< The client's name, as it registered */
    connectedAt: Date; /*!< When the owner authorized it */
}

/**
 * @interface IdentityTokens
 * @description A freshly minted access/refresh token pair.
 */
export interface IdentityTokens {
    accessToken: string; /*!< Short-lived bearer access token */
    refreshToken: string; /*!< Long-lived refresh token, backed by a persisted session */
}

/**
 * @interface IdentityService
 * @description Public interface exposed on the Fastify instance.
 */
export interface IdentityService {
    relyingParty: RelyingParty; /*!< Who the passkeys belong to */
    ownerName: string; /*!< The owner's name, as their passkeys and the portal show it */
    challenges: OneTimeStore<ChallengePurpose>; /*!< The challenges handed out and not signed yet */
    connections: OneTimeStore<string>; /*!< The app's one-time codes, each with the PKCE challenge it was asked with */
    isEnrollmentToken: (token: string) => boolean; /*!< Constant-time check of the optional enrollment token */
    issueTokens: (userId: string, clientName?: Perhaps<string>) => Promise<IdentityTokens>; /*!< Creates a refresh session, for a client the owner just authorized when it is named, and returns a token pair */
    rotateTokens: (refreshToken: string) => Promise<IdentityTokens>; /*!< Validates and rotates a refresh token into a new pair */
    revokeSession: (userId: string, refreshToken: string) => Promise<void>; /*!< Invalidates a single refresh session (logout) */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>; /*!< preHandler guarding a route with a bearer access token */
}

/**
 * @function constantTimeEquals
 * @description Compares two strings without leaking their length or content through timing. Both sides are hashed to a fixed-width digest first so the comparison is always over equal-length buffers.
 */
function constantTimeEquals(left: string, right: string): boolean {
    const leftDigest = createHash('sha256').update(left).digest();
    const rightDigest = createHash('sha256').update(right).digest();

    return timingSafeEqual(leftDigest, rightDigest);
}

/**
 * @function identityPlugin
 * @description Registers JWT signing/verification, persisted refresh sessions, and the route guard for the single account, opened with a
 * passkey. The portal's origin in the environment names who the passkeys belong to, and an optional enrollment token lets the first one
 * be created.
 */
export default fp(async function (fastify: FastifyInstance): Promise<void> {
    await fastify.register(fastifyJwt, {
        secret: fastify.variables.JWT_SECRET
    });

    /**
     * @function verifyRefresh
     * @description Verifies a refresh token's signature and shape, returning its owner and session ids.
     */
    const verifyRefresh = (token: string): { id: string; sid: string } => {
        let payload: TokenPayload;

        try {
            payload = fastify.jwt.verify<TokenPayload>(token);
        } catch {
            throw new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid or expired refresh token');
        }

        if (payload.type !== 'refresh' || payload.sid === undefined) {
            throw new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token');
        }

        return { id: payload.id, sid: payload.sid };
    };

    /**
     * @function openSession
     * @description Persists a new refresh session and returns the matching access/refresh token pair. A session of a
     * client's connection carries the connection on, and both its tokens name it.
     */
    const openSession = async (userId: string, connection: Maybe<ClientConnection>): Promise<IdentityTokens> => {
        const sid = randomUUID();
        const cid = connection?.id;
        const refreshToken = fastify.jwt.sign({ id: userId, type: 'refresh', sid, cid }, { expiresIn: fastify.variables.JWT_REFRESH_EXPIRY });
        const decoded = fastify.jwt.decode<{ exp: number }>(refreshToken);
        const expiresAt = decoded !== null ? new Date(decoded.exp * 1000) : new Date();
        const connectionData = connection === null ? {} : { connectionId: connection.id, clientName: connection.name, connectedAt: connection.connectedAt, lastUsedAt: new Date() };

        await fastify.prisma.identityRefreshSession.create({ data: { id: sid, userId, expiresAt, ...connectionData } });

        const accessToken = fastify.jwt.sign({ id: userId, type: 'access', cid }, { expiresIn: fastify.variables.JWT_ACCESS_EXPIRY });

        return { accessToken, refreshToken };
    };

    /**
     * @function issueTokens
     * @description Opens a session, starting a connection when a client the owner just authorized is named.
     */
    const issueTokens = async (userId: string, clientName?: Perhaps<string>): Promise<IdentityTokens> => {
        const connection = clientName === undefined ? null : { id: randomUUID(), name: clientName, connectedAt: new Date() };

        return await openSession(userId, connection);
    };

    /**
     * @function authenticate
     * @description Guards a route with a bearer access token: a valid, unexpired access token goes through, anything else is refused with 401
     */
    const authenticate = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
        try {
            await request.jwtVerify();
        } catch {
            throw new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid or expired access token');
        }

        if (request.user.type !== 'access') {
            throw new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid access token');
        }
    };

    const origin = fastify.variables.IDENTITY_ORIGIN;

    fastify.decorate('identity', {
        relyingParty: { id: new URL(origin).hostname, name: 'Orbit', origin },

        ownerName: fastify.variables.IDENTITY_OWNER_NAME,

        challenges: new OneTimeStore<ChallengePurpose>(CHALLENGE_LIFETIME),

        connections: new OneTimeStore<string>(CONNECTION_LIFETIME),

        /**
         * @method isEnrollmentToken
         * @description Constant-time check of the optional enrollment token; nothing passes while none is set
         */
        isEnrollmentToken(token: string): boolean {
            const expected = fastify.variables.IDENTITY_ENROLLMENT_TOKEN;

            return expected !== '' && constantTimeEquals(token, expected);
        },

        issueTokens,

        /**
         * @method rotateTokens
         * @description Validates a refresh token, forgets its session and opens a new one in its place
         */
        async rotateTokens(refreshToken: string): Promise<IdentityTokens> {
            const { id, sid } = verifyRefresh(refreshToken);

            const session = await fastify.prisma.identityRefreshSession.findUnique({ where: { id: sid } });

            if (session === null || session.userId !== id || session.expiresAt.getTime() <= Date.now()) {
                throw new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid or expired refresh token');
            }

            await fastify.prisma.identityRefreshSession.delete({ where: { id: sid } });

            const connection = session.connectionId === null || session.clientName === null ? null : { id: session.connectionId, name: session.clientName, connectedAt: session.connectedAt };

            return await openSession(id, connection);
        },

        /**
         * @method revokeSession
         * @description Forgets the session a refresh token belongs to, for a sign-out
         */
        async revokeSession(userId: string, refreshToken: string): Promise<void> {
            const { id, sid } = verifyRefresh(refreshToken);

            if (id !== userId) {
                throw new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token');
            }

            await fastify.prisma.identityRefreshSession.deleteMany({ where: { id: sid, userId } });
        },

        authenticate
    });
}, {
    name: 'identity',
    dependencies: ['environment', 'database']
});
