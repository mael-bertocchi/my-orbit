import { chooseLanguage, currentLanguage } from 'modules/language/language-service';
import type { Entry, EntryChanges, TitleReference, WatchlistServer } from 'modules/watchlist/watchlist-models';
import { WatchlistStore } from 'modules/watchlist/watchlist-store';
import { RequestError } from 'utils/request';
import { describe, expect, it, vi } from 'vitest';

/**
 * @function entry
 * @description A title on the watchlist
 */
function entry(id: string, tmdbId: number): Entry {
    return {
        id,
        tmdbId,
        mediaType: 'movie',
        title: { en: `Film ${tmdbId}`, fr: `Film ${tmdbId}` },
        originalTitle: `Film ${tmdbId}`,
        releaseDate: null,
        posterPath: null,
        genreIds: [18],
        collectionId: null,
        collectionName: null,
        runtime: null,
        seasons: null,
        episodeCounts: [],
        addedAt: new Date('2026-10-01T10:00:00Z'),
        startedAt: null,
        progress: null,
        watchedAt: null,
        rating: null,
        comment: null
    };
}

/**
 * @interface FakeServer
 * @description A fake server holding a watchlist, and whether it can be reached
 */
interface FakeServer {
    stored: Entry[]; /*!< The titles it holds */
    offline: boolean; /*!< Whether it is unreachable */
    api: WatchlistServer; /*!< Its routes */
}

/**
 * @function server
 * @description A fake server holding one title, refusing a title it already holds, naming genres in the page's language
 */
function server(): FakeServer {
    const fake: FakeServer = {
        stored: [entry('a', 550)],
        offline: false,
        api: {
            getEntries: vi.fn(() => (fake.offline ? Promise.reject(new RequestError(0, "Can't reach the server.")) : Promise.resolve([...fake.stored]))),
            addEntry: vi.fn((title: TitleReference) => {
                if (fake.stored.some((stored) => stored.tmdbId === title.tmdbId)) {
                    return Promise.reject(new RequestError(409, 'This title is already on your watchlist.'));
                }

                const added = entry(`id-${title.tmdbId}`, title.tmdbId);

                fake.stored = [added, ...fake.stored];

                return Promise.resolve(added);
            }),
            updateEntry: vi.fn((id: string, changes: EntryChanges) => {
                const index = fake.stored.findIndex((stored) => stored.id === id);

                fake.stored[index] = { ...fake.stored[index], ...changes };

                return Promise.resolve(fake.stored[index]);
            }),
            removeEntry: vi.fn((id: string) => {
                fake.stored = fake.stored.filter((stored) => stored.id !== id);

                return Promise.resolve();
            }),
            getGenres: vi.fn(() => Promise.resolve([{ id: 18, name: currentLanguage() === 'fr' ? 'Drame' : 'Drama' }]))
        }
    };

    return fake;
}

describe('WatchlistStore', () => {
    it('reads the titles and the genres, telling its listeners', async () => {
        const fake = server();
        const store = new WatchlistStore(fake.api);
        const listener = vi.fn();

        store.subscribe(listener);
        await store.refresh();

        expect(store.getSnapshot().status).toBe('ready');
        expect(store.getSnapshot().entries?.map((stored) => stored.tmdbId)).toEqual([550]);
        expect(store.getSnapshot().genres.get(18)).toBe('Drama');
        expect(listener).toHaveBeenCalled();
    });

    it('shares one read between whoever asks at the same time', async () => {
        const fake = server();
        const store = new WatchlistStore(fake.api);

        await Promise.all([store.refresh(), store.refresh()]);

        expect(fake.api.getEntries).toHaveBeenCalledTimes(1);
    });

    it('reads the genres again only once the language changes', async () => {
        const fake = server();
        const store = new WatchlistStore(fake.api);

        await store.refresh();
        await store.refresh();

        expect(fake.api.getGenres).toHaveBeenCalledTimes(1);

        chooseLanguage('fr');
        await store.refresh();

        expect(fake.api.getGenres).toHaveBeenCalledTimes(2);
        expect(store.getSnapshot().genres.get(18)).toBe('Drame');
    });

    it('fails a first read, and keeps what it has on a later one', async () => {
        const fake = server();
        const store = new WatchlistStore(fake.api);

        fake.offline = true;
        await store.refresh();

        expect(store.getSnapshot()).toMatchObject({ entries: null, status: 'failed', error: "Can't reach the server." });

        fake.offline = false;
        await store.refresh();
        fake.offline = true;
        await store.refresh();

        expect(store.getSnapshot().status).toBe('ready');
        expect(store.getSnapshot().entries).toHaveLength(1);
    });

    it('adds, updates and removes a title once the server has', async () => {
        const fake = server();
        const store = new WatchlistStore(fake.api);

        await store.refresh();

        const added = await store.add({ mediaType: 'movie', tmdbId: 120 });

        expect(store.find({ mediaType: 'movie', tmdbId: 120 })?.id).toBe(added.id);

        await store.update(added.id, { watchedAt: new Date('2026-10-12T20:00:00Z'), rating: 8 });

        expect(store.find({ mediaType: 'movie', tmdbId: 120 })?.rating).toBe(8);

        await store.remove(added.id);

        expect(store.find({ mediaType: 'movie', tmdbId: 120 })).toBeNull();
        expect(store.getSnapshot().entries).toHaveLength(1);
    });

    it('shows nothing the server refused', async () => {
        const fake = server();
        const store = new WatchlistStore(fake.api);

        await store.refresh();

        await expect(store.add({ mediaType: 'movie', tmdbId: 550 })).rejects.toThrow('This title is already on your watchlist.');
        expect(store.getSnapshot().entries).toHaveLength(1);
    });

    it('forgets everything once the session is over', async () => {
        const store = new WatchlistStore(server().api);

        await store.refresh();
        store.reset();

        expect(store.getSnapshot()).toMatchObject({ entries: null, status: 'loading' });
        expect(store.getSnapshot().genres.size).toBe(0);
    });
});
