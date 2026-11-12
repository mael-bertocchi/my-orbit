import { vi } from 'vitest';

/**
 * @interface GeoapifyCity
 * @description A city as the Geoapify stand-in knows it, named in both languages
 */
export interface GeoapifyCity {
    id: string; /*!< Its identity, such as `R71525` */
    en: string; /*!< Its name in English */
    fr: string; /*!< Its name in French */
    state?: string; /*!< Its region */
    country?: string; /*!< Its country, the same in both languages for the tests */
}

/**
 * @function resultOf
 * @description What Geoapify says of a city, in a language, its position made up from its identity.
 *
 * @param {GeoapifyCity} city The city.
 * @param {string} language The language asked.
 *
 * @returns {Record<string, unknown>} What it says.
 */
export function resultOf(city: GeoapifyCity, language: string): Record<string, unknown> {
    const name = language === 'fr' ? city.fr : city.en;
    const number = Number(city.id.slice(1));
    const raw = { osm_type: city.id.slice(0, 1).toLowerCase(), osm_id: number };

    return { name, city: name, state: city.state, country: city.country, result_type: 'city', lat: (number % 90) / 1.5, lon: (number % 180) / 1.5, datasource: { sourcename: 'openstreetmap', raw } };
}

/**
 * @function stubGeoapify
 * @description Replaces `fetch` with a Geoapify stand-in answering each question with what `answer` gives for it, and
 * records the addresses asked.
 *
 * @param {(url: URL) => unknown[]} answer What Geoapify says of each place found, for an address.
 * @param {number} status The status it answers with.
 *
 * @returns {URL[]} The addresses asked, filled in as they are asked.
 */
export function stubGeoapify(answer: (url: URL) => unknown[], status: number = 200): URL[] {
    const calls: URL[] = [];

    vi.stubGlobal('fetch', vi.fn((input: string) => {
        const url = new URL(input);

        calls.push(url);

        const body = { results: answer(url) };

        return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    }));

    return calls;
}

/**
 * @function stubCities
 * @description Replaces `fetch` with a Geoapify stand-in whose searches find the given cities, named in the language asked,
 * and whose reverse lookups find the given place.
 *
 * @param {GeoapifyCity[]} cities The cities its searches find.
 * @param {GeoapifyCity[]} nearest The cities its reverse lookups find.
 *
 * @returns {URL[]} The addresses asked.
 */
export function stubCities(cities: GeoapifyCity[], nearest: GeoapifyCity[] = []): URL[] {
    return stubGeoapify((url) => {
        const found = url.pathname.endsWith('/reverse') ? nearest : cities;

        return found.map((city) => resultOf(city, url.searchParams.get('lang') ?? 'en'));
    });
}
