import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import securityPlugin, { allowedOrigins } from 'src/plugins/security';
import { describe, expect, it } from 'vitest';

import { testVariables } from '../support/variables';

/**
 * @constant WEB
 * @description The portal's origin in the tests
 */
const WEB = 'https://budget.example.fr';

/**
 * @function makeServer
 * @description A server with the security plugin, a stand-in environment and one route.
 */
async function makeServer(corsOrigin: string): Promise<FastifyInstance> {
    const fastify = Fastify();

    await fastify.register(fp((instance, _options, done) => {
        instance.decorate('variables', testVariables({ CORS_ORIGIN: corsOrigin }));
        done();
    }, { name: 'environment' }));
    await fastify.register(securityPlugin);

    fastify.get('/v1/budget/state', (_request, reply) => {
        void reply.send({ data: 'ok' });
    });

    return await fastify;
}

describe('allowedOrigins', () => {
    it('reads a comma-separated list, trimming spaces and trailing slashes', () => {
        expect(allowedOrigins(' https://a.fr/ , https://b.fr ')).toEqual(['https://a.fr', 'https://b.fr']);
        expect(allowedOrigins('')).toEqual([]);
    });
});

describe('CORS', () => {
    it('answers the web interface’s preflight', async () => {
        const fastify = await makeServer(WEB);
        const response = await fastify.inject({
            method: 'OPTIONS',
            url: '/v1/budget/state',
            headers: { 'Origin': WEB, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' }
        });

        expect(response.statusCode).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBe(WEB);
        expect(response.headers['access-control-allow-methods']).toContain('PUT');
        expect(response.headers['access-control-allow-methods']).toContain('PATCH');
        expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    });

    it('lets the web interface read a response', async () => {
        const fastify = await makeServer(WEB);
        const response = await fastify.inject({ method: 'GET', url: '/v1/budget/state', headers: { Origin: WEB } });

        expect(response.headers['access-control-allow-origin']).toBe(WEB);
    });

    it('opens nothing to any other site', async () => {
        const fastify = await makeServer(WEB);
        const response = await fastify.inject({ method: 'GET', url: '/v1/budget/state', headers: { Origin: 'https://evil.example' } });

        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('stays closed when no origin is configured', async () => {
        const fastify = await makeServer('');
        const response = await fastify.inject({ method: 'GET', url: '/v1/budget/state', headers: { Origin: WEB } });

        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});

describe('rate limit', () => {
    it('counts each visitor Cloudflare saw apart, so one can\'t use up another\'s tries', async () => {
        const fastify = await makeServer(WEB);
        const flood = Array.from({ length: 120 }, async () => await fastify.inject({ method: 'GET', url: '/v1/budget/state', headers: { 'cf-connecting-ip': '203.0.113.7' } }));

        await Promise.all(flood);

        expect((await fastify.inject({ method: 'GET', url: '/v1/budget/state', headers: { 'cf-connecting-ip': '203.0.113.7' } })).statusCode).toBe(429);
        expect((await fastify.inject({ method: 'GET', url: '/v1/budget/state', headers: { 'cf-connecting-ip': '198.51.100.4' } })).statusCode).toBe(200);
    });
});
