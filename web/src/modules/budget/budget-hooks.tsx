import type { Maybe } from 'models';
import { BudgetContext } from 'modules/budget/budget-context';
import type { BudgetDocument, BudgetServices } from 'modules/budget/budget-models';
import type { ExchangeRates } from 'modules/budget/budget-rates';
import type { BudgetSnapshot } from 'modules/budget/budget-store';
import { messageOf } from 'utils/errors';
import { useContext, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';

/**
 * @constant CATCH_UP_EVERY
 * @description How often an open budget reads the server again, to show what the app wrote in the meantime
 */
const CATCH_UP_EVERY = 60 * 1000;

/**
 * @function useBudgetContext
 * @description A custom hook to access the budget context
 *
 * @returns {BudgetServices} The budget and the rates
 */
export function useBudgetContext(): BudgetServices {
    const context: Maybe<BudgetServices> = useContext(BudgetContext);

    if (!context) {
        throw new Error('The budget context must be used within the budget provider');
    }
    return context;
}

/**
 * @function useBudget
 * @description The budget as the page renders it, with where it stands with the server.
 */
export function useBudget(): BudgetSnapshot {
    const { store } = useBudgetContext();

    return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/**
 * @function useDocument
 * @description The budget itself. Only used under the budget's shell, which waits for the first read before rendering a page.
 */
export function useDocument(): BudgetDocument {
    const { document } = useBudget();

    if (document === null) {
        throw new Error('useDocument must be used once the budget is loaded');
    }

    return document;
}

/**
 * @interface ServerData
 * @description What a page reads from the server, as it stands.
 */
export interface ServerData<T> {
    data: Maybe<T>; /*!< The latest answer, kept while the next one is on its way, none before the first */
    error: Maybe<string>; /*!< Why the latest read failed, if it did */
}

/**
 * @interface LoadedData
 * @description An answer from the server and what it was asked for.
 */
interface LoadedData<T> {
    key: string; /*!< What it was asked for */
    data: T; /*!< The answer */
}

/**
 * @function useServerData
 * @description Reads something the server works out from the operations, and reads it again whenever the budget's
 * revision moves on, so a write from the page or from the app shows. The previous answer stays on screen while the next
 * one is on its way, unless it was asked for something else.
 *
 * @param {() => Promise<T>} load Reads it.
 * @param {string} key What it is asked for: a new key reads it again and drops the answer to the previous one.
 * @returns {ServerData<T>} The latest answer, or why it failed.
 */
export function useServerData<T>(load: () => Promise<T>, key: string): ServerData<T> {
    const { revision } = useBudget();
    const [loaded, setLoaded] = useState<Maybe<LoadedData<T>>>(null);
    const [error, setError] = useState<Maybe<string>>(null);
    const read = useEffectEvent(load);

    useEffect(() => {
        let isCurrent = true;

        read().then((data) => {
            if (isCurrent) {
                setLoaded({ key, data });
                setError(null);
            }
        }).catch((failure: unknown) => {
            if (isCurrent) {
                setError(messageOf(failure));
            }
        });

        return () => {
            isCurrent = false;
        };
    }, [key, revision]);

    return { data: loaded !== null && loaded.key === key ? loaded.data : null, error };
}

/**
 * @function useRates
 * @description The exchange rates, re-rendering whenever new ones arrive.
 */
export function useRates(): ExchangeRates {
    const { rates } = useBudgetContext();

    useSyncExternalStore(rates.subscribe, rates.getVersion);

    return rates;
}

/**
 * @function useCatchUp
 * @description Keeps an open budget in step with the server: it reads the budget when it opens, when the page comes
 * back into view, when the connection returns and every minute while visible: the web version of the app reconciling
 * when it becomes active.
 *
 * @param {BudgetServices} services The budget and the rates
 */
export function useCatchUp(services: BudgetServices): void {
    useEffect(() => {
        const { store, rates } = services;

        /**
         * @function catchUp
         * @description Reads the budget again
         */
        const catchUp = async (): Promise<void> => {
            await store.refresh();
        };

        /**
         * @function whenVisible
         * @description Catches up, unless the page is hidden
         */
        const whenVisible = (): void => {
            if (window.document.visibilityState === 'visible') {
                void catchUp();
            }
        };

        /**
         * @function warnBeforeLeaving
         * @description Asks before closing the page while some edits haven't reached the server
         */
        const warnBeforeLeaving = (event: BeforeUnloadEvent): void => {
            if (store.getSnapshot().hasPendingChanges) {
                event.preventDefault();
            }
        };

        void catchUp();
        void rates.refreshLatest();

        const interval = window.setInterval(whenVisible, CATCH_UP_EVERY);

        window.addEventListener('focus', whenVisible);
        window.addEventListener('online', whenVisible);
        window.addEventListener('beforeunload', warnBeforeLeaving);
        window.document.addEventListener('visibilitychange', whenVisible);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', whenVisible);
            window.removeEventListener('online', whenVisible);
            window.removeEventListener('beforeunload', warnBeforeLeaving);
            window.document.removeEventListener('visibilitychange', whenVisible);
        };
    }, [services]);
}
