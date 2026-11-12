import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';
import { browserSupportsWebAuthn, sendSignal, startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser';
import type { Passkey } from 'modules/identity/identity-models';
import type { MessageKey } from 'modules/language/language-en';
import { t } from 'modules/language/language-service';
import { UserError } from 'utils/errors';

export type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON };

/**
 * @class PasskeyError
 * @description The browser or the passkey turned the request down. Its message is written for the person using the page.
 *
 * @extends UserError
 */
export class PasskeyError extends UserError {
    public isCancelled: boolean; /*!< Whether the person dismissed the sheet, which needs no message */

    /**
     * @constructor
     * @description Wraps a failed passkey request
     *
     * @param {string} message The message to show
     * @param {boolean} isCancelled Whether the person dismissed the sheet
     */
    constructor(message: string, isCancelled = false) {
        super(message);

        this.isCancelled = isCancelled;
    }
}

/**
 * @function explain
 * @description What to tell the person when the browser refuses a passkey request.
 *
 * @param {unknown} error What the browser threw.
 *
 * @returns {PasskeyError} The same failure, worded for the page.
 */
function explain(error: unknown): PasskeyError {
    if (error instanceof WebAuthnError && error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
        return new PasskeyError(t('error.passkeyExists'));
    }

    if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
        return new PasskeyError(t('error.passkeyCancelled'), true);
    }

    return new PasskeyError(t('error.generic'));
}

/**
 * @function requireSupport
 * @description Turns the request down at once in a browser that can't use passkeys.
 */
function requireSupport(): void {
    if (!browserSupportsWebAuthn()) {
        throw new PasskeyError(t('error.passkeyUnsupported'));
    }
}

/**
 * @function signWithPasskey
 * @description Asks the browser for one of the owner's passkeys to sign a sign-in challenge, after the device's own
 * check.
 *
 * @param {PublicKeyCredentialRequestOptionsJSON} options The options the server handed out.
 *
 * @returns {Promise<AuthenticationResponseJSON>} The signed answer. Rejects with a `PasskeyError`.
 */
export async function signWithPasskey(options: PublicKeyCredentialRequestOptionsJSON): Promise<AuthenticationResponseJSON> {
    requireSupport();

    try {
        return await startAuthentication({ optionsJSON: options });
    } catch (error: unknown) {
        throw explain(error);
    }
}

/**
 * @function createPasskey
 * @description Asks the browser to create a passkey for the owner, saved in the password manager the person picks.
 *
 * @param {PublicKeyCredentialCreationOptionsJSON} options The options the server handed out.
 *
 * @returns {Promise<RegistrationResponseJSON>} The new passkey. Rejects with a `PasskeyError`.
 */
export async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> {
    requireSupport();

    try {
        return await startRegistration({ optionsJSON: options });
    } catch (error: unknown) {
        throw explain(error);
    }
}

/**
 * @function forgetPasskey
 * @description Tells the password manager a passkey no longer opens the portal, so it can stop offering it. The
 * portal's host is the relying party the passkeys belong to. Browsers that can't pass the word on are left alone.
 *
 * @param {string} id The passkey's id.
 */
export function forgetPasskey(id: string): void {
    void sendSignal({ signalName: 'unknownCredential', rpID: window.location.hostname, credentialID: id }).catch(() => undefined);
}

/**
 * @constant AUTHENTICATORS
 * @description What to call the password managers and devices that say who they are (their AAGUID), so the account
 * settings can tell the passkeys apart. A sentence key for the names that change with the language.
 */
const AUTHENTICATORS: Readonly<Record<string, MessageKey | { name: string }>> = {
    'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'account.googlePasswordManager',
    'bada5566-a7aa-401f-bd96-45619a55120d': { name: '1Password' },
    'd548826e-79b4-db40-a3d8-11116f7e8349': { name: 'Bitwarden' },
    '08987058-cadc-4b81-b6e1-30de50dcbe96': { name: 'Windows Hello' },
    '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': { name: 'Windows Hello' },
    '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': { name: 'Windows Hello' }
};

/**
 * @function authenticatorName
 * @description What a passkey is called when the owner hasn't named it, in the page's language: where it lives when its
 * authenticator says, and otherwise what it is, a synced passkey or a security key.
 *
 * @param {Passkey} passkey The passkey.
 *
 * @returns {string} Its authenticator's name.
 */
export function authenticatorName(passkey: Passkey): string {
    const known = AUTHENTICATORS[passkey.aaguid.toLowerCase()];

    if (known !== undefined) {
        return typeof known !== 'string' ? known.name : t(known);
    }

    return t(passkey.backedUp ? 'account.passkey' : 'account.securityKey');
}

/**
 * @function passkeyName
 * @description A passkey's name: the one the owner gave it, and otherwise its authenticator's.
 *
 * @param {Passkey} passkey The passkey.
 *
 * @returns {string} Its name.
 */
export function passkeyName(passkey: Passkey): string {
    return passkey.name ?? authenticatorName(passkey);
}
