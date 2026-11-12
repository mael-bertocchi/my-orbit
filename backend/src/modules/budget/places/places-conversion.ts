import type { PlacesContext } from 'src/modules/budget/places/places-service';
import { findPlaceNamed } from 'src/modules/budget/places/places-service';
import { bumpRevision, DEFAULT_MONTHLY_LIMIT } from 'src/modules/budget/state/state-service';
import { OWNER_ID } from 'src/plugins/identity';

/**
 * @constant CONVERSION_PAUSE
 * @description How long to wait between two places looked up, in milliseconds, so Photon, a free public service that
 * turns away the servers asking it too much, is never asked in a burst.
 */
const CONVERSION_PAUSE = 2 * 1000;

/**
 * @function pause
 * @description Waits a while.
 *
 * @param {number} duration How long, in milliseconds.
 *
 * @returns {Promise<void>} Resolves once the time has passed.
 */
async function pause(duration: number): Promise<void> {
    await new Promise((resolve) => {
        setTimeout(resolve, duration);
    });
}

/**
 * @function writtenPlaces
 * @description The places written by hand, without a city, of the operations and the recurring ones, each once.
 *
 * @param {PlacesContext} context What it works with.
 *
 * @returns {Promise<string[]>} The places, as written.
 */
async function writtenPlaces(context: PlacesContext): Promise<string[]> {
    const unplaced = { placeId: null, location: { not: null } };
    const [operations, recurring] = await Promise.all([context.prisma.budgetOperation.findMany({ where: unplaced, select: { location: true }, distinct: ['location'] }), context.prisma.budgetRecurringOperation.findMany({ where: unplaced, select: { location: true }, distinct: ['location'] })]);
    const places = new Set<string>();

    for (const row of [...operations, ...recurring]) {
        if (row.location !== null && row.location.trim() !== '') {
            places.add(row.location);
        }
    }

    return [...places];
}

/**
 * @function isConverted
 * @description Whether the places written by hand were already all looked up once.
 *
 * @param {PlacesContext} context What it works with.
 *
 * @returns {Promise<boolean>} Whether they were.
 */
async function isConverted(context: PlacesContext): Promise<boolean> {
    const state = await context.prisma.budgetState.findUnique({ where: { id: OWNER_ID }, select: { placesConvertedAt: true } });

    return state !== null && state.placesConvertedAt !== null;
}

/**
 * @function convertWrittenPlaces
 * @description Gives a city to the operations, and the recurring ones, whose place was written by hand before cities were
 * checked, when that place names a city Photon knows, one place at a time. It runs once: when every place was looked up,
 * the budget remembers it, and a place naming no city keeps its text for good. When Photon can't be reached, it stops at
 * once rather than insist, and starts over at the next start. The revision moves on once anything changed, so the apps
 * read the cities. Run as the server starts, it never stops it: a failure is only logged.
 *
 * @param {PlacesContext} context What it works with.
 *
 * @returns {Promise<void>} Resolves once every place was tried, or Photon couldn't be reached.
 */
export async function convertWrittenPlaces(context: PlacesContext): Promise<void> {
    try {
        if (await isConverted(context)) {
            return;
        }

        let converted = 0;

        for (const location of await writtenPlaces(context)) {
            const place = await findPlaceNamed(context, location);

            if (place !== null) {
                const where = { placeId: null, location };
                const [operations, recurring] = await context.prisma.$transaction([context.prisma.budgetOperation.updateMany({ where, data: { placeId: place.id } }), context.prisma.budgetRecurringOperation.updateMany({ where, data: { placeId: place.id } })]);

                converted += operations.count + recurring.count;
            }

            await pause(CONVERSION_PAUSE);
        }

        const convertedAt = new Date();

        await context.prisma.$transaction(async (transaction) => {
            if (converted > 0) {
                await bumpRevision(transaction);
            }
            await transaction.budgetState.upsert({ where: { id: OWNER_ID }, update: { placesConvertedAt: convertedAt }, create: { id: OWNER_ID, monthlyLimit: DEFAULT_MONTHLY_LIMIT, placesConvertedAt: convertedAt } });
        });
        context.logger.info({ converted }, 'Places written by hand given their city');
    } catch (error: unknown) {
        context.logger.error({ err: error }, 'Places written by hand could not be given their city');
    }
}
