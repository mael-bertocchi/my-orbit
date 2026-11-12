import type { FastifyBaseLogger } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { PrismaClient, WatchlistEntry } from 'prisma/generated/prisma/client';
import { titleDetails } from 'src/modules/watchlist/catalog/catalog-service';
import type { Entry, EntryCreate, EntryUpdate } from 'src/modules/watchlist/entries/entries-models';
import type { Variables } from 'src/plugins/environment';
import { RequestError } from 'src/shared/models';

/**
 * @function toEntry
 * @description Maps a stored row onto the title the client receives.
 *
 * @param {WatchlistEntry} row The stored row.
 *
 * @returns {Entry} The title.
 */
function toEntry(row: WatchlistEntry): Entry {
    return {
        id: row.id,
        tmdbId: row.tmdbId,
        mediaType: row.mediaType,
        title: { en: row.titleEn, fr: row.titleFr },
        originalTitle: row.originalTitle,
        releaseDate: row.releaseDate,
        posterPath: row.posterPath,
        genreIds: row.genreIds,
        collectionId: row.collectionId,
        collectionName: row.collectionNameEn !== null && row.collectionNameFr !== null ? { en: row.collectionNameEn, fr: row.collectionNameFr } : null,
        runtime: row.runtime,
        seasons: row.seasons,
        addedAt: row.addedAt,
        startedAt: row.startedAt,
        watchedAt: row.watchedAt,
        rating: row.rating,
        comment: row.comment
    };
}

/**
 * @function listEntries
 * @description Every title on the watchlist, the latest added first.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<Entry[]>} The titles.
 */
export async function listEntries(prisma: PrismaClient): Promise<Entry[]> {
    const rows = await prisma.watchlistEntry.findMany({ orderBy: { addedAt: 'desc' } });

    return rows.map(toEntry);
}

/**
 * @function addEntry
 * @description Puts a film or a series on the watchlist, to watch. What it is (its title, genres, saga) comes from the
 * catalog, not from the client, read in both of the portal's languages so the watchlist reads right in either.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {Variables} variables The environment.
 * @param {FastifyBaseLogger} logger The request logger.
 * @param {EntryCreate} create The title to add.
 *
 * @returns {Promise<Entry>} The title, as stored. Rejects with 409 when it is already on the watchlist.
 */
export async function addEntry(prisma: PrismaClient, variables: Variables, logger: FastifyBaseLogger, create: EntryCreate): Promise<Entry> {
    const existing = await prisma.watchlistEntry.findUnique({ where: { mediaType_tmdbId: { mediaType: create.mediaType, tmdbId: create.tmdbId } } });

    if (existing !== null) {
        throw new RequestError(StatusCodes.CONFLICT, 'This title is already on the watchlist');
    }

    const [english, french] = await Promise.all([
        titleDetails(variables, logger, create.mediaType, create.tmdbId, 'en'),
        titleDetails(variables, logger, create.mediaType, create.tmdbId, 'fr')
    ]);
    const row = await prisma.watchlistEntry.create({
        data: {
            tmdbId: french.tmdbId,
            mediaType: french.mediaType,
            titleEn: english.title,
            titleFr: french.title,
            originalTitle: french.originalTitle,
            releaseDate: french.releaseDate,
            posterPath: french.posterPath,
            genreIds: french.genres.map((genre) => genre.id),
            collectionId: french.collection?.id ?? null,
            collectionNameEn: english.collection?.name ?? null,
            collectionNameFr: french.collection?.name ?? null,
            runtime: french.runtime,
            seasons: french.seasons
        }
    });

    return toEntry(row);
}

/**
 * @function updateEntry
 * @description Moves a title between its three states and says what was thought of it. A title is to watch while it is
 * neither started nor watched, being watched once started, and watched once marked so. Only a watched title can be
 * rated and commented on; going back to being watched keeps its rating and its comment, going back to watch forgets
 * them.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The title's identifier on the watchlist.
 * @param {EntryUpdate} update What changes.
 *
 * @returns {Promise<Entry>} The title, as now stored. Rejects with 404 when there is no such title, and 400 when rating
 * or commenting on a title not watched.
 */
export async function updateEntry(prisma: PrismaClient, id: string, update: EntryUpdate): Promise<Entry> {
    const row = await prisma.watchlistEntry.findUnique({ where: { id } });

    if (row === null) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown title');
    }

    const watchedAt = update.watchedAt !== undefined ? update.watchedAt : row.watchedAt;
    const startedAt = update.startedAt !== undefined ? update.startedAt : row.startedAt;
    const isReviewing = (update.rating ?? null) !== null || (update.comment ?? null) !== null;

    if (watchedAt === null && startedAt === null) {
        if (isReviewing) {
            throw new RequestError(StatusCodes.BAD_REQUEST, 'A title still to watch has no rating or comment');
        }

        const reset = await prisma.watchlistEntry.update({ where: { id }, data: { startedAt: null, watchedAt: null, rating: null, comment: null } });

        return toEntry(reset);
    }

    if (watchedAt === null) {
        if (isReviewing) {
            throw new RequestError(StatusCodes.BAD_REQUEST, 'Only a watched title can be rated or commented on');
        }

        const watching = await prisma.watchlistEntry.update({ where: { id }, data: { startedAt, watchedAt: null } });

        return toEntry(watching);
    }

    const updated = await prisma.watchlistEntry.update({
        where: { id },
        data: {
            startedAt,
            watchedAt,
            rating: update.rating !== undefined ? update.rating : row.rating,
            comment: update.comment !== undefined ? update.comment : row.comment
        }
    });

    return toEntry(updated);
}

/**
 * @function removeEntry
 * @description Takes a title off the watchlist, with its rating and comment.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The title's identifier on the watchlist.
 *
 * @returns {Promise<void>} Resolves once it is gone. Rejects with 404 when there is no such title.
 */
export async function removeEntry(prisma: PrismaClient, id: string): Promise<void> {
    const { count } = await prisma.watchlistEntry.deleteMany({ where: { id } });

    if (count === 0) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown title');
    }
}
