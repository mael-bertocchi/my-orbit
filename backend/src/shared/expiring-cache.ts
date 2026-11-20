import type { Perhaps } from 'src/shared/models';

/**
 * @constant ONE_TIME_CAPACITY
 * @description How many one-time values, such as challenges or codes, are kept at most before the oldest goes.
 */
export const ONE_TIME_CAPACITY = 1000;

/**
 * @interface ExpiringEntry
 * @description A value kept until it lapses.
 */
interface ExpiringEntry<T> {
    value: T; /*!< What was kept */
    expiresAt: number; /*!< When it lapses, in milliseconds */
}

/**
 * @class ExpiringCache
 * @description Keeps values in memory for a while: answers from a slow or rate-limited service, read any number of times
 * until they lapse, or one-time values such as challenges and codes, taken once. It holds a bounded number of values;
 * past the bound the oldest goes first.
 */
export class ExpiringCache<T> {
    private entries = new Map<string, ExpiringEntry<T>>(); /*!< The values, oldest first */

    /**
     * @constructor
     * @description Creates an empty cache
     *
     * @param {number} lifetime How long a value stays readable, in milliseconds
     * @param {number} capacity How many values it holds at most
     */
    constructor(private readonly lifetime: number, private readonly capacity: number = 500) {}

    /**
     * @method get
     * @description Reads a value, unless it is missing or has lapsed.
     *
     * @param {string} key The key.
     * @param {number} now The current time, in milliseconds.
     *
     * @returns {Perhaps<T>} The value, or undefined.
     */
    get(key: string, now: number = Date.now()): Perhaps<T> {
        const entry = this.entries.get(key);

        if (entry === undefined) {
            return undefined;
        }

        if (entry.expiresAt <= now) {
            this.entries.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /**
     * @method take
     * @description Reads a value and forgets it, so it can only be used once.
     *
     * @param {string} key The key.
     * @param {number} now The current time, in milliseconds.
     *
     * @returns {Perhaps<T>} The value, or undefined when it is missing, already taken or lapsed.
     */
    take(key: string, now: number = Date.now()): Perhaps<T> {
        const value = this.get(key, now);

        this.entries.delete(key);

        return value;
    }

    /**
     * @method set
     * @description Keeps a value under a key, replacing what was there.
     *
     * @param {string} key The key.
     * @param {T} value The value.
     * @param {number} now The current time, in milliseconds.
     */
    set(key: string, value: T, now: number = Date.now()): void {
        this.entries.delete(key);
        this.entries.set(key, { value, expiresAt: now + this.lifetime });

        for (const oldest of this.entries.keys()) {
            if (this.entries.size <= this.capacity) {
                break;
            }

            this.entries.delete(oldest);
        }
    }

    /**
     * @method clear
     * @description Forgets every value.
     */
    clear(): void {
        this.entries.clear();
    }
}
