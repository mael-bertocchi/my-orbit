import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient } from 'prisma/generated/prisma/client';
import { forgetCatalog } from 'src/modules/watchlist/catalog/catalog-service';
import entriesRoutes from 'src/modules/watchlist/entries/entries-routes';
import type { IdentityService } from 'src/plugins/identity';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { standIn } from '../../../support/stand-in';
import { stubCatalog } from '../../../support/tmdb';
import { testVariables } from '../../../support/variables';

/**
 * @constant ENTRY_ID
 * @description The identifier of the title the stand-in database holds
 */
const ENTRY_ID = '5f0c6c1e-2b7a-4d4e-9a52-0f3f2a7e4b11';

/**
 * @interface Row
 * @description A stored title, as the stand-in database keeps it
 */
interface Row {
    id: string; /*!< Its identifier */
    tmdbId: number; /*!< Its identifier in the catalog */
    mediaType: string; /*!< A film or a series */
    titleEn: string; /*!< Its title in English */
    titleFr: string; /*!< Its title in French */
    originalTitle: string; /*!< Its original title */
    releaseDate: Maybe<string>; /*!< When it came out */
    posterPath: Maybe<string>; /*!< Its poster */
    genreIds: number[]; /*!< Its genres */
    collectionId: Maybe<number>; /*!< Its saga */
    collectionNameEn: Maybe<string>; /*!< Its saga's name in English */
    collectionNameFr: Maybe<string>; /*!< Its saga's name in French */
    runtime: Maybe<number>; /*!< How long a film lasts */
    seasons: Maybe<number>; /*!< How many seasons a series has */
    episodeCounts: number[]; /*!< How many episodes each season has */
    addedAt: Date; /*!< When it was added */
    startedAt: Maybe<Date>; /*!< When it was started */
    season: Maybe<number>; /*!< The season of the last episode seen */
    episode: Maybe<number>; /*!< The last episode seen */
    position: Maybe<number>; /*!< Where a film stopped, in seconds */
    watchedAt: Maybe<Date>; /*!< When it was watched */
    rating: Maybe<number>; /*!< Its rating, in half stars */
    comment: Maybe<string>; /*!< What was said about it */
}

/**
 * @function seriesRow
 * @description A series still to watch
 */
function seriesRow(): Row {
    return {
        id: ENTRY_ID,
        tmdbId: 1399,
        mediaType: 'tv',
        titleEn: 'Game of Thrones',
        titleFr: 'Game of Thrones',
        originalTitle: 'Game of Thrones',
        releaseDate: '2011-04-17',
        posterPath: '/got.jpg',
        genreIds: [10765, 18],
        collectionId: null,
        collectionNameEn: null,
        collectionNameFr: null,
        runtime: null,
        seasons: 8,
        episodeCounts: [],
        addedAt: new Date('2026-10-01T10:00:00Z'),
        startedAt: null,
        season: null,
        episode: null,
        position: null,
        watchedAt: null,
        rating: null,
        comment: null
    };
}

/**
 * @class EntriesTable
 * @description A stand-in for the watchlist table, holding its rows in memory.
 */
class EntriesTable {
    rows: Row[] = [seriesRow()]; /*!< The stored titles */

    findMany = vi.fn(() => Promise.resolve([...this.rows]));

    findUnique = vi.fn(({ where }: { where: { id?: string; mediaType_tmdbId?: { mediaType: string; tmdbId: number } } }) => {
        const key = where.mediaType_tmdbId;
        const found = this.rows.find((row) => (key === undefined ? row.id === where.id : row.mediaType === key.mediaType && row.tmdbId === key.tmdbId));

        return Promise.resolve(found ?? null);
    });

