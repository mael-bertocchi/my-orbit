import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import mcpRoutes from 'src/modules/mcp/mcp-routes';
import identityPlugin from 'src/plugins/identity';
import { RequestError } from 'src/shared/models';
import { describe, expect, it, vi } from 'vitest';

import { standIn } from '../../support/stand-in';
import { testVariables } from '../../support/variables';

/**
 * @constant LIVE_CONNECTION
 * @description The id of a client's connection the owner hasn't revoked
 */
const LIVE_CONNECTION = '5f0c6a8e-2b1d-4c3e-9f7a-1d2e3f4a5b6c';

/**
 * @interface TestApp
 * @description A server carrying the MCP endpoint, a token to call it with, and the stand-in operations table.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    accessToken: string; /*!< A valid access token */
    operations: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }; /*!< The operations table */
}

/**
 * @interface RpcAnswer
 * @description A JSON-RPC answer, as the endpoint sends it
 */
interface RpcAnswer {
    result: { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[]; content: { text: string }[]; isError: boolean; serverInfo: { name: string }; instructions: string }; /*!< What it answers */
}

/**
 * @function buildApp
 * @description The identity plugin and the MCP endpoint over stand-in tables.
 */
async function buildApp(): Promise<TestApp> {
    const operations = {
        findUnique: vi.fn(() => Promise.resolve(null)),
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data, deletedAt: null, updatedAt: new Date() })),
        update: vi.fn()
    };
    const prisma = {
        budgetOperation: operations,
        budgetCategory: { findMany: vi.fn(() => Promise.resolve([{ id: 'groceries', name: 'Groceries', monthlyLimit: 400 }])) },
        budgetState: { upsert: vi.fn(() => Promise.resolve({ revision: 2 })) },
        budgetRecurringOperation: { findMany: vi.fn(() => Promise.resolve([])) },
        identityRefreshSession: { updateMany: vi.fn(({ where }: { where: { connectionId: string } }) => Promise.resolve({ count: where.connectionId === LIVE_CONNECTION ? 1 : 0 })) },
        $transaction: <T>(work: (transaction: unknown) => Promise<T>): Promise<T> => work(prisma)
    };
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await app.register(fp((instance, _options, done) => {
        instance.decorate('variables', testVariables());
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

    await app.register(mcpRoutes, { prefix: '/mcp' });
    await app.ready();

    return { app, accessToken: app.jwt.sign({ id: 'owner', type: 'access' }), operations };
}

/**
 * @function rpc
 * @description Sends one JSON-RPC message to the endpoint, as an MCP client does.
 */
async function rpc(app: FastifyInstance, method: string, params: object, accessToken?: string): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.example.fr', accept: 'application/json, text/event-stream', 'content-type': 'application/json' };

    if (accessToken !== undefined) {
        headers.authorization = `Bearer ${accessToken}`;
    }

    return await app.inject({ method: 'POST', url: '/mcp', headers, payload: { jsonrpc: '2.0', id: 1, method, params } });
}

/**
 * @function call
 * @description Calls a tool, returning what it answers.
 */
async function call(app: FastifyInstance, accessToken: string, name: string, args: object): Promise<{ result: Record<string, unknown>; isError: boolean }> {
    const answer = (await rpc(app, 'tools/call', { name, arguments: args }, accessToken)).json<RpcAnswer>().result;

    return { result: standIn<Record<string, unknown>>(JSON.parse(answer.content[0]?.text ?? '{}')), isError: answer.isError };
}

describe('the MCP endpoint', () => {
    it('tells a client without a token where to authorize', async () => {
        const { app } = await buildApp();
        const response = await rpc(app, 'tools/list', {});

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect(response.headers['www-authenticate']).toBe('Bearer resource_metadata="https://api.example.fr/.well-known/oauth-protected-resource/mcp"');
    });

    it('lets an authorized client in until its connection is revoked', async () => {
        const { app } = await buildApp();
        const live = app.jwt.sign({ id: 'owner', type: 'access', cid: LIVE_CONNECTION });
        const revoked = app.jwt.sign({ id: 'owner', type: 'access', cid: '00000000-0000-4000-8000-000000000000' });

        expect((await rpc(app, 'tools/list', {}, live)).statusCode).toBe(StatusCodes.OK);
        expect((await rpc(app, 'tools/list', {}, revoked)).statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });

    it('introduces itself with its instructions', async () => {
        const { app, accessToken } = await buildApp();
        const response = await rpc(app, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, accessToken);

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<RpcAnswer>().result.serverInfo.name).toBe('my-orbit');
        expect(response.json<RpcAnswer>().result.instructions).toContain('budget_ or watchlist_');
    });

    it('lists its tools, named after their app, with what they do to the data', async () => {
        const { app, accessToken } = await buildApp();
        const tools = (await rpc(app, 'tools/list', {}, accessToken)).json<RpcAnswer>().result.tools;

        expect(tools.map((tool) => tool.name)).toEqual(['budget_list_categories', 'budget_search_operations', 'budget_month_summary', 'budget_create_operation', 'budget_update_operation', 'budget_delete_operation', 'budget_list_recurring', 'budget_create_recurring', 'budget_update_recurring', 'budget_delete_recurring', 'watchlist_search', 'watchlist_title_details', 'watchlist_rate_title', 'watchlist_add_title']);
        expect(tools.find((tool) => tool.name === 'budget_delete_operation')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
        expect(tools.find((tool) => tool.name === 'budget_search_operations')?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    });

    it('logs an operation in euros, dated at noon on its day', async () => {
        const { app, accessToken, operations } = await buildApp();
        const { result, isError } = await call(app, accessToken, 'budget_create_operation', { date: '2026-10-28', name: 'Monoprix', categoryId: 'groceries', amount: 42.5, currencyCode: 'EUR' });

        expect(isError).toBe(false);
        expect(result).toMatchObject({ status: 'Logged', operation: { name: 'Monoprix', euroAmount: 42.5 } });
        expect(operations.create.mock.calls[0]?.[0]).toMatchObject({ data: { date: new Date('2026-10-28T12:00:00.000Z'), rateToEuro: 1, isOnline: false, isRecurring: false } });
    });

    it('refuses an unknown category, a day to come and an unknown operation, telling the model why', async () => {
        const { app, accessToken, operations } = await buildApp();

        expect(await call(app, accessToken, 'budget_create_operation', { date: '2026-10-28', name: 'Monoprix', categoryId: 'unknown', amount: 1, currencyCode: 'EUR' })).toMatchObject({ isError: true, result: { error: 'Unknown category "unknown". Use one of: groceries' } });
        expect(await call(app, accessToken, 'budget_create_operation', { date: '2999-01-01', name: 'Monoprix', categoryId: 'groceries', amount: 1, currencyCode: 'EUR' })).toMatchObject({ isError: true });
        expect(await call(app, accessToken, 'budget_delete_operation', { operationId: 'missing' })).toMatchObject({ isError: true });
        expect(operations.create).not.toHaveBeenCalled();
        expect(operations.update).not.toHaveBeenCalled();
    });

    it('refuses the stream and session methods', async () => {
        const { app, accessToken } = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/mcp', headers: { authorization: `Bearer ${accessToken}` } });

        expect(response.statusCode).toBe(StatusCodes.METHOD_NOT_ALLOWED);
    });
});
