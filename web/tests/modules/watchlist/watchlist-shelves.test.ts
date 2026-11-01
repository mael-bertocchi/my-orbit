import { chooseLanguage } from 'modules/language/language-service';
import type { Entry } from 'modules/watchlist/watchlist-models';
import { isMediaType, isShelfOrder, matches, nextEpisode, ofKinds, seasonShare, shelves, statusOf, toWatch, watchedEntries, watchedIn, watchedShelves, watchedYears, watching } from 'modules/watchlist/watchlist-shelves';
import { describe, expect, it } from 'vitest';

/**
 * @function entry
 * @description A title on the watchlist, a film to watch unless told otherwise
 */
function entry(overrides: Partial<Entry>): Entry {
    return {
        id: String(overrides.tmdbId ?? 1),
        tmdbId: 1,
        mediaType: 'movie',
        title: { en: 'A film', fr: 'Un film' },
        originalTitle: 'A film',
        releaseDate: '2020-01-01',
        posterPath: null,
        genreIds: [],
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
        comment: null,
        ...overrides
    };
}

/**
 * @constant GENRES
 * @description Genre names, by identifier, in French
 */
const GENRES: ReadonlyMap<number, string> = new Map([
    [12, 'Aventure'],
    [18, 'Drame'],
    [35, 'Comédie'],
    [878, 'Science-Fiction']
]);

/**
 * @constant ENTRIES
 * @description Two films of a saga added in the wrong order, a film and a series of their own, and a watched film
 */
const ENTRIES: Entry[] = [
    entry({ tmdbId: 122, title: { en: 'The Return of the King', fr: 'The Return of the King' }, releaseDate: '2003-12-01', genreIds: [12, 14], collectionId: 119, collectionName: { en: 'The Lord of the Rings', fr: 'Le Seigneur des anneaux' }, addedAt: new Date('2026-10-03T10:00:00Z') }),
    entry({ tmdbId: 120, title: { en: 'The Fellowship of the Ring', fr: 'The Fellowship of the Ring' }, releaseDate: '2001-12-18', genreIds: [12], collectionId: 119, collectionName: { en: 'The Lord of the Rings', fr: 'Le Seigneur des anneaux' }, addedAt: new Date('2026-10-04T10:00:00Z') }),
    entry({ tmdbId: 550, title: { en: 'Fight Club', fr: 'Fight Club' }, genreIds: [18], addedAt: new Date('2026-10-02T10:00:00Z') }),
    entry({ tmdbId: 1399, mediaType: 'tv', title: { en: 'Game of Thrones', fr: 'Game of Thrones' }, genreIds: [10765, 18], addedAt: new Date('2026-10-05T10:00:00Z') }),
    entry({ tmdbId: 27205, title: { en: 'Inception', fr: 'Inception' }, genreIds: [878], watchedAt: new Date('2026-10-06T20:00:00Z'), rating: 9 })
];

describe('toWatch and ofKinds', () => {
    it('keeps the titles still to watch, of the kinds picked or all', () => {
        expect(toWatch(ENTRIES).map((found) => found.tmdbId)).toEqual([122, 120, 550, 1399]);
        expect(ofKinds(toWatch(ENTRIES), ['tv']).map((found) => found.tmdbId)).toEqual([1399]);
        expect(ofKinds(toWatch(ENTRIES), ['movie', 'tv'])).toHaveLength(4);
        expect(ofKinds(toWatch(ENTRIES), [])).toHaveLength(4);
    });
});

describe('shelves', () => {
    it('shelves by main genre, by name in the page language, the unknown genres last', () => {
        chooseLanguage('fr');
        const found = shelves(toWatch(ENTRIES), 'genre', GENRES);

        expect(found.map((shelf) => shelf.title)).toEqual(['Aventure', 'Drame', 'Autres genres']);
        expect(found[0].entries.map((shelved) => shelved.tmdbId)).toEqual([120, 122]);
        expect(found[2].entries.map((shelved) => shelved.tmdbId)).toEqual([1399]);
    });

    it('lists a saga in the order its films came out, whatever the order they were added in, named in the page language', () => {
        const found = shelves(toWatch(ENTRIES), 'saga', GENRES);

        expect(found.map((shelf) => shelf.title)).toEqual(['The Lord of the Rings', 'No saga']);
        chooseLanguage('fr');
        expect(shelves(toWatch(ENTRIES), 'saga', GENRES).map((shelf) => shelf.title)).toEqual(['Le Seigneur des anneaux', 'Hors saga']);
        expect(found[0].entries.map((shelved) => shelved.tmdbId)).toEqual([120, 122]);
        expect(found[1].entries.map((shelved) => shelved.tmdbId)).toEqual([1399, 550]);
    });

    it('puts everything on one untitled shelf, the latest added first', () => {
        const found = shelves(toWatch(ENTRIES), 'recent', GENRES);

        expect(found).toHaveLength(1);
        expect(found[0].title).toBeNull();
        expect(found[0].entries.map((shelved) => shelved.tmdbId)).toEqual([1399, 120, 122, 550]);
    });

    it('has no shelf for nothing', () => {
        expect(shelves([], 'recent', GENRES)).toEqual([]);
        expect(shelves([], 'genre', GENRES)).toEqual([]);
    });
});

