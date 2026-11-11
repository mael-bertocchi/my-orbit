import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { BudgetExchangeRateSnapshot, PrismaClient } from 'prisma/generated/prisma/client';
import type { ProviderPayload, RatesBody } from 'src/modules/budget/rates/rates-models';
import { BASE_CURRENCY, PROVIDER_BASE_URL, ProviderPayloadSchema, StoredRatesSchema, toIsoDay } from 'src/modules/budget/rates/rates-models';
import type { Perhaps } from 'src/shared/models';
import { RequestError } from 'src/shared/models';

/**
 * @constant LATEST_ID
 * @description Primary key of the row holding the most recently published rates. Rows for a specific day
 * are keyed by that day instead, so both live and historical lookups share one cache.
 */
const LATEST_ID = 'latest';

/**
 * @function providerUrl
 * @description Builds the provider endpoint for a given day, or for the most recent publication.
 *
 * @param {string} day The day to quote, or 'latest'.
 *
 * @returns {string} The endpoint to query.
 */
function providerUrl(day: string): string {
    return `${PROVIDER_BASE_URL}/${day}?base=${BASE_CURRENCY}`;
}

/**
 * @constant PROVIDER_TIMEOUT
 * @description How long to wait on the provider before giving up and falling back to the stored snapshot.
 */
const PROVIDER_TIMEOUT = 8 * 1000;

/**
 * @constant REFRESH_AFTER
 * @description How old a stored snapshot may get before the provider is queried again. The ECB publishes once
 * per working day around 16:00 CET, so re-checking a few times a day is enough to never miss a publication.
 */
const REFRESH_AFTER = 6 * 60 * 60 * 1000;

/**
 * @constant PENDING_REFRESH_AFTER
 * @description How often to re-check a day that is still waiting on its own publication. Today's rates only
 * appear around 16:00 CET, so until they do the answer carries an earlier day's rate and is worth chasing.
 */
const PENDING_REFRESH_AFTER = 30 * 60 * 1000;

/**
 * @function toEuroRates
 * @description Inverts the provider's "units per euro" quotes into the "euros per unit" values the client stores,
 * and adds the identity rate for the base currency itself.
 *
 * @param {ProviderPayload['rates']} rates The provider's quotes, keyed by currency code.
 *
 * @returns {Record<string, number>} Euros bought by one unit of each currency.
 */
function toEuroRates(rates: ProviderPayload['rates']): Record<string, number> {
    const euroRates: Record<string, number> = { [BASE_CURRENCY]: 1 };

    for (const [code, unitsPerEuro] of Object.entries(rates)) {
        euroRates[code] = 1 / unitsPerEuro;
    }

    return euroRates;
}

/**
 * @function toBody
 * @description Maps a stored snapshot row onto the response body.
 *
 * @param {BudgetExchangeRateSnapshot} snapshot The stored snapshot row.
 *
 * @returns {RatesBody} The snapshot in the shape served to the client.
 */
function toBody(snapshot: BudgetExchangeRateSnapshot): RatesBody {
    return {
        base: BASE_CURRENCY,
        quoteDate: snapshot.quoteDate,
        fetchedAt: snapshot.fetchedAt,
        rates: StoredRatesSchema.parse(snapshot.rates)
    };
}

/**
 * @function fetchProvider
 * @description Queries the upstream provider for one day and validates its payload. Asking for a day the ECB
 * did not publish on answers with the most recent publication before it, named in the payload's own date.
 *
 * @param {string} day The day to quote, or 'latest'.
 *
 * @returns {Promise<ProviderPayload>} The validated upstream payload.
 */
async function fetchProvider(day: string): Promise<ProviderPayload> {
    const response = await fetch(providerUrl(day), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT)
    });

    if (!response.ok) {
        throw new Error(`Rate provider answered ${response.status}`);
    }

    return ProviderPayloadSchema.parse(await response.json());
}

/**
 * @function isStale
 * @description Whether a stored snapshot is worth replacing. A finished day never is: its rates can no longer
 * be republished. A day still answered by an earlier day's rate is re-checked often, because its own rate is
 * yet to come.
 *
 * @param {BudgetExchangeRateSnapshot} snapshot The stored snapshot.
 * @param {string} day The day it was stored for.
 * @param {boolean} settled Whether that day is over.
 *
 * @returns {boolean} Whether to ask the provider again.
 */
