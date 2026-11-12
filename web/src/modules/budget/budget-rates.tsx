import type { Maybe } from 'models';
import { bankRate, EURO } from 'modules/budget/budget-currencies';
import { dayKey } from 'modules/budget/budget-dates';
import type { BudgetServer, RateSnapshot } from 'modules/budget/budget-models';
import { messageOf } from 'utils/errors';

/**
 * @class ExchangeRates
 * @description The reference rates the page prices foreign operations at: the latest ones for Settings, and those of
 * each day an operation is dated on. Every rate handed out carries the bank's markup, so a euro figure matches the
 * statement.
 */
export class ExchangeRates {
    private readonly api: BudgetServer; /*!< The server */
    private latestSnapshot: Maybe<RateSnapshot> = null; /*!< The latest rates */
    private days = new Map<string, RateSnapshot>(); /*!< Rates by day */
    private failures = new Map<string, string>(); /*!< Why a day's rates are missing */
    private inFlight = new Map<string, Promise<void>>(); /*!< Day loads in progress */
    private listeners = new Set<() => void>(); /*!< Who to tell about new rates */
    private version = 0; /*!< Bumped on every change, for `useSyncExternalStore` */

    /**
     * @constructor
     * @description Prepares an empty cache
     *
     * @param {BudgetServer} api The server
     */
    constructor(api: BudgetServer) {
        this.api = api;
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    getVersion = (): number => this.version;

    /**
     * @method latest
     * @description The latest rates, once loaded.
     */
    get latest(): Maybe<RateSnapshot> {
        return this.latestSnapshot;
    }

    /**
     * @method refreshLatest
     * @description Loads the latest rates. A failure keeps the previous ones.
     */
    async refreshLatest(): Promise<void> {
        try {
            this.latestSnapshot = await this.api.getRates();
            this.changed();
        } catch {
            return;
        }
    }

    /**
     * @method load
     * @description Loads one day's rates, once. A day still answered by an earlier day's rate is loaded again later:
     * its own rate isn't published yet.
     *
     * @param {string} day The day, in YYYY-MM-DD form.
     */
    async load(day: string): Promise<void> {
        const cached = this.days.get(day);

        if (cached !== undefined && !(cached.quoteDate !== day && day >= dayKey(new Date()))) {
            return;
        }

        const running = this.inFlight.get(day);

        if (running !== undefined) {
            await running;
            return;
        }

        /**
         * @constant task
         * @description The day's lookup, shared by whoever asks for that day meanwhile
         */
        const task = (async () => {
            try {
                this.days.set(day, await this.api.getRatesOn(day));
                this.failures.delete(day);
            } catch (error: unknown) {
                this.failures.set(day, messageOf(error));
            } finally {
                this.inFlight.delete(day);
                this.changed();
            }
        })();

        this.inFlight.set(day, task);
        await task;
    }

    /**
     * @method rate
     * @description The rate that applied to a currency on one day, markup included.
     *
     * @returns {Maybe<number>} Euros per unit, or null until that day is loaded.
     */
    rate(code: string, day: string): Maybe<number> {
        if (code === EURO.code) {
            return 1;
        }

        const published = this.days.get(day)?.rates[code];

        return published !== undefined ? bankRate(published, code) : null;
    }

    /**
     * @method failure
     * @description Why a day's rates are missing, or null when nothing went wrong.
     */
    failure(day: string): Maybe<string> {
        return this.failures.get(day) ?? null;
    }

    /**
     * @method changed
     * @description Tells the listeners.
     */
    private changed(): void {
        this.version += 1;

        for (const listener of this.listeners) {
            listener();
        }
    }
}
