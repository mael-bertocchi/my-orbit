import { vi } from 'vitest';

/**
 * @constant TMDB_ANSWERS
 * @description What the catalog stand-in answers, by endpoint: a saga's first film, a series, the saga, a search and
 * the genres, shaped like TMDB's answers.
 */
export const TMDB_ANSWERS: Record<string, unknown> = {
    '/movie/120': {
        id: 120,
        title: 'Le Seigneur des anneaux : La Communauté de l’anneau',
        original_title: 'The Lord of the Rings: The Fellowship of the Ring',
        release_date: '2001-12-18',
        poster_path: '/fellowship.jpg',
        overview: 'Un jeune hobbit hérite d’un anneau.',
        runtime: 179,
        genres: [{ id: 12, name: 'Aventure' }, { id: 14, name: 'Fantastique' }],
        belongs_to_collection: { id: 119, name: 'Le Seigneur des anneaux - Saga', poster_path: '/saga.jpg' }
    },
    '/movie/120/watch/providers': {
        id: 120,
        results: {
            FR: {
                link: 'https://www.themoviedb.org/movie/120/watch?locale=FR',
                flatrate: [
                    { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg', display_priority: 3 },
                    { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg', display_priority: 1 }
                ],
                rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.jpg', display_priority: 4 }],
                buy: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.jpg', display_priority: 4 }],
                ads: [{ provider_id: 300, provider_name: 'Pluto TV', logo_path: null, display_priority: 9 }]
            },
            US: {
                link: 'https://www.themoviedb.org/movie/120/watch?locale=US',
                flatrate: [{ provider_id: 1899, provider_name: 'Max', logo_path: '/max.jpg', display_priority: 1 }]
            }
        }
    },
    '/tv/1399': {
        id: 1399,
        name: 'Game of Thrones',
        original_name: 'Game of Thrones',
        first_air_date: '2011-04-17',
        poster_path: '/got.jpg',
        overview: 'Neuf familles nobles se disputent le contrôle de Westeros.',
        number_of_seasons: 8,
        genres: [{ id: 10765, name: 'Science-Fiction & Fantastique' }, { id: 18, name: 'Drame' }]
    },
    '/tv/1399/watch/providers': {
        id: 1399,
        results: {}
    },
    '/collection/119': {
        id: 119,
        name: 'Le Seigneur des anneaux - Saga',
        parts: [
            { id: 122, title: 'Le Retour du roi', original_title: 'The Return of the King', release_date: '2003-12-01', poster_path: '/king.jpg', overview: '' },
            { id: 999, title: 'Un film annoncé', original_title: 'An announced film', release_date: '', poster_path: null, overview: '' },
            { id: 120, title: 'La Communauté de l’anneau', original_title: 'The Fellowship of the Ring', release_date: '2001-12-18', poster_path: '/fellowship.jpg', overview: '' },
            { id: 121, title: 'Les Deux Tours', original_title: 'The Two Towers', release_date: '2002-12-18', poster_path: '/towers.jpg', overview: '' }
        ]
    },
    '/search/multi': {
        page: 1,
        results: [
            { media_type: 'movie', id: 120, title: 'La Communauté de l’anneau', original_title: 'The Fellowship of the Ring', release_date: '2001-12-18', poster_path: '/fellowship.jpg', overview: 'Un anneau.' },
            { media_type: 'person', id: 1327, name: 'Ian McKellen', known_for: [] },
            { media_type: 'tv', id: 1399, name: 'Game of Thrones', original_name: 'Game of Thrones', first_air_date: '2011-04-17', poster_path: null, overview: '' },
            { media_type: 'movie', id: 404, title: 'Sans date', original_title: 'Undated', release_date: '' }
        ]
    },
    '/genre/movie/list': {
        genres: [{ id: 28, name: 'Action' }, { id: 18, name: 'Drame' }, { id: 12, name: 'Aventure' }]
    },
    '/genre/tv/list': {
        genres: [{ id: 18, name: 'Drame' }, { id: 10765, name: 'Science-Fiction & Fantastique' }]
    }
};

/**
 * @constant TMDB_ENGLISH_ANSWERS
 * @description What the catalog stand-in answers instead when asked in English, for the endpoints whose text differs.
 */
export const TMDB_ENGLISH_ANSWERS: Record<string, unknown> = {
    '/movie/120': {
        id: 120,
        title: 'The Lord of the Rings: The Fellowship of the Ring',
        original_title: 'The Lord of the Rings: The Fellowship of the Ring',
        release_date: '2001-12-18',
        poster_path: '/fellowship-en.jpg',
        overview: 'A young hobbit inherits a ring.',
        runtime: 179,
        genres: [{ id: 12, name: 'Adventure' }, { id: 14, name: 'Fantasy' }],
        belongs_to_collection: { id: 119, name: 'The Lord of the Rings Collection', poster_path: '/saga.jpg' }
    }
};

/**
 * @interface CatalogCall
 * @description One question the code under test asked the catalog stand-in.
 */
export interface CatalogCall {
    path: string; /*!< The endpoint, from the catalog's address */
    query: URLSearchParams; /*!< Its parameters */
    authorization: string; /*!< The token it sent */
}

/**
 * @function stubCatalog
 * @description Replaces `fetch` with a catalog stand-in answering from `TMDB_ANSWERS` (or `TMDB_ENGLISH_ANSWERS` when asked
 * in English), or 404 for anything else, and records every question.
 *
 * @param {string} base The catalog's address the code under test uses.
 * @param {Record<string, number>} failures Endpoints that answer with an error status instead.
 *
 * @returns {CatalogCall[]} The questions, filled in as they are asked.
 */
export function stubCatalog(base: string, failures: Record<string, number> = {}): CatalogCall[] {
    const calls: CatalogCall[] = [];

    vi.stubGlobal('fetch', vi.fn((input: string, init: RequestInit) => {
        const url = new URL(input);
        const path = url.pathname.slice(new URL(base).pathname.length);
        const headers = new Headers(init.headers);

        calls.push({ path, query: url.searchParams, authorization: headers.get('Authorization') ?? '' });

        const answers = url.searchParams.get('language') === 'en-US' && path in TMDB_ENGLISH_ANSWERS ? TMDB_ENGLISH_ANSWERS : TMDB_ANSWERS;
        const status = failures[path] ?? (path in answers ? 200 : 404);
        const body = status === 200 ? answers[path] : { status_message: 'The resource you requested could not be found.' };

        return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    }));

    return calls;
}