    create = vi.fn(({ data }: { data: Omit<Row, 'id' | 'addedAt' | 'startedAt' | 'season' | 'episode' | 'position' | 'watchedAt' | 'rating' | 'comment'> }) => {
        const row: Row = { ...data, id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', addedAt: new Date(), startedAt: null, season: null, episode: null, position: null, watchedAt: null, rating: null, comment: null };

        this.rows.push(row);

        return Promise.resolve(row);
    });

    update = vi.fn(({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const index = this.rows.findIndex((row) => row.id === where.id);

        this.rows[index] = { ...this.rows[index], ...data };

        return Promise.resolve(this.rows[index]);
    });

    deleteMany = vi.fn(({ where }: { where: { id: string } }) => {
        const before = this.rows.length;

        this.rows = this.rows.filter((row) => row.id !== where.id);

        return Promise.resolve({ count: before - this.rows.length });
    });
}

/**
 * @interface TestApp
 * @description A server carrying the watchlist routes, and its stand-in table.
 */
interface TestApp {
    app: FastifyInstance; /*!< The server */
    table: EntriesTable; /*!< The table */
}

/**
 * @function buildApp
 * @description Builds an instance carrying just what the watchlist routes depend on.
 */
async function buildApp(authenticate: () => Promise<void> = () => Promise.resolve()): Promise<TestApp> {
    const table = new EntriesTable();
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.decorate('variables', testVariables());
    app.decorate('prisma', standIn<PrismaClient>({ watchlistEntry: table }));
    app.decorate('identity', standIn<IdentityService>({ authenticate }));

    app.setErrorHandler((error: Error, _request, reply) => {
        let code = StatusCodes.INTERNAL_SERVER_ERROR;

        if (error instanceof RequestError) {
            code = error.code;
        } else if (hasZodFastifySchemaValidationErrors(error)) {
            code = StatusCodes.BAD_REQUEST;
        }

        return reply.status(code).send({ message: error.message, data: undefined });
    });

    await app.register(entriesRoutes, { prefix: '/v1/watchlist/entries' });

    return { app, table };
}

/**
 * @interface EntryBody
 * @description What the routes answer about a title
 */
interface EntryBody {
    data: { id: string; title: { en: string; fr: string }; genreIds: number[]; collectionId: Maybe<number>; collectionName: Maybe<{ en: string; fr: string }>; runtime: Maybe<number>; episodeCounts: number[]; startedAt: Maybe<string>; progress: Maybe<{ season: number; episode: number }>; position: Maybe<number>; watchedAt: Maybe<string>; rating: Maybe<number>; comment: Maybe<string> }; /*!< The title */
}

beforeEach(() => {
    forgetCatalog();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GET /v1/watchlist/entries', () => {
    it('lists the titles inside the standard envelope', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/v1/watchlist/entries' });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<{ data: { title: { en: string }; addedAt: string }[] }>().data[0]).toMatchObject({ title: { en: 'Game of Thrones' }, addedAt: '2026-10-01T10:00:00.000Z' });

        await app.close();
    });

    it('is guarded by the identity plugin', async () => {
        const { app, table } = await buildApp(() => Promise.reject(new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid or expired access token')));
        const response = await app.inject({ method: 'GET', url: '/v1/watchlist/entries' });

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
        expect(table.findMany).not.toHaveBeenCalled();

        await app.close();
    });
});

describe('POST /v1/watchlist/entries', () => {
    it('stores what the catalog says about the title in both languages, not what the client says', async () => {
        const calls = stubCatalog(testVariables().WATCHLIST_TMDB_URL);
        const { app } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/watchlist/entries', payload: { mediaType: 'movie', tmdbId: 120, title: 'Ignored' } });

        expect(response.statusCode).toBe(StatusCodes.CREATED);
        expect(response.json<EntryBody>().data).toMatchObject({
            title: { en: 'The Lord of the Rings: The Fellowship of the Ring', fr: 'Le Seigneur des anneaux : La Communauté de l’anneau' },
            genreIds: [12, 14],
            collectionId: 119,
            collectionName: { en: 'The Lord of the Rings Collection', fr: 'Le Seigneur des anneaux - Saga' },
            runtime: 179,
            watchedAt: null
        });
        expect(calls.filter((call) => call.path === '/movie/120').map((call) => call.query.get('language')).sort()).toEqual(['en-US', 'fr-FR']);

        await app.close();
    });

    it('refuses a title already on the watchlist', async () => {
        const calls = stubCatalog(testVariables().WATCHLIST_TMDB_URL);
        const { app } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/watchlist/entries', payload: { mediaType: 'tv', tmdbId: 1399 } });

        expect(response.statusCode).toBe(StatusCodes.CONFLICT);
        expect(calls).toHaveLength(0);

        await app.close();
    });

    it('refuses what is neither a film nor a series', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'POST', url: '/v1/watchlist/entries', payload: { mediaType: 'person', tmdbId: 1327 } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);

        await app.close();
    });
});

describe('PATCH /v1/watchlist/entries/:entryId', () => {
    it('marks a title watched with a rating and a comment', async () => {
        const { app } = await buildApp();
        const response = await app.inject({
            method: 'PATCH',
            url: `/v1/watchlist/entries/${ENTRY_ID}`,
            payload: { watchedAt: '2026-10-12T20:30:00.000Z', rating: 9, comment: '  La dernière saison déçoit.  ' }
        });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<EntryBody>().data).toMatchObject({ watchedAt: '2026-10-12T20:30:00.000Z', rating: 9, comment: 'La dernière saison déçoit.' });

        await app.close();
    });

    it('keeps what is not sent, and treats an empty comment as none', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], watchedAt: new Date('2026-10-12T20:30:00Z'), rating: 9, comment: 'Bien.' };

        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { comment: '' } });

        expect(response.json<EntryBody>().data).toMatchObject({ rating: 9, comment: null });

        await app.close();
    });

    it('forgets the rating and the comment of a title marked unwatched', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], watchedAt: new Date('2026-10-12T20:30:00Z'), rating: 9, comment: 'Bien.' };

        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { watchedAt: null } });

        expect(response.json<EntryBody>().data).toMatchObject({ watchedAt: null, rating: null, comment: null });

        await app.close();
    });

    it('starts a series, reading its seasons from the catalog, and says where it is', async () => {
        const { app, table } = await buildApp();

        stubCatalog(testVariables().WATCHLIST_TMDB_URL);

        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { startedAt: '2026-10-12T20:30:00.000Z', progress: { season: 7, episode: 7 } } });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<EntryBody>().data).toMatchObject({ startedAt: '2026-10-12T20:30:00.000Z', progress: { season: 7, episode: 7 }, watchedAt: null, episodeCounts: [10, 10, 10, 10, 10, 10, 7, 6] });
        expect(table.rows[0]).toMatchObject({ season: 7, episode: 7 });

        await app.close();
    });

    it('refuses an episode the series does not have', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], startedAt: new Date('2026-10-12T20:30:00Z'), episodeCounts: [10, 10, 10, 10, 10, 10, 7, 6] };

        const pastSeason = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { progress: { season: 9, episode: 1 } } });
        const pastEpisode = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { progress: { season: 8, episode: 7 } } });

        expect(pastSeason.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(pastEpisode.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(table.update).not.toHaveBeenCalled();

        await app.close();
    });

    it('keeps the seasons it knows when the catalog fails while starting a series', async () => {
        const { app, table } = await buildApp();

        stubCatalog(testVariables().WATCHLIST_TMDB_URL, { '/tv/1399': 500 });
        table.rows[0] = { ...table.rows[0], episodeCounts: [3] };

        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { startedAt: '2026-10-12T20:30:00.000Z' } });

        expect(response.statusCode).toBe(StatusCodes.OK);
        expect(response.json<EntryBody>().data).toMatchObject({ episodeCounts: [3], progress: null });

        await app.close();
    });

    it('drops the progress once the title is watched, and keeps the review when it is watched again', async () => {
        const { app, table } = await buildApp();

        stubCatalog(testVariables().WATCHLIST_TMDB_URL);
        table.rows[0] = { ...table.rows[0], startedAt: new Date('2026-10-01T20:30:00Z'), season: 3, episode: 2 };

        const watched = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { watchedAt: '2026-10-12T20:30:00.000Z', rating: 8 } });

        expect(watched.json<EntryBody>().data).toMatchObject({ startedAt: '2026-10-01T20:30:00.000Z', progress: null, rating: 8 });

        const again = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { watchedAt: null, startedAt: '2026-10-20T20:30:00.000Z' } });

        expect(again.json<EntryBody>().data).toMatchObject({ startedAt: '2026-10-20T20:30:00.000Z', watchedAt: null, progress: null, rating: 8 });

        await app.close();
    });

    it('forgets the start and the progress of a title put back to watch', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], startedAt: new Date('2026-10-01T20:30:00Z'), season: 3, episode: 2 };

        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { startedAt: null } });

        expect(response.json<EntryBody>().data).toMatchObject({ startedAt: null, progress: null, watchedAt: null });

        await app.close();
    });

    it('remembers where a film being watched stopped, within its runtime', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], mediaType: 'movie', tmdbId: 120, seasons: null, runtime: 179, startedAt: new Date('2026-10-01T20:30:00Z') };

        const stopped = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { position: 5025 } });
        const past = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { position: 179 * 60 + 1 } });
        const episode = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { progress: { season: 1, episode: 1 } } });

        expect(stopped.json<EntryBody>().data).toMatchObject({ position: 5025, progress: null });
        expect(past.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(episode.statusCode).toBe(StatusCodes.BAD_REQUEST);

        const watched = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { watchedAt: '2026-10-12T20:30:00.000Z' } });

        expect(watched.json<EntryBody>().data).toMatchObject({ position: null });

        await app.close();
    });

    it('refuses a moment for a series', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], startedAt: new Date('2026-10-01T20:30:00Z') };

        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { position: 600 } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);

        await app.close();
    });

    it('refuses to rate a title being watched', async () => {
        const { app, table } = await buildApp();

        table.rows[0] = { ...table.rows[0], startedAt: new Date('2026-10-01T20:30:00Z') };

        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { rating: 6 } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(table.update).not.toHaveBeenCalled();

        await app.close();
    });

    it('refuses to rate a title still to watch', async () => {
        const { app, table } = await buildApp();
        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { rating: 6 } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
        expect(table.update).not.toHaveBeenCalled();

        await app.close();
    });

    it('refuses a rating past five stars', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'PATCH', url: `/v1/watchlist/entries/${ENTRY_ID}`, payload: { watchedAt: '2026-10-12T20:30:00.000Z', rating: 11 } });

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);

        await app.close();
    });

    it('answers 404 for an unknown title', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'PATCH', url: '/v1/watchlist/entries/0d9e8f7a-6b5c-4d3e-8f1a-2b3c4d5e6f70', payload: { watchedAt: null } });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);

        await app.close();
    });
});

describe('DELETE /v1/watchlist/entries/:entryId', () => {
    it('takes a title off the watchlist', async () => {
        const { app, table } = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: `/v1/watchlist/entries/${ENTRY_ID}` });

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT);
        expect(table.rows).toHaveLength(0);

        await app.close();
    });

    it('answers 404 for an unknown title', async () => {
        const { app } = await buildApp();
        const response = await app.inject({ method: 'DELETE', url: '/v1/watchlist/entries/0d9e8f7a-6b5c-4d3e-8f1a-2b3c4d5e6f70' });

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);

        await app.close();
    });
});
