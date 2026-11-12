import { vi } from 'vitest';

/**
 * @interface PhotonCity
 * @description A city as the Photon stand-in knows it, named in both languages
 */
export interface PhotonCity {
    id: string; /*!< Its identity, such as `R71525` */
    en: string; /*!< Its name in English */
    fr: string; /*!< Its name in French */
    state?: string; /*!< Its region */
    country?: string; /*!< Its country, the same in both languages for the tests */
}

/**
 * @function propertiesOf
 * @description What Photon says of a city, in a language.
 *
 * @param {PhotonCity} city The city.
 * @param {string} language The language asked.
 *
 * @returns {Record<string, unknown>} Its properties.
 */
export function propertiesOf(city: PhotonCity, language: string): Record<string, unknown> {
    return { osm_type: city.id.slice(0, 1), osm_id: Number(city.id.slice(1)), name: language === 'fr' ? city.fr : city.en, type: 'city', state: city.state, country: city.country };
}

/**
 * @function stubPhoton
 * @description Replaces `fetch` with a Photon stand-in answering each question with what `answer` gives for it, and
 * records the addresses asked.
 *
 * @param {(url: URL) => unknown[]} answer What Photon says of each place found, for an address.
 * @param {number} status The status it answers with.
 *
 * @returns {URL[]} The addresses asked, filled in as they are asked.
 */
export function stubPhoton(answer: (url: URL) => unknown[], status: number = 200): URL[] {
    const calls: URL[] = [];

    vi.stubGlobal('fetch', vi.fn((input: string) => {
        const url = new URL(input);

        calls.push(url);

        const body = { type: 'FeatureCollection', features: answer(url).map((properties) => ({ type: 'Feature', properties })) };

        return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    }));

    return calls;
}

/**
 * @function stubCities
 * @description Replaces `fetch` with a Photon stand-in whose searches find the given cities, named in the language asked,
 * and whose reverse lookups find the given place.
 *
 * @param {PhotonCity[]} cities The cities its searches find.
 * @param {unknown[]} nearest What its reverse lookups find.
 *
 * @returns {URL[]} The addresses asked.
 */
export function stubCities(cities: PhotonCity[], nearest: unknown[] = []): URL[] {
    return stubPhoton((url) => {
        if (url.pathname.endsWith('/reverse')) {
            return nearest;
        }

        return cities.map((city) => propertiesOf(city, url.searchParams.get('lang') ?? 'en'));
    });
}
