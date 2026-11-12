import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import identityRoutes from 'src/modules/identity/identity-routes';
import { pkceChallenge } from 'src/modules/identity/identity-service';
import oauthRoutes from 'src/modules/oauth/oauth-routes';
import identityPlugin from 'src/plugins/identity';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { describe, expect, it } from 'vitest';

import { SoftwareAuthenticator } from '../../support/authenticator';
import { standIn } from '../../support/stand-in';
import { testVariables } from '../../support/variables';

/**
 * @constant ORIGIN
 * @description The portal's origin in the tests, which the passkeys are bound to
 */
const ORIGIN = 'https://orbit.example.fr';
/**
 * @constant TOKEN
 * @description The enrollment token set in the test environment
 */
const TOKEN = 'an-enrollment-token-long-enough-to-pass-the-check';
/**
 * @constant VERIFIER
 * @description The app's PKCE verifier in the connect tests
 */
const VERIFIER = 'a-verifier-only-the-app-knows-0123456789-abcdefghijklmnop';

/**
 * @interface StoredPasskey
 * @description A passkey row as the in-memory database keeps it.
 */
interface StoredPasskey {
    id: string; /*!< The credential's id */
    publicKey: Uint8Array; /*!< Its public key */
    counter: number; /*!< How many times it signed */
    transports: string[]; /*!< How it can be reached */
    aaguid: string; /*!< Which authenticator holds it */
    name?: Maybe<string>; /*!< The name the owner gave it, if any */
    backedUp: boolean; /*!< Whether it syncs */
    createdAt: Date; /*!< When it was created */
    lastUsedAt: Maybe<Date>; /*!< When it last signed in, if ever */
}

/**
 * @interface StoredSession
 * @description A refresh session row as the in-memory database keeps it.
 */
interface StoredSession {
    id: string; /*!< The session's id */
    userId: string; /*!< Whose it is */
    expiresAt: Date; /*!< When it lapses */
    connectionId: Maybe<string>; /*!< The connection of the client it was opened for, if any */
    clientName: Maybe<string>; /*!< That client's name */
    connectedAt: Date; /*!< When that client was authorized */
    lastUsedAt: Maybe<Date>; /*!< When that client last used it */
}

/**
 * @interface SessionFilter
 * @description The filters the identity and OAuth modules put on refresh sessions.
 */
interface SessionFilter {
    id?: string; /*!< One session */
    userId?: string; /*!< One owner's */
    connectionId?: string | { not: null }; /*!< One connection's, or any client's */
    expiresAt?: { gt: Date }; /*!< Only those not lapsed */
}

/**
 * @function matches
 * @description Whether a stored session passes a filter.
 */
function matches(session: StoredSession, where: SessionFilter): boolean {
    const connection = where.connectionId === undefined || (typeof where.connectionId !== 'string' ? session.connectionId !== null : session.connectionId === where.connectionId);
    const live = where.expiresAt === undefined || session.expiresAt > where.expiresAt.gt;

    return (where.id === undefined || session.id === where.id) && (where.userId === undefined || session.userId === where.userId) && connection && live;
}

/**
 * @interface MemoryDatabase
 * @description The in-memory stand-in for PostgreSQL, and its passkey table for the tests to look into.
 */
interface MemoryDatabase {
    prisma: object; /*!< The queries the identity module makes */
    passkeys: Map<string, StoredPasskey>; /*!< The passkey table */
}

/**
 * @interface TestApp
 * @description A test server and the passkey table behind it.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    passkeys: Map<string, StoredPasskey>; /*!< The passkey table */
}

/**
 * @interface TestTokens
 * @description A session's tokens, as the server hands them over.
 */
interface TestTokens {
    accessToken: string; /*!< The access token */
    refreshToken: string; /*!< The refresh token */
}

/**
 * @function memoryDatabase
 * @description Just the queries the identity module makes, over maps, so its routes run end to end without PostgreSQL.
 */
