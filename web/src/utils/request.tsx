import type { Maybe } from 'models';
import { IdentityTokensSchema } from 'modules/identity/identity-models';
import { t } from 'modules/language/language-service';
import { UserError } from 'utils/errors';
import { clearTokens, getTokens, setTokens } from 'utils/token';
import type { z } from 'zod';

/**
 * @constant API_URL
 * @description The origin every request goes to, set at build time with `VITE_API_URL`. Without it, as in development,
 * the page calls its own origin, which the development server forwards to the local backend.
 */
const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * @constant REQUEST_TIMEOUT
 * @description How long to wait on the server before calling it unreachable, unless the request brings its own signal
 */
const REQUEST_TIMEOUT = 15 * 1000;

/**
 * @constant GATEWAY_ERRORS
 * @description What the proxy in front of the backend answers when it can't reach it: unreachable, not refused
 */
const GATEWAY_ERRORS = new Set([502, 503, 504]);

/**
 * @constant IDENTITY_SESSION_ENDED_EVENT
 * @description The event dispatched once the session is over, signed out or lapsed beyond renewal, so the identity
 * returns to the passkey screen and the apps forget what they loaded
 */
export const IDENTITY_SESSION_ENDED_EVENT = 'identity:session-ended';

/**
 * @var renewalInFlight
 * @description The token renewal in progress, shared by the requests that need it at the same time
 */
let renewalInFlight: Maybe<Promise<boolean>> = null;

/**
 * @class RequestError
 * @description An error answered by the server, or raised while trying to reach it. Its message is written for the
 * person using the page.
 *
 * @extends UserError
 */
export class RequestError extends UserError {
    public readonly status: number; /*!< The HTTP status, or 0 when the server could not be reached */
    public readonly reason: Maybe<string>; /*!< Why, when the server says so in `data.reason`, for an app to word it */

    /**
     * @constructor
     * @description Wraps a failed call
     *
     * @param {number} status The HTTP status, or 0 when the server could not be reached
     * @param {string} message The message to show
     * @param {Maybe<string>} reason Why, when the server says so
     */
    constructor(status: number, message: string, reason: Maybe<string> = null) {
        super(message);

        this.name = 'RequestError';
        this.status = status;
        this.reason = reason;
    }

    /**
     * @method isConflict
     * @description Whether the server refused a write because the data moved on since it was read
     */
    get isConflict(): boolean {
        return this.status === 409;
    }

    /**
     * @method isOffline
     * @description Whether the server could not be reached at all
     */
    get isOffline(): boolean {
        return this.status === 0;
    }
}

/**
 * @function refusal
 * @description What to tell the person when the server turns a request down, in the page's language. The server words
 * its own messages in English for whoever reads its logs, so they are never shown.
 *
 * @param {number} status The HTTP status
 * @returns {string} The message to show
 */
function refusal(status: number): string {
    if (status === 429) {
        return t('error.tooManyAttempts');
    }

    return status >= 500 ? t('error.unavailable') : t('error.refused');
}

/**
 * @function reasonOf
 * @description The reason an error answer gives in its `data.reason`, if any
 *
 * @param {unknown} payload The answer's body
 * @returns {Maybe<string>} The reason, or null
 */
function reasonOf(payload: unknown): Maybe<string> {
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
        return null;
    }

    const data: unknown = payload.data;

    return typeof data === 'object' && data !== null && 'reason' in data && typeof data.reason === 'string' ? data.reason : null;
}

/**
 * @function rewording
 * @description Rewords a refusal with a given status, leaving every other failure as it is
 *
 * @param {number} status The status to reword
 * @param {string} message What to say instead
 * @returns {(error: unknown) => never} A handler rethrowing the failure
 */
export function rewording(status: number, message: string): (error: unknown) => never {
    return (error: unknown) => {
        throw error instanceof RequestError && error.status === status ? new RequestError(status, message) : error;
    };
}

/**
 * @function send
 * @description Sends one request, turning a network failure into an offline `RequestError`
 *
 * @param {string} path The path, from `/v1`
 * @param {RequestInit} init The method and body
 * @param {string} accessToken The access token to send, if any
 * @returns {Promise<Response>} The server's response
 */
async function send(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (init.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    if (accessToken !== undefined) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
        return await fetch(`${API_URL}${path}`, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT) });
    } catch {
        throw new RequestError(0, t('error.unreachable'));
    }
}

/**
 * @function unwrap
 * @description Reads a response's `{ data }` envelope, or turns an error answer into a `RequestError` saying why in the
 * page's language
 *
 * @param {Response} response The server's response
 * @param {T} schema What the answer's `data` must look like
 * @returns {Promise<z.infer<T>>} The answer's `data`
 */
async function unwrap<T extends z.ZodType>(response: Response, schema: T): Promise<z.infer<T>> {
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        const hasMessage = typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string';

        if (!hasMessage && GATEWAY_ERRORS.has(response.status)) {
            throw new RequestError(0, t('error.unreachable'));
        }

        throw new RequestError(response.status, refusal(response.status), reasonOf(payload));
    }

    const parsed = schema.safeParse(typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : undefined);

    if (!parsed.success) {
        throw new RequestError(response.status, t('error.unexpected'));
    }

    return parsed.data;
}

/**
 * @function endSession
 * @description Forgets the session and tells whoever listens that it is over
 */
export function endSession(): void {
    clearTokens();
    window.dispatchEvent(new Event(IDENTITY_SESSION_ENDED_EVENT));
}

/**
 * @function renewSession
 * @description Rotates the refresh token into a new pair. Concurrent calls share one rotation.
 *
 * @returns {Promise<boolean>} Whether the session was renewed
 */
async function renewSession(): Promise<boolean> {
    renewalInFlight ??= (async () => {
        try {
            const tokens = getTokens();

            if (tokens === null) {
                return false;
            }

            const response = await send('/v1/identity/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: tokens.refreshToken }) });

            if (!response.ok) {
                return false;
            }

            setTokens(await unwrap(response, IdentityTokensSchema));

            return true;
        } finally {
            renewalInFlight = null;
        }
    })();

    return await renewalInFlight;
}

/**
 * @function fetchPublic
 * @description Sends a request that needs no session, such as signing in, and reads its answer
 *
 * @param {string} path The path, from `/v1`
 * @param {RequestInit} init The method and body
 * @param {T} schema What the answer's `data` must look like
 * @param {string} accessToken The access token to send anyway, if any
 * @returns {Promise<z.infer<T>>} The answer's `data`. Rejects with a `RequestError` worded for the page.
 */
export async function fetchPublic<T extends z.ZodType>(path: string, init: RequestInit, schema: T, accessToken?: string): Promise<z.infer<T>> {
    return await unwrap(await send(path, init, accessToken), schema);
}

/**
 * @function fetchWithAuthentication
 * @description Sends a request with the session's access token and reads its answer. A lapsed access token is renewed
 * once and the request replayed; when it can't be, the session is over.
 *
 * @param {string} path The path, from `/v1`
 * @param {RequestInit} init The method and body
 * @param {T} schema What the answer's `data` must look like
 * @returns {Promise<z.infer<T>>} The answer's `data`. Rejects with a `RequestError` worded for the page.
 */
export async function fetchWithAuthentication<T extends z.ZodType>(path: string, init: RequestInit, schema: T): Promise<z.infer<T>> {
    let response = await send(path, init, getTokens()?.accessToken);

    if (response.status === 401) {
        if (!(await renewSession())) {
            endSession();

            throw new RequestError(401, t('error.sessionExpired'));
        }

        response = await send(path, init, getTokens()?.accessToken);
    }

    return await unwrap(response, schema);
}
