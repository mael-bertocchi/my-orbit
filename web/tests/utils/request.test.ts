import { chooseLanguage } from 'modules/language/language-service';
import { endSession, fetchPublic, fetchWithAuthentication, IDENTITY_SESSION_ENDED_EVENT, RequestError } from 'utils/request';
import { getTokens, setTokens } from 'utils/token';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * @constant TOKENS
 * @description A session's tokens, as the server hands them over.
 */
const TOKENS = { accessToken: 'access', refreshToken: 'refresh' };

afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * @function answer
 * @description Makes every request get the same answer.
 */
function answer(status: number, body: string, contentType = 'application/json'): void {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(body, { status, headers: { 'Content-Type': contentType } }))));
}

/**
 * @function answers
 * @description Answers each request in turn, recording what was asked.
 */
function answers(...replies: [number, unknown][]): ReturnType<typeof vi.fn> {
    const fetch = vi.fn(() => {
        const [status, body] = replies.shift() ?? [500, null];

        return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    });

    vi.stubGlobal('fetch', fetch);

    return fetch;
}

describe('fetchWithAuthentication', () => {
    it('renews a lapsed access token once and replays the request', async () => {
        setTokens(TOKENS);

        const fetch = answers([401, { message: 'Invalid or expired access token' }], [200, { data: { accessToken: 'renewed', refreshToken: 'next' } }], [200, { data: 'ok' }]);

        await expect(fetchWithAuthentication('/v1/budget/state', { method: 'GET' }, z.string())).resolves.toBe('ok');
        expect(fetch).toHaveBeenLastCalledWith('/v1/budget/state', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer renewed' }) }));
        expect(getTokens()).toEqual({ accessToken: 'renewed', refreshToken: 'next' });
    });

    it('ends the session, and tells whoever listens, when it can’t be renewed', async () => {
        setTokens(TOKENS);
        answers([401, { message: 'Invalid or expired access token' }], [401, { message: 'Invalid or expired refresh token' }]);

        const ended = vi.fn();

        window.addEventListener(IDENTITY_SESSION_ENDED_EVENT, ended);

        await expect(fetchWithAuthentication('/v1/budget/state', { method: 'GET' }, z.string())).rejects.toMatchObject({ status: 401, message: 'Your session has expired.' });
        expect(ended).toHaveBeenCalledOnce();
        expect(getTokens()).toBeNull();

        window.removeEventListener(IDENTITY_SESSION_ENDED_EVENT, ended);
    });

    it('keeps the session when the server is down while renewing it', async () => {
        setTokens(TOKENS);
        answers([401, { message: 'Invalid or expired access token' }], [502, null]);

        const ended = vi.fn();

        window.addEventListener(IDENTITY_SESSION_ENDED_EVENT, ended);

        await expect(fetchWithAuthentication('/v1/budget/state', { method: 'GET' }, z.string())).rejects.toBeInstanceOf(RequestError);
        expect(ended).not.toHaveBeenCalled();
        expect(getTokens()).toEqual(TOKENS);

        window.removeEventListener(IDENTITY_SESSION_ENDED_EVENT, ended);
    });
});

describe('fetchPublic', () => {
    it("reports the proxy's gateway error as an unreachable server", async () => {
        answer(502, '<html>502 Bad Gateway</html>', 'text/html');

        const failure = fetchPublic('/v1/identity/login', { method: 'POST', body: '{}' }, z.unknown());

        await expect(failure).rejects.toBeInstanceOf(RequestError);
        await expect(failure).rejects.toMatchObject({ status: 0, message: "Can't reach the server." });
    });

    it("words the backend's own errors in the page's language", async () => {
        answer(503, JSON.stringify({ message: 'Exchange rates are unavailable', data: null }));

        await expect(fetchPublic('/v1/budget/rates', { method: 'GET' }, z.unknown())).rejects.toMatchObject({ status: 503, message: 'The server is unavailable right now.' });

        chooseLanguage('fr');

        await expect(fetchPublic('/v1/budget/rates', { method: 'GET' }, z.unknown())).rejects.toMatchObject({ status: 503, message: 'Le serveur est indisponible pour le moment.' });
    });

    it('keeps the reason the server gives, for an app to word it', async () => {
        answer(503, JSON.stringify({ message: 'The catalog is not configured', data: { reason: 'catalog-not-configured' } }));

        await expect(fetchPublic('/v1/watchlist/catalog/genres', { method: 'GET' }, z.unknown())).rejects.toMatchObject({ status: 503, reason: 'catalog-not-configured', message: 'The server is unavailable right now.' });

        answer(503, JSON.stringify({ message: 'Server Error', data: null }));

        await expect(fetchPublic('/v1/budget/rates', { method: 'GET' }, z.unknown())).rejects.toMatchObject({ status: 503, reason: null });
    });

    it('asks to wait a moment when rate-limited', async () => {
        answer(429, JSON.stringify({ message: 'Rate limit exceeded, retry in 1 minute', statusCode: 429 }));

        await expect(fetchPublic('/v1/identity/login', { method: 'POST', body: '{}' }, z.unknown())).rejects.toMatchObject({ status: 429, message: 'Too many attempts. Try again in a moment.' });
    });
});

describe('endSession', () => {
    it('forgets the tokens and tells whoever listens', () => {
        setTokens(TOKENS);

        const ended = vi.fn();

        window.addEventListener(IDENTITY_SESSION_ENDED_EVENT, ended);
        endSession();

        expect(getTokens()).toBeNull();
        expect(ended).toHaveBeenCalledOnce();

        window.removeEventListener(IDENTITY_SESSION_ENDED_EVENT, ended);
    });
});
