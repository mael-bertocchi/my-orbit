import type { Maybe } from 'models';
import type { Language } from 'modules/language/language-models';
import { currentLanguage } from 'modules/language/language-service';
import type { Entry, EntryChanges, TitleReference, WatchlistServer, WatchlistSnapshot } from 'modules/watchlist/watchlist-models';
import { messageOf } from 'utils/errors';

/**
 * @class WatchlistStore
 * @description The watchlist as the page knows it: its titles once read, and the genres' names in the page's language.
 * A change waits for the server and only then shows, so the page never shows what the server refused.
 */
export class WatchlistStore {
    private readonly api: WatchlistServer; /*!< The server */
    private listeners = new Set<() => void>(); /*!< Who to tell about a new snapshot */
    private snapshot: WatchlistSnapshot = { entries: null, genres: new Map(), status: 'loading', error: null }; /*!< What the page renders */
    private reading: Maybe<Promise<void>> = null; /*!< The read in progress, shared by whoever asks meanwhile */
    private genresLanguage: Maybe<Language> = null; /*!< The language the genres were read in */

    /**
     * @constructor
     * @description Prepares an empty watchlist
     *
     * @param {WatchlistServer} api The server
     */
    constructor(api: WatchlistServer) {
        this.api = api;
    }

    /**
     * @function subscribe
     * @description Tells a listener about every new snapshot, until it unsubscribes
     */
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    /**
     * @function getSnapshot
     * @description The watchlist as the page renders it
     */
    getSnapshot = (): WatchlistSnapshot => this.snapshot;

    /**
     * @method refresh
     * @description Reads the titles again, and the genres if the page's language changed. A failure keeps what was read.
     */
    async refresh(): Promise<void> {
        this.reading ??= (async () => {
            try {
                const [entries] = await Promise.all([this.api.getEntries(), this.loadGenres()]);

                this.publish({ entries, status: 'ready', error: null });
            } catch (error: unknown) {
                this.publish({ status: this.snapshot.entries !== null ? 'ready' : 'failed', error: messageOf(error) });
            } finally {
                this.reading = null;
            }
        })();

        await this.reading;
    }

    /**
     * @method find
     * @description The watchlist's entry for a title, if it is on it
     *
     * @param {TitleReference} title The title
     * @returns {Maybe<Entry>} Its entry, or null
     */
    find(title: TitleReference): Maybe<Entry> {
        return this.snapshot.entries?.find((entry) => entry.mediaType === title.mediaType && entry.tmdbId === title.tmdbId) ?? null;
    }

    /**
     * @method add
     * @description Puts a title on the watchlist, to watch
     *
     * @param {TitleReference} title The title
     * @returns {Promise<Entry>} Its entry. Rejects with the server's refusal.
     */
    async add(title: TitleReference): Promise<Entry> {
        const entry = await this.api.addEntry(title);

        this.publish({ entries: [entry, ...(this.snapshot.entries ?? []).filter((existing) => existing.id !== entry.id)] });

        return entry;
    }

    /**
     * @method update
     * @description Marks a title watched or not, rates it, comments on it
     *
     * @param {string} id The title's identifier on the watchlist
     * @param {EntryChanges} changes What changes
     * @returns {Promise<Entry>} The entry, as now stored. Rejects with the server's refusal.
     */
    async update(id: string, changes: EntryChanges): Promise<Entry> {
        const entry = await this.api.updateEntry(id, changes);

        this.publish({ entries: (this.snapshot.entries ?? []).map((existing) => (existing.id !== id ? existing : entry)) });

        return entry;
    }

    /**
     * @method remove
     * @description Takes a title off the watchlist
     *
     * @param {string} id The title's identifier on the watchlist
     * @returns {Promise<void>} Resolves once it is gone. Rejects with the server's refusal.
     */
    async remove(id: string): Promise<void> {
        await this.api.removeEntry(id);

        this.publish({ entries: (this.snapshot.entries ?? []).filter((existing) => existing.id !== id) });
    }

    /**
     * @method reset
     * @description Forgets the watchlist, once the session is over
     */
    reset(): void {
        this.genresLanguage = null;
        this.publish({ entries: null, genres: new Map(), status: 'loading', error: null });
    }

    /**
     * @method loadGenres
     * @description Reads the genres' names in the page's language, unless they already are. Without them the titles
     * still show, under no genre.
     */
    private async loadGenres(): Promise<void> {
        const language = currentLanguage();

        if (this.genresLanguage === language) {
            return;
        }

        try {
            const genres = await this.api.getGenres();

            this.genresLanguage = language;
            this.publish({ genres: new Map(genres.map((genre) => [genre.id, genre.name])) });
        } catch {
            return;
        }
    }

    /**
     * @method publish
     * @description Rebuilds the snapshot and tells the listeners
     *
     * @param {Partial<WatchlistSnapshot>} changes What changed
     */
    private publish(changes: Partial<WatchlistSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...changes };

        for (const listener of this.listeners) {
            listener();
        }
    }
}
