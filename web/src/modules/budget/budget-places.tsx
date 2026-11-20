import type { Maybe } from 'models';
import { foldText } from 'modules/budget/budget-math';
import type { Place, PlaceReference } from 'modules/budget/budget-models';
import budgetService from 'modules/budget/budget-service';
import { t } from 'modules/language/language-service';
import { useEffect, useState } from 'react';
import { UserError } from 'utils/errors';
import { RequestError } from 'utils/request';

/**
 * @constant SEARCH_DELAY
 * @description How long typing must pause before the server is asked for names or cities, in milliseconds, so a word
 * typed fast asks once.
 */
const SEARCH_DELAY = 250;

/**
 * @constant MIN_QUERY
 * @description How many letters the server needs to suggest cities.
 */
const MIN_QUERY = 2;

/**
 * @constant LOCATE_OPTIONS
 * @description How the position is asked for: a city needs no precision, and a position a few minutes old still tells it.
 */
const LOCATE_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10 * 1000, maximumAge: 5 * 60 * 1000 };

/**
 * @interface CityValue
 * @description What the city field holds: what is written, and the city picked, if any
 */
export interface CityValue {
    location: string; /*!< The place as it reads in the field */
    place: Maybe<PlaceReference>; /*!< The city picked, none while one is being typed */
}

/**
 * @function isCityChosen
 * @description Whether the field can be saved as it is: empty, or a city picked from the suggestions or located. A place
 * written before cities were checked, which the server couldn't match to a city, may stay as it was written.
 *
 * @param {CityValue} value What the field holds
 * @param {Maybe<string>} kept The place written before cities were checked, which may stay, if any
 * @returns {boolean} Whether it can be saved
 */
export function isCityChosen(value: CityValue, kept: Maybe<string>): boolean {
    return value.location.trim() === '' || value.place !== null || (kept !== null && value.location === kept);
}

/**
 * @interface FoundPlaces
 * @description The cities suggested for what was typed.
 */
interface FoundPlaces {
    query: string; /*!< What was typed */
    earlier: PlaceReference[]; /*!< The cities of earlier operations it matches */
    places: Place[]; /*!< The cities the server found */
}

/**
 * @function useCitySuggestions
 * @description The cities to suggest for what is typed: those of earlier operations first, then those the server finds,
 * each once. The server is only asked once something was typed, after a pause, and staying silent when it fails. Cities
 * are only looked up past two letters, while earlier ones match from the first.
 *
 * @param {string} query What is typed
 * @param {boolean} isTyping Whether it was typed, rather than filled in
 * @returns {Place[]} The cities, the likeliest first; those of earlier operations without a region and country
 */
export function useCitySuggestions(query: string, isTyping: boolean): Place[] {
    const [found, setFound] = useState<FoundPlaces>({ query: '', earlier: [], places: [] });
    const trimmed = query.trim();
    const shouldAsk = isTyping && foldText(trimmed) !== '';

    useEffect(() => {
        if (!shouldAsk) {
            return;
        }

        let isCurrent = true;

        /**
         * @function ask
         * @description Asks the server for the earlier cities and the cities it finds, keeping its answers while they still
         * match what is typed
         */
        const ask = async (): Promise<void> => {
            const search = trimmed.length >= MIN_QUERY ? budgetService.searchPlaces(trimmed).catch((): Place[] => []) : Promise.resolve([]);
            const [earlier, places] = await Promise.all([budgetService.suggestions('', trimmed).then((suggestions) => suggestions.places).catch((): PlaceReference[] => []), search]);

            if (isCurrent) {
                setFound({ query: trimmed, earlier, places });
            }
        };

        const timer = window.setTimeout(() => void ask(), SEARCH_DELAY);

        return () => {
            isCurrent = false;
            window.clearTimeout(timer);
        };
    }, [shouldAsk, trimmed]);

    if (!shouldAsk || found.query !== trimmed) {
        return [];
    }

    const earlier = found.earlier.map((place): Place => ({ ...place, detail: '' }));
    const known = new Set(earlier.map((place) => place.id));

    return [...earlier, ...found.places.filter((place) => !known.has(place.id))];
}

/**
 * @interface FoundNames
 * @description The names suggested for what was typed.
 */
interface FoundNames {
    typed: string; /*!< What was typed */
    names: string[]; /*!< The names of earlier operations it matches */
}

/**
 * @function useNameSuggestions
 * @description The names of earlier operations to suggest for what is typed, the best match, the most used and the
 * latest first, asked of the server after a pause and staying silent when it fails.
 *
 * @param {string} typed What is typed
 * @returns {string[]} The names
 */
export function useNameSuggestions(typed: string): string[] {
    const [found, setFound] = useState<FoundNames>({ typed: '', names: [] });
    const shouldAsk = foldText(typed) !== '';

    useEffect(() => {
        if (!shouldAsk) {
            return;
        }

        let isCurrent = true;

        /**
         * @function ask
         * @description Asks the server for the names, keeping its answer while it still matches what is typed
         */
        const ask = async (): Promise<void> => {
            const names = await budgetService.suggestions(typed, '').then((suggestions) => suggestions.names).catch((): string[] => []);

            if (isCurrent) {
                setFound({ typed, names });
            }
        };

        const timer = window.setTimeout(() => void ask(), SEARCH_DELAY);

        return () => {
            isCurrent = false;
            window.clearTimeout(timer);
        };
    }, [shouldAsk, typed]);

    return shouldAsk && found.typed === typed ? found.names : [];
}

/**
 * @function currentPosition
 * @description Asks the browser where the device is, saying in words why it can't.
 *
 * @returns {Promise<GeolocationPosition>} The position
 */
function currentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new UserError(t('operation.locateUnavailable')));
            return;
        }

        /**
         * @function refuse
         * @description Rejects with why the position is out of reach
         */
        const refuse = (error: GeolocationPositionError): void => {
            reject(new UserError(t(error.code !== error.PERMISSION_DENIED ? 'operation.locateUnavailable' : 'operation.locateDenied')));
        };

        navigator.geolocation.getCurrentPosition(resolve, refuse, LOCATE_OPTIONS);
    });
}

/**
 * @function locateCity
 * @description Finds the city the device is in: the browser tells the position, rounded to about a kilometre, and the
 * server names its city.
 *
 * @returns {Promise<Place>} The city. Rejects with a `UserError` saying why it can't be found.
 */
export async function locateCity(): Promise<Place> {
    const position = await currentPosition();

    try {
        return await budgetService.locatePlace(position.coords.latitude, position.coords.longitude);
    } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
            throw new UserError(t('operation.locateNoCity'));
        }

        throw error;
    }
}