function isStale(snapshot: BudgetExchangeRateSnapshot, day: string, settled: boolean): boolean {
    if (settled) {
        return false;
    }

    const window = snapshot.quoteDate === day ? REFRESH_AFTER : PENDING_REFRESH_AFTER;

    return Date.now() - snapshot.fetchedAt.getTime() >= window;
}

/**
 * @function pullSnapshot
 * @description Returns one cached snapshot, refreshing it from the provider when it is missing or stale.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} day The day to quote, or 'latest' for the most recent publication.
 * @param {boolean} settled Whether the day is finished, making its rates immutable and cacheable forever.
 *
 * @returns {Promise<RatesBody>} The rate snapshot, in the client's euros-per-unit convention.
 */
async function pullSnapshot(prisma: PrismaClient, logger: FastifyBaseLogger, day: string, settled: boolean): Promise<RatesBody> {
    const cached = await prisma.budgetExchangeRateSnapshot.findUnique({ where: { id: day } });

    if (cached !== null && !isStale(cached, day, settled)) {
        return toBody(cached);
    }

    let payload: ProviderPayload;

    try {
        payload = await fetchProvider(day);
    } catch (error: unknown) {
        if (cached === null) {
            logger.error({ error, day }, 'Rate provider unreachable and no snapshot stored');

            throw new RequestError(StatusCodes.SERVICE_UNAVAILABLE, 'Exchange rates are unavailable');
        }

        logger.warn({ error, day, fetchedAt: cached.fetchedAt }, 'Rate provider unreachable, serving the stored snapshot');

        return toBody(cached);
    }

    const rates = toEuroRates(payload.rates);
    const fetchedAt = new Date();

    await prisma.budgetExchangeRateSnapshot.upsert({
        where: { id: day },
        update: { quoteDate: payload.date, rates, fetchedAt },
        create: { id: day, quoteDate: payload.date, rates, fetchedAt }
    });

    return { base: BASE_CURRENCY, quoteDate: payload.date, fetchedAt, rates };
}

/**
 * @function pullRates
 * @description Returns the most recently published reference rates.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 *
 * @returns {Promise<RatesBody>} The rate snapshot, in the client's euros-per-unit convention.
 */
export async function pullRates(prisma: PrismaClient, logger: FastifyBaseLogger): Promise<RatesBody> {
    return await pullSnapshot(prisma, logger, LATEST_ID, false);
}

/**
 * @function pullRatesForDay
 * @description Returns the reference rates that applied on one day.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} day The day to quote, in YYYY-MM-DD form.
 *
 * @returns {Promise<RatesBody>} The rate snapshot, in the client's euros-per-unit convention.
 */
export async function pullRatesForDay(prisma: PrismaClient, logger: FastifyBaseLogger, day: string): Promise<RatesBody> {
    const today = toIsoDay(new Date());
    const tomorrow = new Date();

    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    if (day > toIsoDay(tomorrow)) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Exchange rates cannot be requested for a future date');
    }

    return await pullSnapshot(prisma, logger, day, day < today);
}

/**
 * @constant BANK_MARKUP
 * @description What the owner's bank adds on top of the reference rate of any currency but the euro, as the apps apply it.
 */
export const BANK_MARKUP = 0.01;

/**
 * @function rateToEuroOn
 * @description The euros one unit of a currency cost on a day, the bank's markup included, as the apps price an operation.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {string} code The currency.
 * @param {string} day The day, as `YYYY-MM-DD`.
 *
 * @returns {Promise<Perhaps<number>>} The rate, or undefined when the currency has none. Rejects with 503 when no rate can
 * be had.
 */
export async function rateToEuroOn(prisma: PrismaClient, logger: FastifyBaseLogger, code: string, day: string): Promise<Perhaps<number>> {
    if (code === BASE_CURRENCY) {
        return 1;
    }

    const snapshot = await pullRatesForDay(prisma, logger, day);
    const reference = snapshot.rates[code];

    return reference === undefined ? undefined : reference * (1 + BANK_MARKUP);
}