function memoryDatabase(): MemoryDatabase {
    const passkeys = new Map<string, StoredPasskey>();
    const sessions = new Map<string, StoredSession>();
    const prisma = {
        identityPasskey: {
            findUnique: ({ where }: { where: { id: string } }) => Promise.resolve(passkeys.get(where.id) ?? null),
            findMany: () => Promise.resolve([...passkeys.values()]),
            count: () => Promise.resolve(passkeys.size),
            create: ({ data }: { data: Omit<StoredPasskey, 'createdAt'> }) => {
                const row = { ...data, createdAt: new Date() };

                passkeys.set(row.id, row);

                return Promise.resolve(row);
            },
            update: ({ where, data }: { where: { id: string }; data: Partial<StoredPasskey> }) => {
                const row = { ...passkeys.get(where.id)!, ...data };

                passkeys.set(where.id, row);

                return Promise.resolve(row);
            },
            delete: ({ where }: { where: { id: string } }) => {
                const row = passkeys.get(where.id);

                passkeys.delete(where.id);

                return Promise.resolve(row);
            }
        },
        identityRefreshSession: {
            create: ({ data }: { data: Partial<StoredSession> & Pick<StoredSession, 'id' | 'userId' | 'expiresAt'> }) => {
                const row = { connectionId: null, clientName: null, connectedAt: new Date(), lastUsedAt: null, ...data };

                sessions.set(row.id, row);

                return Promise.resolve(row);
            },
            findUnique: ({ where }: { where: { id: string } }) => Promise.resolve(sessions.get(where.id) ?? null),
            findMany: ({ where }: { where: SessionFilter }) => Promise.resolve([...sessions.values()].filter((session) => matches(session, where))),
            updateMany: ({ where, data }: { where: SessionFilter; data: Partial<StoredSession> }) => {
                const found = [...sessions.values()].filter((session) => matches(session, where));

                found.forEach((session) => sessions.set(session.id, { ...session, ...data }));

                return Promise.resolve({ count: found.length });
            },
            delete: ({ where }: { where: { id: string } }) => Promise.resolve(sessions.delete(where.id)),
            deleteMany: ({ where }: { where: SessionFilter }) => {
                const found = [...sessions.values()].filter((session) => matches(session, where));

                found.forEach((session) => sessions.delete(session.id));

                return Promise.resolve({ count: found.length });
            }
        },
        $transaction: <T>(work: (transaction: unknown) => Promise<T>): Promise<T> => work(prisma)
    };

    return { prisma, passkeys };
}

/**
 * @function buildApp
 * @description The identity plugin and routes over the in-memory database, with a stand-in environment.
 */
async function buildApp(enrollmentToken = TOKEN): Promise<TestApp> {
    const { prisma, passkeys } = memoryDatabase();
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await app.register(fp((instance, _options, done) => {
        instance.decorate('variables', testVariables({ IDENTITY_ORIGIN: ORIGIN, IDENTITY_OWNER_NAME: 'Maël', IDENTITY_ENROLLMENT_TOKEN: enrollmentToken }));
        done();
    }, { name: 'environment' }));
    await app.register(fp((instance, _options, done) => {
        instance.decorate('prisma', standIn<PrismaClient>(prisma));
        done();
    }, { name: 'database' }));
    await app.register(identityPlugin);

    app.setErrorHandler((error: Error, _request, reply) => {
        let code = StatusCodes.INTERNAL_SERVER_ERROR;

        if (error instanceof RequestError) {
            code = error.code;
        } else if (hasZodFastifySchemaValidationErrors(error)) {
            code = StatusCodes.BAD_REQUEST;
        }

        return reply.status(code).send({ message: error.message, data: undefined });
    });

    await app.register(identityRoutes, { prefix: '/v1/identity' });
    await app.register(oauthRoutes);

    return { app, passkeys };
}

/**
 * @function post
 * @description Posts a JSON body, with a bearer token when one is given.
 */
async function post(app: FastifyInstance, url: string, payload: object = {}, accessToken?: string): Promise<LightMyRequestResponse> {
    return await app.inject({ method: 'POST', url, payload, headers: accessToken !== undefined ? { authorization: `Bearer ${accessToken}` } : {} });
}