describe('watchedEntries', () => {
    it('lists the watched titles the latest first, or the best rated first', () => {
        const watched = [
            entry({ tmdbId: 1, watchedAt: new Date('2026-10-01T20:00:00Z'), rating: 10 }),
            entry({ tmdbId: 2, watchedAt: new Date('2026-10-03T20:00:00Z'), rating: null }),
            entry({ tmdbId: 3, watchedAt: new Date('2026-10-02T20:00:00Z'), rating: 6 }),
            entry({ tmdbId: 4 })
        ];

        expect(watchedEntries(watched, 'recent').map((found) => found.tmdbId)).toEqual([2, 3, 1]);
        expect(watchedEntries(watched, 'best').map((found) => found.tmdbId)).toEqual([1, 3, 2]);
    });
});

describe('matches', () => {
    it('finds a title by any of its names, its saga or its comment, accents, capitals and word order aside', () => {
        const fellowship = entry({ title: { en: 'The Fellowship of the Ring', fr: 'La Communauté de l’anneau' }, originalTitle: 'The Lord of the Rings', collectionName: { en: 'The Lord of the Rings Collection', fr: 'Le Seigneur des anneaux - Saga' }, comment: 'Un monument.' });

        expect(matches(fellowship, '')).toBe(true);
        expect(matches(fellowship, '  communaute ')).toBe(true);
        expect(matches(fellowship, 'RING fellowship')).toBe(true);
        expect(matches(fellowship, 'seigneur saga')).toBe(true);
        expect(matches(fellowship, 'monument')).toBe(true);
        expect(matches(fellowship, 'matrix')).toBe(false);
        expect(matches(fellowship, 'ring matrix')).toBe(false);
    });
});

describe('address values', () => {
    it('recognizes the shelvings and the kinds, and nothing else', () => {
        expect(isShelfOrder('saga')).toBe(true);
        expect(isShelfOrder('rating')).toBe(false);
        expect(isShelfOrder(null)).toBe(false);
        expect(isMediaType('tv')).toBe(true);
        expect(isMediaType('all')).toBe(false);
        expect(isMediaType('person')).toBe(false);
    });
});

describe('the three statuses', () => {
    it('tells a title to watch, being watched and watched apart, and lists the ones being watched latest started first', () => {
        const started = entry({ tmdbId: 2, startedAt: new Date('2026-10-02T10:00:00Z') });
        const later = entry({ tmdbId: 3, mediaType: 'tv', startedAt: new Date('2026-10-05T10:00:00Z') });
        const rewatched = entry({ tmdbId: 4, startedAt: new Date('2026-10-01T10:00:00Z'), watchedAt: new Date('2026-10-03T10:00:00Z') });
        const list = [entry({ tmdbId: 1 }), started, later, rewatched];

        expect(list.map(statusOf)).toEqual(['toWatch', 'watching', 'watching', 'watched']);
        expect(toWatch(list).map((found) => found.tmdbId)).toEqual([1]);
        expect(watching(list).map((found) => found.tmdbId)).toEqual([3, 2]);
    });
});

describe('nextEpisode and seasonShare', () => {
    const series = (progress: Entry['progress'], episodeCounts: number[]): Entry => entry({ mediaType: 'tv', startedAt: new Date('2026-10-01T10:00:00Z'), progress, episodeCounts });

    it('starts at the first episode, goes on within a season, then to the next season, and stops at the last', () => {
        expect(nextEpisode(series(null, [10, 8]))).toEqual({ season: 1, episode: 1 });
        expect(nextEpisode(series({ season: 1, episode: 4 }, [10, 8]))).toEqual({ season: 1, episode: 5 });
        expect(nextEpisode(series({ season: 1, episode: 10 }, [10, 8]))).toEqual({ season: 2, episode: 1 });
        expect(nextEpisode(series({ season: 2, episode: 8 }, [10, 8]))).toBeNull();
    });

    it('just goes one episode further when the seasons are unknown', () => {
        expect(nextEpisode(series({ season: 3, episode: 12 }, []))).toEqual({ season: 3, episode: 13 });
        expect(seasonShare(series({ season: 3, episode: 12 }, []))).toBeNull();
    });

    it('tells how far into its season a series is', () => {
        expect(seasonShare(series({ season: 1, episode: 4 }, [10, 8]))).toBe(0.4);
        expect(seasonShare(series(null, [10, 8]))).toBeNull();
    });
});

describe('watchedShelves', () => {
    const seen = [
        entry({ tmdbId: 1, watchedAt: new Date('2026-10-06T20:00:00Z'), rating: 9 }),
        entry({ tmdbId: 2, watchedAt: new Date('2026-03-06T20:00:00Z'), rating: null }),
        entry({ tmdbId: 3, watchedAt: new Date('2025-12-06T20:00:00Z'), rating: 9 })
    ];

    it('shelves the watched titles by year, keeping their order', () => {
        const found = watchedShelves(watchedEntries(seen, 'recent'), 'recent', String);

        expect(found.map((shelf) => [shelf.title, shelf.entries.map((one) => one.tmdbId)])).toEqual([['2026', [1, 2]], ['2025', [3]]]);
    });

    it('lists the years titles were watched in, and keeps the years picked', () => {
        const ordered = watchedEntries(seen, 'recent');

        expect(watchedYears(ordered)).toEqual([2026, 2025]);
        expect(watchedIn(ordered, [2026]).map((one) => one.tmdbId)).toEqual([1, 2]);
        expect(watchedIn(ordered, [2026, 2025])).toHaveLength(3);
        expect(watchedIn(ordered, [])).toHaveLength(3);
    });

    it('shelves them by rating, the unrated last', () => {
        chooseLanguage('fr');

        const found = watchedShelves(watchedEntries(seen, 'best'), 'best', (rating) => `${rating / 2} ★`);

        expect(found.map((shelf) => [shelf.title, shelf.entries.map((one) => one.tmdbId)])).toEqual([['4.5 ★', [1, 3]], ['Pas noté', [2]]]);
    });
});
