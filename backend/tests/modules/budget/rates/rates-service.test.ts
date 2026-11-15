import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import { pullRates, pullRatesForDay } from 'src/modules/budget/rates/rates-service';
import { RequestError } from 'src/shared/models';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';

/**
 * @constant providerPayload
 * @description A payload as the upstream provider answers it
 */
const providerPayload = {
    base: 'EUR',
    date: '2026-09-07',
    rates: { CHF: 0.9405, KRW: 1566.56, USD: 1.1622 }
};

/**
 * @interface PrismaDouble
 * @description A Prisma stand-in and the snapshot queries it records.
 */
interface PrismaDouble {
    prisma: PrismaClient; /*!< The stand-in */
    findUnique: Mock<() => Promise<unknown>>; /*!< The snapshot lookup */
    upsert: Mock<(query: { create: unknown }) => Promise<unknown>>; /*!< The snapshot write */
}

/**
 * @interface LoggerDouble
 * @description A logger stand-in and what it was told.
 */
interface LoggerDouble {
    logger: FastifyBaseLogger; /*!< The stand-in */
    warn: Mock; /*!< The warnings */
    error: Mock; /*!< The errors */
}

/**
 * @function makePrisma
 * @description Builds a Prisma stand-in whose snapshot row is whatever the test wants it to be.
 */
function makePrisma(snapshot: unknown): PrismaDouble {
    const upsert = vi.fn(({ create }: { create: unknown }) => Promise.resolve(create));
    const findUnique = vi.fn(() => Promise.resolve(snapshot));

    return {
        prisma: standIn<PrismaClient>({ budgetExchangeRateSnapshot: { findUnique, upsert } }),
        findUnique,
        upsert
    };
}

/**
 * @function makeLogger
 * @description Builds a logger stand-in that records what the service reported.
 */
function makeLogger(): LoggerDouble {
    const warn = vi.fn();
    const error = vi.fn();

    return { logger: standIn<FastifyBaseLogger>({ warn, error }), warn, error };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('pullRates', () => {
    it('inverts the provider quotes into euros per unit', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(providerPayload) })));

        const { prisma } = makePrisma(null);
        const { logger } = makeLogger();
        const result = await pullRates(prisma, logger);

        expect(result.quoteDate).toBe('2026-09-07');
        expect(result.rates.USD).toBeCloseTo(1 / 1.1622, 9);
        expect(result.rates.CHF).toBeCloseTo(1 / 0.9405, 9);
        expect(result.rates.KRW).toBeCloseTo(1 / 1566.56, 9);
    });

    it('quotes the base currency against itself', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(providerPayload) })));

        const { prisma } = makePrisma(null);
        const { logger } = makeLogger();

        expect((await pullRates(prisma, logger)).rates.EUR).toBe(1);
    });

    it('stores the refreshed snapshot', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(providerPayload) })));

        const { prisma, upsert } = makePrisma(null);
        const { logger } = makeLogger();

        await pullRates(prisma, logger);

        expect(upsert).toHaveBeenCalledTimes(1);
        expect(upsert.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'latest' } });
    });

    it('serves a recent snapshot without calling the provider', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma({
            id: 'latest',
            quoteDate: '2026-09-07',
            rates: { EUR: 1, USD: 0.860437 },
            fetchedAt: new Date()
        });
        const { logger } = makeLogger();
        const result = await pullRates(prisma, logger);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.rates.USD).toBe(0.860437);
    });

    it('falls back to the stored snapshot when the provider is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

        const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const { prisma, upsert } = makePrisma({
            id: 'latest',
            quoteDate: '2026-09-05',
            rates: { EUR: 1, USD: 0.859 },
            fetchedAt: stale
        });
        const { logger, warn } = makeLogger();
        const result = await pullRates(prisma, logger);

        expect(result.quoteDate).toBe('2026-09-05');
        expect(result.fetchedAt).toBe(stale);
        expect(upsert).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('reports the outage when the provider is unreachable and nothing is stored', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

        const { prisma } = makePrisma(null);
        const { logger, error } = makeLogger();

        await expect(pullRates(prisma, logger)).rejects.toBeInstanceOf(RequestError);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('rejects a provider payload it cannot trust', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ base: 'USD', date: '2026-09-07', rates: {} }) })));

        const { prisma } = makePrisma(null);
        const { logger } = makeLogger();

        await expect(pullRates(prisma, logger)).rejects.toBeInstanceOf(RequestError);
    });
});

