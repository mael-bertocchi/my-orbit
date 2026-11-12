import type { Variables } from 'src/plugins/environment';

/**
 * @function testVariables
 * @description A whole environment for a test server, with the given variables in place of the defaults.
 *
 * @param {Partial<Variables>} overrides The variables the test cares about.
 *
 * @returns {Variables} The environment.
 */
export function testVariables(overrides: Partial<Variables> = {}): Variables {
    return {
        NODE_ENV: 'test',
        PORT: 0,
        DATABASE_URL: 'postgresql://test@localhost/test',
        IDENTITY_ORIGIN: 'https://orbit.example.fr',
        IDENTITY_OWNER_NAME: 'Owner',
        IDENTITY_ENROLLMENT_TOKEN: '',
        CORS_ORIGIN: '',
        JWT_SECRET: 'a-test-secret-that-is-at-least-thirty-two-characters',
        JWT_ACCESS_EXPIRY: '15m',
        JWT_REFRESH_EXPIRY: '30d',
        WATCHLIST_TMDB_TOKEN: 'a-test-tmdb-token',
        WATCHLIST_TMDB_URL: 'https://tmdb.example.fr/3',
        BUDGET_PLACES_URL: 'https://places.example.fr',
        GEOAPIFY_API_KEY: 'a-test-places-key',
        ...overrides
    };
}
