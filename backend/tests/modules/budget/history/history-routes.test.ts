import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import historyRoutes from 'src/modules/budget/history/history-routes';
import type { IdentityService } from 'src/plugins/identity';
import { RequestError } from 'src/shared/models';
import { describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

/**
 * @interface TestApp
 * @description A server carrying the history routes, and the writes it recorded.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    upsert: ReturnType<typeof vi.fn>; /*!< The history writes */
}

/**
 * @function buildApp
 * @description Builds an instance carrying just what the history routes depend on, holding September 2026.
 */
async function buildApp(): Promise<TestApp> {
    const upsert = vi.fn(({ create }: { create: object }) => Promise.resolve(create));
    const deleteMany = vi.fn(({ where }: { where: { month: string } }) => Promise.resolve({ count: where.month !== '2026-09' ? 0 : 1 }));
    const client = { budgetHistory: { upsert, deleteMany }, budgetState: { upsert: vi.fn(() => Promise.resolve({ revision: 1 })) } };
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.decorate('prisma', standIn<PrismaClient>({ ...client, $transaction: async (work: (transaction: typeof client) => Promise<unknown>) => await work(client) }));
    app.decorate('identity', standIn<IdentityService>({ authenticate: () => Promise.resolve() }));

    app.setErrorHandler((error: Error, _request, reply) => {
        let code = StatusCodes.INTERNAL_SERVER_ERROR;

        if (error instanceof RequestError) {
            code = error.code;
        } else if (hasZodFastifySchemaValidationErrors(error)) {
            code = StatusCodes.BAD_REQUEST;
        }

        return reply.status(code).send({ message: error.message, data: undefined });
    });

    await app.register(historyRoutes, { prefix: '/v1/budget/history' });

    return { app, upsert };
}

describe('PUT /v1/budget/history/:month', () => {
    it('freezes the budget of a month', async () => {
        const { app } = await buildApp();
        const payload = { monthlyLimit: 2800, categoryLimits: { groceries: 400 } };
        const response = await app.inject({ method: 'PUT', url: '/v1/budget/history/2026-09', payload });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: object }>().data).toEqual(payload);

        await app.close();
    });

    it('refuses a month not written as YYYY-MM', async () => {
        const { app, upsert } = await buildApp();
        const response = await app.inject({ method: 'PUT', url: '/v1/budget/history/september', payload: { monthlyLimit: 2800, categoryLimits: {} } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(upsert).not.toHaveBeenCalled();

        await app.close();
    });
});

describe('DELETE /v1/budget/history/:month', () => {
    it('answers 404 for a month never frozen', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/v1/budget/history/2026-08' });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);

        await app.close();
    });
});
