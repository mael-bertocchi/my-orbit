import type { Maybe } from 'models';
import { currentLanguage, t } from 'modules/language/language-service';
import { localized } from 'modules/watchlist/watchlist-formatting';
import type { Entry, EntryStatus, MediaType } from 'modules/watchlist/watchlist-models';

/**
 * @type ShelfOrder
 * @description How the titles to watch are shelved: by genre, by saga, or as one shelf, the latest added first.
 */
export type ShelfOrder = 'genre' | 'saga' | 'recent';

/**
 * @type WatchedOrder
 * @description How the watched titles are listed: the latest watched first, or the best rated first.
 */
export type WatchedOrder = 'recent' | 'best';

/**
 * @interface Shelf
 * @description A titled group of titles.
 */
export interface Shelf {
    key: string; /*!< What tells it apart */
    title: Maybe<string>; /*!< Its title, or null for the one untitled shelf */
    entries: Entry[]; /*!< Its titles, in order */
}

/**
 * @constant SHELF_ORDERS
 * @description Every way to shelve the titles to watch, in the order the page offers them.
 */
export const SHELF_ORDERS: readonly ShelfOrder[] = ['genre', 'saga', 'recent'];

/**
 * @constant MEDIA_TYPES
 * @description Every kind of title, in the order the filters offer them.
 */
export const MEDIA_TYPES: readonly MediaType[] = ['movie', 'tv'];

/**
 * @function isShelfOrder
 * @description Whether a value from the address is a way to shelve the titles.
 */
export function isShelfOrder(value: Maybe<string>): value is ShelfOrder {
    return SHELF_ORDERS.some((order) => order === value);
}

/**
 * @function isWatchedOrder
 * @description Whether a value from the address is a way to list the watched titles.
 */
export function isWatchedOrder(value: Maybe<string>): value is WatchedOrder {
    return value === 'recent' || value === 'best';
}

/**
 * @function isMediaType
 * @description Whether a value from the address is a kind of title.
 */
export function isMediaType(value: string): value is MediaType {
    return MEDIA_TYPES.some((kind) => kind === value);
}

/**
 * @function byAdded
 * @description Orders titles the latest added first.
 */
function byAdded(first: Entry, second: Entry): number {
    return second.addedAt.getTime() - first.addedAt.getTime();
}

/**
 * @function byRelease
 * @description Orders titles by the day they came out, the ones without a date last.
 */
function byRelease(first: Entry, second: Entry): number {
    if (first.releaseDate === second.releaseDate) {
        return byAdded(first, second);
    }

    if (first.releaseDate === null) {
        return 1;
    }

    if (second.releaseDate === null) {
        return -1;
    }

    return first.releaseDate < second.releaseDate ? -1 : 1;
}

/**
 * @function byTitle
 * @description Orders shelves by title in the page's language, the untitled-by-nature ones last.
 */
function byTitle(last: string): (first: Shelf, second: Shelf) => number {
    return (first: Shelf, second: Shelf): number => {
        if (first.key === last || second.key === last) {
            return first.key === last ? 1 : -1;
        }

        return (first.title ?? '').localeCompare(second.title ?? '', currentLanguage());
    };
}

/**
 * @function folded
 * @description A text as a search compares it: without accents or capitals
 *
 * @param {string} text The text
 * @returns {string} The text, folded
 */
function folded(text: string): string {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}

/**
 * @function matches
 * @description Whether a title answers a search: its title in either language, its original title, its saga or what was
 * said about it holds every word typed, accents and capitals aside. An empty search matches everything.
 *
 * @param {Entry} entry The title
 * @param {string} query What was typed
 * @returns {boolean} Whether it matches
 */
export function matches(entry: Entry, query: string): boolean {
    const words = folded(query).split(/\s+/).filter((word) => word !== '');

    if (words.length === 0) {
        return true;
    }

    const texts = [entry.title.en, entry.title.fr, entry.originalTitle, entry.collectionName?.en, entry.collectionName?.fr, entry.comment];
    const haystack = folded(texts.filter((text) => text !== undefined && text !== null).join(' '));

    return words.every((word) => haystack.includes(word));
}

/**
 * @function statusOf
 * @description Where a title stands: watched once marked so, being watched once started, to watch otherwise.
 *
 * @param {Entry} entry The title
 * @returns {EntryStatus} Its status
 */
export function statusOf(entry: Entry): EntryStatus {
    if (entry.watchedAt !== null) {
        return 'watched';
    }

    return entry.startedAt === null ? 'toWatch' : 'watching';
}

/**
 * @function toWatch
 * @description The titles still to watch: neither started nor watched.
 *
 * @param {Entry[]} entries The watchlist
 * @returns {Entry[]} The titles to watch
 */
export function toWatch(entries: Entry[]): Entry[] {
    return entries.filter((entry) => statusOf(entry) === 'toWatch');
}

/**
 * @function watching
 * @description The titles being watched, the latest started first.
 *
 * @param {Entry[]} entries The watchlist
 * @returns {Entry[]} The titles being watched
 */
export function watching(entries: Entry[]): Entry[] {
    const started = (entry: Entry): number => entry.startedAt?.getTime() ?? 0;

    return entries.filter((entry) => statusOf(entry) === 'watching').sort((first, second) => started(second) - started(first));
}