/**
 * @function challengeOf
 * @description The challenge in a response's options.
 */
function challengeOf(response: { json: <T>() => T }): string {
    return response.json<{ data: { challenge: string } }>().data.challenge;
}

/**
 * @function enroll
 * @description Creates a passkey with the enrollment token, returning the tokens it signs in with.
 */
async function enroll(app: FastifyInstance, authenticator: SoftwareAuthenticator): Promise<TestTokens> {
    const options = await post(app, '/v1/identity/enrollment/options', { token: TOKEN });
    const response = await post(app, '/v1/identity/enrollment', { token: TOKEN, response: authenticator.create(challengeOf(options)) });

    expect(response.statusCode).toBe(StatusCodes.CREATED);

    return response.json<{ data: { accessToken: string; refreshToken: string } }>().data;
}

describe('enrollment', () => {
    it('is open only while a token is set', async () => {
        const open = await buildApp();
        const closed = await buildApp('');

        expect((await open.app.inject({ method: 'GET', url: '/v1/identity/enrollment' })).json()).toEqual({ data: { open: true } });
        expect((await closed.app.inject({ method: 'GET', url: '/v1/identity/enrollment' })).json()).toEqual({ data: { open: false } });
    });

    it('refuses a wrong token, and every token while closed', async () => {
        const open = await buildApp();
        const closed = await buildApp('');

        expect((await post(open.app, '/v1/identity/enrollment/options', { token: 'not-the-token' })).statusCode).toBe(StatusCodes.FORBIDDEN);
        expect((await post(closed.app, '/v1/identity/enrollment/options', { token: TOKEN })).statusCode).toBe(StatusCodes.FORBIDDEN);
    });

    it('files the passkey under the portal and the owner’s name', async () => {
        const { app } = await buildApp();
        const options = (await post(app, '/v1/identity/enrollment/options', { token: TOKEN })).json<{ data: { rp: { id: string; name: string }; user: { name: string }; authenticatorSelection: { residentKey: string; userVerification: string } } }>().data;

        expect(options.rp).toEqual({ id: 'orbit.example.fr', name: 'Orbit' });
        expect(options.user.name).toBe('Maël');
        expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    });

    it('stores the new passkey and signs in with it', async () => {
        const { app, passkeys } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN, aaguid: 'bada5566-a7aa-401f-bd96-45619a55120d' });
        const tokens = await enroll(app, authenticator);

        expect(passkeys.get(authenticator.credentialId)).toMatchObject({ aaguid: 'bada5566-a7aa-401f-bd96-45619a55120d', backedUp: true, counter: 0 });
        expect(passkeys.get(authenticator.credentialId)?.lastUsedAt).toBeInstanceOf(Date);

        const me = await app.inject({ method: 'GET', url: '/v1/identity/me', headers: { authorization: `Bearer ${tokens.accessToken}` } });

        expect(me.json()).toEqual({ data: { id: 'owner', name: 'Maël' } });
    });

    it('refuses a passkey made on another site', async () => {
        const { app, passkeys } = await buildApp();
        const options = await post(app, '/v1/identity/enrollment/options', { token: TOKEN });
        const phished = new SoftwareAuthenticator({ origin: ORIGIN });

        phished.origin = 'https://evil.example';

        const forged = phished.create(challengeOf(options));

        expect((await post(app, '/v1/identity/enrollment', { token: TOKEN, response: forged })).statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(passkeys.size).toBe(0);
    });
});

