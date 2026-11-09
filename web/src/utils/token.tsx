import type { Maybe } from 'models';
import type { IdentityTokens } from 'modules/identity/identity-models';
import { IdentityTokensSchema } from 'modules/identity/identity-models';

/**
 * @constant STORAGE_KEY
 * @description Where the session's tokens are kept. Session storage survives a reload but not closing the tab, so the
 * page asks for the passkey again each time it is opened.
 */
const STORAGE_KEY = 'my-orbit.identity';

/**
 * @function getTokens
 * @description Retrieves the session's tokens
 *
 * @returns {Maybe<IdentityTokens>} The tokens, if the storage is readable and holds some
 */
export function getTokens(): Maybe<IdentityTokens> {
    try {
        const parsed = IdentityTokensSchema.safeParse(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null'));

        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

/**
 * @function setTokens
 * @description Keeps the session's tokens
 *
 * @param {IdentityTokens} tokens The tokens to keep
 */
export function setTokens(tokens: IdentityTokens): void {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch {
        return;
    }
}

/**
 * @function clearTokens
 * @description Forgets the session's tokens
 */
export function clearTokens(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        return;
    }
}