/**
 * @function ofKinds
 * @description The titles of the kinds picked, or all of them when none is.
 *
 * @param {Entry[]} entries The titles
 * @param {readonly MediaType[]} kinds The kinds to keep
 * @returns {Entry[]} The titles kept
 */
export function ofKinds(entries: Entry[], kinds: readonly MediaType[]): Entry[] {
    return kinds.length === 0 ? entries : entries.filter((entry) => kinds.includes(entry.mediaType));
}

/**
 * @function group
 * @description Puts titles on shelves by a key, keeping each shelf's title.
 */
function group(entries: Entry[], keyOf: (entry: Entry) => [string, string]): Shelf[] {
    const shelves = new Map<string, Shelf>();

    for (const entry of entries) {
        const [key, title] = keyOf(entry);
        const shelf = shelves.get(key) ?? { key, title, entries: [] };

        shelf.entries.push(entry);
        shelves.set(key, shelf);
    }

    return [...shelves.values()];
}

/**
 * @function shelves
 * @description Shelves the titles to watch. By genre, a title goes under its main genre (the first the catalog gives),
 * the latest added first. By saga, a saga's films follow one another in the order they came out, and the titles of no
 * saga come last. Otherwise all titles share one shelf, the latest added first.
 *
 * @param {Entry[]} entries The titles to shelve
 * @param {ShelfOrder} order How to shelve them
 * @param {ReadonlyMap<number, string>} genres Every genre's name, by identifier
 * @returns {Shelf[]} The shelves, in order
 */
export function shelves(entries: Entry[], order: ShelfOrder, genres: ReadonlyMap<number, string>): Shelf[] {
    if (order === 'recent') {
        return entries.length === 0 ? [] : [{ key: 'recent', title: null, entries: [...entries].sort(byAdded) }];
    }

    if (order === 'genre') {
        return group(entries, (entry) => {
            const name = entry.genreIds.length === 0 ? undefined : genres.get(entry.genreIds[0]);

            return name === undefined ? ['genre:none', t('watchlist.noGenre')] : [`genre:${entry.genreIds[0]}`, name];
        })
            .map((shelf) => ({ ...shelf, entries: shelf.entries.sort(byAdded) }))
            .sort(byTitle('genre:none'));
    }

    return group(entries, (entry) => (entry.collectionId === null ? ['saga:none', t('watchlist.noSaga')] : [`saga:${entry.collectionId}`, entry.collectionName === null ? '' : localized(entry.collectionName)]))
        .map((shelf) => ({ ...shelf, entries: shelf.entries.sort(shelf.key === 'saga:none' ? byAdded : byRelease) }))
        .sort(byTitle('saga:none'));
}

/**
 * @function watchedShelves
 * @description Shelves the watched titles: by the year they were watched, the latest first, or by rating, the best
 * first, the unrated last. Each shelf keeps the order it is given.
 *
 * @param {Entry[]} entries The watched titles, already in order
 * @param {WatchedOrder} order How they are ordered
 * @param {(rating: number) => string} ratingTitle How a rating's shelf is called
 * @returns {Shelf[]} The shelves, in order
 */
export function watchedShelves(entries: Entry[], order: WatchedOrder, ratingTitle: (rating: number) => string): Shelf[] {
    if (order === 'best') {
        return group(entries, (entry) => (entry.rating === null ? ['rating:none', t('watchlist.notRated')] : [`rating:${entry.rating}`, ratingTitle(entry.rating)]));
    }

    return group(entries, (entry) => {
        const year = String(entry.watchedAt?.getFullYear() ?? '');

        return [`year:${year}`, year];
    });
}

/**
 * @function watchedYears
 * @description Every year a title was watched in, the latest first.
 *
 * @param {Entry[]} entries The watchlist
 * @returns {number[]} The years
 */
export function watchedYears(entries: Entry[]): number[] {
    const years = new Set(entries.filter((entry) => entry.watchedAt !== null).map((entry) => entry.watchedAt?.getFullYear() ?? 0));

    return [...years].sort((first, second) => second - first);
}

/**
 * @function watchedIn
 * @description The titles watched in any of the years picked, or all of them when none is.
 *
 * @param {Entry[]} entries The watched titles
 * @param {readonly number[]} years The years to keep
 * @returns {Entry[]} The titles kept, in the same order
 */
export function watchedIn(entries: Entry[], years: readonly number[]): Entry[] {
    return years.length === 0 ? entries : entries.filter((entry) => years.includes(entry.watchedAt?.getFullYear() ?? 0));
}

/**
 * @function watchedEntries
 * @description The watched titles, the latest watched first, or the best rated first (then the latest watched).
 *
 * @param {Entry[]} entries The watchlist
 * @param {WatchedOrder} order How to list them
 * @returns {Entry[]} The watched titles, in order
 */
export function watchedEntries(entries: Entry[], order: WatchedOrder): Entry[] {
    const latest = (first: Entry, second: Entry): number => (second.watchedAt?.getTime() ?? 0) - (first.watchedAt?.getTime() ?? 0);

    return entries
        .filter((entry) => entry.watchedAt !== null)
        .sort((first, second) => (order === 'best' ? (second.rating ?? 0) - (first.rating ?? 0) || latest(first, second) : latest(first, second)));
}
