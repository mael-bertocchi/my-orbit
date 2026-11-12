import type { Suggestion } from 'components/suggestion-field/suggestion-field';
import { foldText, locationSuggestions } from 'modules/budget/budget-math';
import type { Operation, Place } from 'modules/budget/budget-models';
import budgetService from 'modules/budget/budget-service';
import { t } from 'modules/language/language-service';
import { useEffect, useState } from 'react';
import { UserError } from 'utils/errors';
import { RequestError } from 'utils/request';

/**
 * @constant SEARCH_DELAY
 * @description How long typing must pause before the server is asked for cities, in milliseconds, so a word typed fast
 * asks once.
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
 * @interface FoundPlaces
 * @description The cities the server suggested, and for what
 */
interface FoundPlaces {
    query: string; /*!< What was typed */
    places: Place[]; /*!< The cities it suggested */
}

/**
 * @function useCitySuggestions
 * @description The cities to suggest for what is typed: the places of earlier operations first, then the cities the
 * server finds, each once. The server is only asked once something was typed, after a pause, and staying silent when it
 * fails: the earlier places still help.
 *
 * @param {readonly Operation[]} operations The earlier operations
 * @param {string} query What is typed
 * @param {boolean} isTyping Whether it was typed, rather than filled in
 * @returns {Suggestion[]} The cities, the likeliest first
 */
export function useCitySuggestions(operations: readonly Operation[], query: string, isTyping: boolean): Suggestion[] {
    const [found, setFound] = useState<FoundPlaces>({ query: '', places: [] });
    const trimmed = query.trim();
    const shouldAsk = isTyping && trimmed.length >= MIN_QUERY;

    useEffect(() => {
        if (!shouldAsk) {
            return;
        }

        let isCurrent = true;

        /**
         * @function ask
         * @description Asks the server for the cities, keeping its answer while it still matches what is typed
         */
        const ask = async (): Promise<void> => {
            const places = await budgetService.searchPlaces(trimmed).catch((): Place[] => []);

            if (isCurrent) {
                setFound({ query: trimmed, places });
            }
        };

        const timer = window.setTimeout(() => void ask(), SEARCH_DELAY);

        return () => {
            isCurrent = false;
            window.clearTimeout(timer);
        };
    }, [shouldAsk, trimmed]);

    if (!isTyping) {
        return [];
    }

    const folded = foldText(trimmed);
    const earlier = locationSuggestions(operations, trimmed).map((location): Suggestion => ({ value: location }));
    const known = new Set([folded, ...earlier.map((suggestion) => foldText(suggestion.value))]);
    const places = shouldAsk && found.query === trimmed ? found.places : [];
    const fresh: Suggestion[] = [];

    for (const place of places) {
        const key = foldText(place.name);

        if (!known.has(key)) {
            known.add(key);
            fresh.push({ value: place.name, detail: place.detail });
        }
    }

    return [...earlier, ...fresh];
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
            reject(new UserError(t(error.code === error.PERMISSION_DENIED ? 'operation.locateDenied' : 'operation.locateUnavailable')));
        };

        navigator.geolocation.getCurrentPosition(resolve, refuse, LOCATE_OPTIONS);
    });
}

/**
 * @function locateCity
 * @description Finds the city the device is in: the browser tells the position, rounded to about a kilometre, and the
 * server names its city.
 *
 * @returns {Promise<string>} The city's name. Rejects with a `UserError` saying why it can't be found.
 */
export async function locateCity(): Promise<string> {
    const position = await currentPosition();

    try {
        const place = await budgetService.locatePlace(position.coords.latitude, position.coords.longitude);

        return place.name;
    } catch (error: unknown) {
        if (error instanceof RequestError && error.status === 404) {
            throw new UserError(t('operation.locateNoCity'));
        }

        throw error;
    }
}