describe('POST /v1/identity/login', () => {
    it('signs in with a stored passkey and records its use', async () => {
        const { app, passkeys } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const options = await post(app, '/v1/identity/login/options');
        const response = await post(app, '/v1/identity/login', { response: authenticator.get(challengeOf(options)) });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: { accessToken: string } }>().data.accessToken).toBeTypeOf('string');
        expect(passkeys.get(authenticator.credentialId)?.lastUsedAt).toBeInstanceOf(Date);
    });

    it('asks for the device’s check, naming no passkey', async () => {
        const { app } = await buildApp();
        const options = (await post(app, '/v1/identity/login/options')).json<{ data: { rpId: string; userVerification: string; allowCredentials?: unknown[] } }>().data;

        expect(options.rpId).toBe('orbit.example.fr');
        expect(options.userVerification).toBe('required');
        expect(options.allowCredentials ?? []).toEqual([]);
    });

    it('refuses the same signed answer twice', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const answer = authenticator.get(challengeOf(await post(app, '/v1/identity/login/options')));

        expect((await post(app, '/v1/identity/login', { response: answer })).statusCode).toBe(StatusCodes.OK);
        expect((await post(app, '/v1/identity/login', { response: answer })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('refuses a challenge it never handed out, or handed out to create a passkey', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const registration = await post(app, '/v1/identity/enrollment/options', { token: TOKEN });

        expect((await post(app, '/v1/identity/login', { response: authenticator.get(challengeOf(registration)) })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect((await post(app, '/v1/identity/login', { response: authenticator.get('bWFkZS11cA') })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('refuses an answer without the device’s check', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);
        authenticator.verifiesUser = false;

        const options = await post(app, '/v1/identity/login/options');

        expect((await post(app, '/v1/identity/login', { response: authenticator.get(challengeOf(options)) })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('refuses an answer signed on another site', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);
        authenticator.origin = 'https://evil.example';

        const options = await post(app, '/v1/identity/login/options');

        expect((await post(app, '/v1/identity/login', { response: authenticator.get(challengeOf(options)) })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('refuses an unknown passkey, or a stored one’s id over another key’s signature', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });
        const stranger = new SoftwareAuthenticator({ origin: ORIGIN });
        /**
         * @function challenge
         * @description A fresh sign-in challenge
         */
        const challenge = async (): Promise<string> => challengeOf(await post(app, '/v1/identity/login/options'));

        await enroll(app, authenticator);

        expect((await post(app, '/v1/identity/login', { response: stranger.get(await challenge()) })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect((await post(app, '/v1/identity/login', { response: { ...stranger.get(await challenge()), id: authenticator.credentialId, rawId: authenticator.credentialId } })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('lets the same passkey in once it signs properly again', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);
        authenticator.verifiesUser = false;
        await post(app, '/v1/identity/login', { response: authenticator.get(challengeOf(await post(app, '/v1/identity/login/options'))) });
        authenticator.verifiesUser = true;

        expect((await post(app, '/v1/identity/login', { response: authenticator.get(challengeOf(await post(app, '/v1/identity/login/options'))) })).statusCode).toBe(StatusCodes.OK);
    });
});

describe('passkeys', () => {
    it('lists, adds and removes passkeys for the signed-in owner, keeping the last one', async () => {
        const { app, passkeys } = await buildApp();
        const first = new SoftwareAuthenticator({ origin: ORIGIN });
        const { accessToken } = await enroll(app, first);
        /**
         * @function list
         * @description The owner's passkeys, as the server lists them
         */
        const list = async (): Promise<{ id: string; aaguid: string }[]> => (await app.inject({ method: 'GET', url: '/v1/identity/passkeys', headers: { authorization: `Bearer ${accessToken}` } })).json<{ data: { id: string; aaguid: string }[] }>().data;
        /**
         * @function remove
         * @description Asks the server to forget a passkey
         */
        const remove = async (id: string): Promise<LightMyRequestResponse> => await app.inject({ method: 'DELETE', url: `/v1/identity/passkeys/${id}`, headers: { authorization: `Bearer ${accessToken}` } });

        expect(await list()).toHaveLength(1);
        expect((await remove(first.credentialId)).statusCode).toBe(StatusCodes.CONFLICT);

        const second = new SoftwareAuthenticator({ origin: ORIGIN });
        const options = await post(app, '/v1/identity/passkeys/options', {}, accessToken);

        expect(options.json<{ data: { excludeCredentials: { id: string }[] } }>().data.excludeCredentials.map(({ id }) => id)).toEqual([first.credentialId]);

        const added = await post(app, '/v1/identity/passkeys', { response: second.create(challengeOf(options)) }, accessToken);

        expect(added.statusCode).toBe(StatusCodes.CREATED);
        expect(added.json<{ data: { id: string; aaguid: string; publicKey?: unknown } }>().data).toEqual(expect.objectContaining({ id: second.credentialId, aaguid: '00000000-0000-0000-0000-000000000000' }));
        expect(added.json<{ data: object }>().data).not.toHaveProperty('publicKey');
        expect(added.json<{ data: { lastUsedAt: unknown } }>().data.lastUsedAt).toBeNull();
        expect(await list()).toHaveLength(2);

        const again = await post(app, '/v1/identity/passkeys', { response: second.create(challengeOf(await post(app, '/v1/identity/passkeys/options', {}, accessToken))) }, accessToken);

        expect(again.statusCode).toBe(StatusCodes.CONFLICT);
        expect((await remove(first.credentialId)).statusCode).toBe(StatusCodes.OK);
        expect([...passkeys.keys()]).toEqual([second.credentialId]);
        expect((await remove(first.credentialId)).statusCode).toBe(StatusCodes.NOT_FOUND);
    });

    it('renames a passkey, and takes the name back when it is cleared', async () => {
        const { app, passkeys } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });
        const { accessToken } = await enroll(app, authenticator);
        /**
         * @function rename
         * @description Asks the server to rename a passkey
         */
        const rename = async (id: string, body: object): Promise<LightMyRequestResponse> => await app.inject({ method: 'PATCH', url: `/v1/identity/passkeys/${id}`, headers: { authorization: `Bearer ${accessToken}` }, payload: body });

        const renamed = await rename(authenticator.credentialId, { name: '  MacBook Pro  ' });

        expect(renamed.statusCode).toBe(StatusCodes.OK);
        expect(renamed.json<{ data: { id: string; name: Maybe<string> } }>().data).toEqual(expect.objectContaining({ id: authenticator.credentialId, name: 'MacBook Pro' }));
        expect(passkeys.get(authenticator.credentialId)?.name).toBe('MacBook Pro');

        expect((await rename(authenticator.credentialId, { name: '   ' })).json<{ data: { name: Maybe<string> } }>().data.name).toBeNull();
        expect((await rename(authenticator.credentialId, { name: 'x'.repeat(65) })).statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect((await rename('dW5rbm93bg', { name: 'Nope' })).statusCode).toBe(StatusCodes.NOT_FOUND);
        expect((await app.inject({ method: 'PATCH', url: `/v1/identity/passkeys/${authenticator.credentialId}`, payload: { name: 'Nope' } })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('stays closed without a session', async () => {
        const { app } = await buildApp();

        expect((await app.inject({ method: 'GET', url: '/v1/identity/passkeys' })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect((await post(app, '/v1/identity/passkeys/options')).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
});

describe('connecting the app', () => {
    /**
     * @function connect
     * @description Signs in on the connect page, as the app's browser sheet does, returning the one-time code.
     */
    async function connect(app: FastifyInstance, authenticator: SoftwareAuthenticator): Promise<string> {
        const options = await post(app, '/v1/identity/login/options');
        const response = await post(app, '/v1/identity/connect', { response: authenticator.get(challengeOf(options)), challenge: pkceChallenge(VERIFIER) });

        expect(response.statusCode).toBe(StatusCodes.OK);

        return response.json<{ data: { code: string } }>().data.code;
    }

    it('trades the code, once, with the verifier it was asked with', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const code = await connect(app, authenticator);
        const traded = await post(app, '/v1/identity/connect/token', { code, verifier: VERIFIER });

        expect(traded.statusCode).toBe(StatusCodes.OK);
        expect(traded.json<{ data: { refreshToken: string } }>().data.refreshToken).toBeTypeOf('string');
        expect((await post(app, '/v1/identity/connect/token', { code, verifier: VERIFIER })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('burns the code on a wrong verifier', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const code = await connect(app, authenticator);

        expect((await post(app, '/v1/identity/connect/token', { code, verifier: `${VERIFIER}x` })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect((await post(app, '/v1/identity/connect/token', { code, verifier: VERIFIER })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('hands out no code without a valid passkey answer', async () => {
        const { app } = await buildApp();
        const stranger = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, new SoftwareAuthenticator({ origin: ORIGIN }));

        const options = await post(app, '/v1/identity/login/options');

        expect((await post(app, '/v1/identity/connect', { response: stranger.get(challengeOf(options)), challenge: pkceChallenge(VERIFIER) })).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
});

describe('authorizing an MCP client', () => {
    /**
     * @constant API
     * @description The headers of a request reaching the API through its proxy, at its public address
     */
    const API = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.example.fr' };
    /**
     * @constant CALLBACK
     * @description Where the client waits for its code
     */
    const CALLBACK = 'https://claude.example.com/api/mcp/auth_callback';

    /**
     * @function registerClient
     * @description Registers a client waiting on the callback, returning its id.
     */
    async function registerClient(app: FastifyInstance): Promise<string> {
        const response = await app.inject({ method: 'POST', url: '/oauth/register', headers: API, payload: { redirect_uris: [CALLBACK], client_name: 'Claude' } });

        expect(response.statusCode).toBe(StatusCodes.CREATED);

        return response.json<{ client_id: string }>().client_id;
    }

    /**
     * @function authorize
     * @description Authorizes a client with the passkey, as the portal's page does, returning where it is sent back.
     */
    async function authorize(app: FastifyInstance, authenticator: SoftwareAuthenticator, clientId: string, redirectUri: string = CALLBACK): Promise<LightMyRequestResponse> {
        const options = await post(app, '/v1/identity/login/options');

        return await post(app, '/v1/oauth/authorize', { response: authenticator.get(challengeOf(options)), clientId, redirectUri, codeChallenge: pkceChallenge(VERIFIER), state: 'a-state' });
    }

    /**
     * @function token
     * @description Asks for tokens with a form-encoded body, as OAuth clients do.
     */
    async function token(app: FastifyInstance, fields: Record<string, string>): Promise<LightMyRequestResponse> {
        return await app.inject({ method: 'POST', url: '/oauth/token', headers: { ...API, 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(fields).toString() });
    }

    it('tells clients where to authorize and where to get tokens', async () => {
        const { app } = await buildApp();
        const resource = await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/mcp', headers: API });
        const server = await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server', headers: API });

        expect(resource.json()).toMatchObject({ resource: 'https://api.example.fr/mcp', authorization_servers: ['https://api.example.fr'] });
        expect(server.json()).toMatchObject({ issuer: 'https://api.example.fr', authorization_endpoint: `${ORIGIN}/authorize`, token_endpoint: 'https://api.example.fr/oauth/token', registration_endpoint: 'https://api.example.fr/oauth/register', code_challenge_methods_supported: ['S256'] });
    });

    it('registers clients waiting over HTTPS or on the loopback address only', async () => {
        const { app } = await buildApp();
        const register = async (uri: string): Promise<number> => (await app.inject({ method: 'POST', url: '/oauth/register', payload: { redirect_uris: [uri] } })).statusCode;

        expect(await register('https://claude.ai/api/mcp/auth_callback')).toBe(StatusCodes.CREATED);
        expect(await register('http://localhost:33418/callback')).toBe(StatusCodes.CREATED);
        expect(await register('http://evil.example.com/callback')).toBe(StatusCodes.BAD_REQUEST);
        expect(await register('https://claude.ai/callback#fragment')).toBe(StatusCodes.BAD_REQUEST);
    });

    it('sends the client back with a code it trades once for tokens, then refreshes them', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const clientId = await registerClient(app);
        const described = await app.inject({ method: 'GET', url: `/v1/oauth/client?${new URLSearchParams({ clientId, redirectUri: CALLBACK }).toString()}` });

        expect(described.json()).toEqual({ data: { name: 'Claude', redirectHost: 'claude.example.com' } });

        const authorized = await authorize(app, authenticator, clientId);
        const redirect = new URL(authorized.json<{ data: { redirectUrl: string } }>().data.redirectUrl);
        const code = redirect.searchParams.get('code') ?? '';

        expect(`${redirect.origin}${redirect.pathname}`).toBe(CALLBACK);
        expect(redirect.searchParams.get('state')).toBe('a-state');

        const traded = await token(app, { grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: clientId, redirect_uri: CALLBACK });
        const tokens = traded.json<{ access_token: string; refresh_token: string; token_type: string; expires_in: number }>();

        expect(traded.statusCode).toBe(StatusCodes.OK);
        expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
        expect((await app.inject({ method: 'GET', url: '/v1/identity/me', headers: { authorization: `Bearer ${tokens.access_token}` } })).statusCode).toBe(StatusCodes.OK);
        expect((await token(app, { grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: clientId, redirect_uri: CALLBACK })).json()).toMatchObject({ error: 'invalid_grant' });

        const refreshed = await token(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });

        expect(refreshed.statusCode).toBe(StatusCodes.OK);
        expect((await token(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('lists the clients the owner authorized, across their rotations, and revokes them', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });
        const owner = (await enroll(app, authenticator)).accessToken;
        const clientId = await registerClient(app);
        const authorized = await authorize(app, authenticator, clientId);
        const code = new URL(authorized.json<{ data: { redirectUrl: string } }>().data.redirectUrl).searchParams.get('code') ?? '';
        const tokens = (await token(app, { grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: clientId, redirect_uri: CALLBACK })).json<{ refresh_token: string }>();
        const refreshed = (await token(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).json<{ refresh_token: string }>();
        const listed = await app.inject({ method: 'GET', url: '/v1/oauth/connections', headers: { authorization: `Bearer ${owner}` } });
        const connections = listed.json<{ data: { id: string; name: string }[] }>().data;

        expect(connections).toHaveLength(1);
        expect(connections[0]).toMatchObject({ name: 'Claude' });

        const revoked = await app.inject({ method: 'DELETE', url: `/v1/oauth/connections/${connections[0]?.id ?? ''}`, headers: { authorization: `Bearer ${owner}` } });

        expect(revoked.statusCode).toBe(StatusCodes.OK);
        expect((await token(app, { grant_type: 'refresh_token', refresh_token: refreshed.refresh_token })).json()).toMatchObject({ error: 'invalid_grant' });
        expect((await app.inject({ method: 'GET', url: '/v1/oauth/connections', headers: { authorization: `Bearer ${owner}` } })).json()).toEqual({ data: [] });
    });

    it('hands out no code for an address the client did not register, or a forged client', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const clientId = await registerClient(app);
        const forged = `${Buffer.from(JSON.stringify({ r: ['https://evil.example.com/cb'], n: 'Claude', t: 0 })).toString('base64url')}.${clientId.split('.')[1] ?? ''}`;

        expect((await authorize(app, authenticator, clientId, 'https://evil.example.com/cb')).statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect((await authorize(app, authenticator, forged, 'https://evil.example.com/cb')).statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('burns the code on a wrong verifier', async () => {
        const { app } = await buildApp();
        const authenticator = new SoftwareAuthenticator({ origin: ORIGIN });

        await enroll(app, authenticator);

        const clientId = await registerClient(app);
        const authorized = await authorize(app, authenticator, clientId);
        const code = new URL(authorized.json<{ data: { redirectUrl: string } }>().data.redirectUrl).searchParams.get('code') ?? '';

        expect((await token(app, { grant_type: 'authorization_code', code, code_verifier: `${VERIFIER}x`, client_id: clientId, redirect_uri: CALLBACK })).json()).toMatchObject({ error: 'invalid_grant' });
        expect((await token(app, { grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: clientId, redirect_uri: CALLBACK })).json()).toMatchObject({ error: 'invalid_grant' });
    });
});
