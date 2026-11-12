import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import categoriesRoutes from 'src/modules/budget/categories/categories-routes';
import type { IdentityService } from 'src/plugins/identity';
import { RequestError } from 'src/shared/models';
import { describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

/**
 * @interface TestApp
 * @description A server carrying the category routes, and the writes it recorded.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    upsert: ReturnType<typeof vi.fn>; /*!< The category writes */
    bump: ReturnType<typeof vi.fn>; /*!< The revision bumps */
}

/**
 * @function buildApp
 * @description Builds an instance carrying just what the category routes depend on, holding the groceries category.
 */
async function buildApp(): Promise<TestApp> {
    const upsert = vi.fn(({ create }: { create: object }) => Promise.resolve(create));
    const deleteMany = vi.fn(({ where }: { where: { id: string } }) => Promise.resolve({ count: where.id !== 'groceries' ? 0 : 1 }));
    const bump = vi.fn(() => Promise.resolve({ id: 'owner', monthlyLimit: 3000, revision: 1 }));
    const client = { budgetCategory: { upsert, deleteMany }, budgetState: { upsert: bump } };
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

    await app.register(categoriesRoutes, { prefix: '/v1/budget/categories' });

    return { app, upsert, bump };
}

/**
 * @constant groceries
 * @description The groceries category as the client stores it
 */
const groceries = { name: 'Groceries', symbol: 'cart', colorHex: 0x3ecf8e, monthlyLimit: 400, position: 0 };

describe('PUT /v1/budget/categories/:categoryId', () => {
    it('stores the category under the id in the path and moves the revision on', async () => {
        const { app, upsert, bump } = await buildApp();
        const response = await app.inject({ method: 'PUT', url: '/v1/budget/categories/groceries', payload: groceries });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(upsert).toHaveBeenCalledWith({ where: { id: 'groceries' }, update: groceries, create: { id: 'groceries', ...groceries } });
        expect(bump).toHaveBeenCalledOnce();

        await app.close();
    });

    it('refuses a colour outside the 0xRRGGBB range', async () => {
        const { app, upsert } = await buildApp();
        const response = await app.inject({ method: 'PUT', url: '/v1/budget/categories/groceries', payload: { ...groceries, colorHex: 0x1000000 } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(upsert).not.toHaveBeenCalled();

        await app.close();
    });
});

describe('DELETE /v1/budget/categories/:categoryId', () => {
    it('removes a category', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/v1/budget/categories/groceries' });

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT);

        await app.close();
    });

    it('answers 404 for an unknown category', async () => {
        const { app, bump } = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/v1/budget/categories/unknown' });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
        expect(bump).not.toHaveBeenCalled();

        await app.close();
    });
});