/**
 * @function isoDay
 * @description The UTC day a number of days from now, in the form the endpoint takes.
 */
function isoDay(offset: number): string {
    const date = new Date();

    date.setUTCDate(date.getUTCDate() + offset);

    return date.toISOString().slice(0, 10);
}

describe('pullRatesForDay', () => {
    it('asks the provider for the day it was given', async () => {
        const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true, json: () => Promise.resolve({ ...providerPayload, date: '2026-09-04' }) }));
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma(null);
        const { logger } = makeLogger();
        const result = await pullRatesForDay(prisma, logger, '2026-09-07');

        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/2026-09-07?base=EUR');
        expect(result.rates.USD).toBeCloseTo(1 / 1.1622, 9);
    });

    it('names the day the rates actually came from, not the day asked for', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ...providerPayload, date: '2026-09-04' }) })));

        const { prisma } = makePrisma(null);
        const { logger } = makeLogger();

        expect((await pullRatesForDay(prisma, logger, '2026-09-05')).quoteDate).toBe('2026-09-04');
    });

    it('caches a finished day forever, however old the stored row is', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma({
            id: '2026-09-04',
            quoteDate: '2026-09-04',
            rates: { EUR: 1, USD: 0.860437 },
            fetchedAt: new Date('2026-01-01T00:00:00.000Z')
        });
        const { logger } = makeLogger();
        const result = await pullRatesForDay(prisma, logger, '2026-09-04');

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.rates.USD).toBe(0.860437);
    });

    it('re-checks today, whose rates may not be published yet', async () => {
        const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(providerPayload) }));
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma({
            id: isoDay(0),
            quoteDate: isoDay(-1),
            rates: { EUR: 1, USD: 0.859 },
            fetchedAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
        });
        const { logger } = makeLogger();

        await pullRatesForDay(prisma, logger, isoDay(0));

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refuses a date no timezone could call the past', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma(null);
        const { logger } = makeLogger();

        await expect(pullRatesForDay(prisma, logger, isoDay(2))).rejects.toBeInstanceOf(RequestError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows tomorrow in UTC, which is still today ahead of it', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(providerPayload) })));

        const { prisma } = makePrisma(null);
        const { logger } = makeLogger();

        await expect(pullRatesForDay(prisma, logger, isoDay(1))).resolves.toBeDefined();
    });
});

describe('pullRatesForDay, waiting on a publication', () => {
    it('re-checks a day still answered by an earlier one, even minutes later', async () => {
        const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(providerPayload) }));
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma({
            id: isoDay(0),
            quoteDate: isoDay(-1),
            rates: { EUR: 1, USD: 0.859 },
            fetchedAt: new Date(Date.now() - 40 * 60 * 1000)
        });
        const { logger } = makeLogger();

        await pullRatesForDay(prisma, logger, isoDay(0));

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sits on a day that already carries its own rate', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma({
            id: isoDay(0),
            quoteDate: isoDay(0),
            rates: { EUR: 1, USD: 0.861 },
            fetchedAt: new Date(Date.now() - 40 * 60 * 1000)
        });
        const { logger } = makeLogger();

        await pullRatesForDay(prisma, logger, isoDay(0));

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('re-checks yesterday when it was only answered before its rate came out', async () => {
        const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(providerPayload) }));
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma({
            id: isoDay(-1),
            quoteDate: isoDay(-2),
            rates: { EUR: 1, USD: 0.859 },
            fetchedAt: new Date(Date.now() - 20 * 60 * 60 * 1000)
        });
        const { logger } = makeLogger();

        await pullRatesForDay(prisma, logger, isoDay(-1));

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stops re-checking a day older than a week, however it was answered', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { prisma } = makePrisma({
            id: '2026-09-05',
            quoteDate: '2026-09-04',
            rates: { EUR: 1, USD: 0.860437 },
            fetchedAt: new Date('2026-09-05T12:00:00.000Z')
        });
        const { logger } = makeLogger();
        const result = await pullRatesForDay(prisma, logger, '2026-09-05');

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.quoteDate).toBe('2026-09-04');
    });
});
