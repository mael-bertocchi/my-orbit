import { createHash, randomBytes } from 'node:crypto';

import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { StatusCodes } from 'http-status-codes';
import type { IdentityPasskey, PrismaClient } from 'prisma/generated/prisma/client';
import type { AuthenticationResponseBody, PasskeySummary, RegistrationResponseBody } from 'src/modules/identity/identity-models';
import type { ChallengePurpose, IdentityService } from 'src/plugins/identity';
import { OWNER_ID } from 'src/plugins/identity';
import type { Maybe } from 'src/shared/models';
import { RequestError } from 'src/shared/models';

/**
 * @constant ALGORITHMS
 * @description The signature algorithms a new passkey may use (EdDSA, ES256, RS256), named the same when it is created
 * and when it is checked.
 */
const ALGORITHMS = [-8, -7, -257];

/**
 * @constant OWNER_HANDLE
 * @description The owner's WebAuthn user handle. Every passkey carries the same one, so a password manager files them
 * all under one account, and creating a second one in the same manager is refused rather than silently replacing the first.
 */
const OWNER_HANDLE = new TextEncoder().encode(OWNER_ID);

/**
 * @function summarize
 * @description A stored passkey as the portal lists it.
 *
 * @param {IdentityPasskey} passkey The stored passkey.
 *
 * @returns {PasskeySummary} Its summary.
 */
function summarize(passkey: IdentityPasskey): PasskeySummary {
    return {
        id: passkey.id,
        aaguid: passkey.aaguid,
        name: passkey.name,
        backedUp: passkey.backedUp,
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt
    };
}

/**
 * @function expecting
 * @description A check that takes the challenge a passkey signed out of the store, so it can't be signed twice, and
 * accepts it only if it was handed out for this purpose and hasn't lapsed.
 *
 * @param {IdentityService} identity The identity service.
 * @param {ChallengePurpose} purpose What the challenge must have been handed out for.
 *
 * @returns {(challenge: string) => boolean} The check.
 */
function expecting(identity: IdentityService, purpose: ChallengePurpose): (challenge: string) => boolean {
    return (challenge: string) => identity.challenges.take(challenge) === purpose;
}

/**
 * @function signInOptions
 * @description Hands out a challenge for any of the owner's passkeys to sign. It names none of them, so the browser
 * offers whichever it holds, and asks for the device's own check (Face ID, Touch ID, a PIN).
 *
 * @param {IdentityService} identity The identity service.
 *
 * @returns {Promise<PublicKeyCredentialRequestOptionsJSON>} The options to pass to `navigator.credentials.get()`.
 */
export async function signInOptions(identity: IdentityService): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await generateAuthenticationOptions({
        rpID: identity.relyingParty.id,
        userVerification: 'required'
    });

    identity.challenges.set(options.challenge, 'authentication');

    return options;
}

/**
 * @function verifySignIn
 * @description Checks a passkey's answer to a sign-in challenge: a passkey of the owner's, signing a challenge handed out
 * here, from the portal's own page, with the device's check passed. Records that it was used.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {IdentityService} identity The identity service.
 * @param {AuthenticationResponseBody} response The passkey's answer.
 *
 * @returns {Promise<void>} Resolves when the answer holds; rejects with 401 otherwise.
 */
export async function verifySignIn(prisma: PrismaClient, identity: IdentityService, response: AuthenticationResponseBody): Promise<void> {
    const passkey = await prisma.identityPasskey.findUnique({ where: { id: response.id } });

    if (passkey === null) {
        throw new RequestError(StatusCodes.UNAUTHORIZED, 'Unknown passkey');
    }

    let verified: boolean;
    let counter = passkey.counter;
    let backedUp = passkey.backedUp;

    try {
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: expecting(identity, 'authentication'),
            expectedOrigin: identity.relyingParty.origin,
            expectedRPID: identity.relyingParty.id,
            credential: {
                id: passkey.id,
                publicKey: new Uint8Array(passkey.publicKey),
                counter: passkey.counter,
                transports: passkey.transports
            },
            requireUserVerification: true
        });

        verified = verification.verified;
        counter = verification.authenticationInfo.newCounter;
        backedUp = verification.authenticationInfo.credentialBackedUp;
    } catch {
        verified = false;
    }

    if (!verified) {
        throw new RequestError(StatusCodes.UNAUTHORIZED, 'Passkey not accepted');
    }

    await prisma.identityPasskey.update({ where: { id: passkey.id }, data: { counter, backedUp, lastUsedAt: new Date() } });
}

/**
 * @function passkeyOptions
 * @description Hands out a challenge to create a new passkey for the owner, filed under the owner's name. The passkeys
 * already stored are named so the same password manager isn't asked for a second one.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {IdentityService} identity The identity service.
 *
 * @returns {Promise<PublicKeyCredentialCreationOptionsJSON>} The options to pass to `navigator.credentials.create()`.
 */
export async function passkeyOptions(prisma: PrismaClient, identity: IdentityService): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await prisma.identityPasskey.findMany({ select: { id: true, transports: true } });
    const options = await generateRegistrationOptions({
        rpName: identity.relyingParty.name,
        rpID: identity.relyingParty.id,
        userName: identity.ownerName,
        userDisplayName: identity.ownerName,
        userID: OWNER_HANDLE,
        attestationType: 'none',
        excludeCredentials: existing.map((passkey) => ({ id: passkey.id, transports: passkey.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        supportedAlgorithmIDs: ALGORITHMS
    });

    identity.challenges.set(options.challenge, 'registration');

    return options;
}

/**
 * @function addPasskey
 * @description Checks a new passkey (created from a challenge handed out here, on the portal's own page, with the
 * device's check passed) and stores it.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {IdentityService} identity The identity service.
 * @param {RegistrationResponseBody} response The new passkey.
 * @param {boolean} signsIn Whether it opens a session at once, as the first one does, which counts as its first use.
 *
 * @returns {Promise<PasskeySummary>} The stored passkey. Rejects with 400 when it doesn't hold, 409 when it is already stored.
 */
export async function addPasskey(prisma: PrismaClient, identity: IdentityService, response: RegistrationResponseBody, signsIn = false): Promise<PasskeySummary> {
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

    try {
        verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: expecting(identity, 'registration'),
            expectedOrigin: identity.relyingParty.origin,
            expectedRPID: identity.relyingParty.id,
            requireUserVerification: true,
            supportedAlgorithmIDs: ALGORITHMS
        });
    } catch {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Passkey not accepted');
    }

    if (!verification.verified) {
        throw new RequestError(StatusCodes.BAD_REQUEST, 'Passkey not accepted');
    }

    const { credential, credentialBackedUp, aaguid } = verification.registrationInfo;

    if (await prisma.identityPasskey.findUnique({ where: { id: credential.id } }) !== null) {
        throw new RequestError(StatusCodes.CONFLICT, 'Passkey already stored');
    }

    const passkey = await prisma.identityPasskey.create({
        data: {
            id: credential.id,
            publicKey: new Uint8Array(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports ?? [],
            aaguid,
            backedUp: credentialBackedUp,
            lastUsedAt: signsIn ? new Date() : null
        }
    });

    return summarize(passkey);
}

/**
 * @function listPasskeys
 * @description The owner's passkeys, oldest first.
 *
 * @param {PrismaClient} prisma The database client.
 *
 * @returns {Promise<PasskeySummary[]>} The passkeys.
 */
export async function listPasskeys(prisma: PrismaClient): Promise<PasskeySummary[]> {
    const passkeys = await prisma.identityPasskey.findMany({ orderBy: { createdAt: 'asc' } });

    return passkeys.map(summarize);
}

/**
 * @function renamePasskey
 * @description Gives one of the owner's passkeys a name of their own, or takes it back so the portal names it after its
 * authenticator again.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The passkey's id.
 * @param {Maybe<string>} name Its new name, or null for none.
 *
 * @returns {Promise<PasskeySummary>} The renamed passkey. Rejects with 404 when there is no such passkey.
 */
export async function renamePasskey(prisma: PrismaClient, id: string, name: Maybe<string>): Promise<PasskeySummary> {
    if (await prisma.identityPasskey.findUnique({ where: { id } }) === null) {
        throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown passkey');
    }

    return summarize(await prisma.identityPasskey.update({ where: { id }, data: { name } }));
}

/**
 * @function removePasskey
 * @description Forgets one of the owner's passkeys. The last one is kept: without it nobody could sign in again until an
 * enrollment token is set.
 *
 * @param {PrismaClient} prisma The database client.
 * @param {string} id The passkey's id.
 *
 * @returns {Promise<void>} Resolves once it is forgotten. Rejects with 404 when there is no such passkey, 409 when it is the last one.
 */
export async function removePasskey(prisma: PrismaClient, id: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
        const passkey = await transaction.identityPasskey.findUnique({ where: { id } });

        if (passkey === null) {
            throw new RequestError(StatusCodes.NOT_FOUND, 'Unknown passkey');
        }

        if (await transaction.identityPasskey.count() <= 1) {
            throw new RequestError(StatusCodes.CONFLICT, 'The last passkey can not be removed');
        }

        await transaction.identityPasskey.delete({ where: { id } });
    });
}

/**
 * @function pkceChallenge
 * @description The PKCE challenge a verifier answers: its SHA-256, base64url-encoded.
 *
 * @param {string} verifier The verifier.
 *
 * @returns {string} The challenge.
 */
export function pkceChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * @function openConnection
 * @description Hands out a one-time code the app can trade for a session, bound to the PKCE challenge it asked with: only
 * the app holding the matching verifier can trade it, so a code caught on its way back is worthless.
 *
 * @param {IdentityService} identity The identity service.
 * @param {string} challenge The app's PKCE challenge.
 *
 * @returns {string} The code.
 */
export function openConnection(identity: IdentityService, challenge: string): string {
    const code = randomBytes(32).toString('base64url');

    identity.connections.set(code, challenge);

    return code;
}

/**
 * @function closeConnection
 * @description Takes a one-time code back, checking the verifier against the challenge it was handed out for.
 *
 * @param {IdentityService} identity The identity service.
 * @param {string} code The code.
 * @param {string} verifier The app's PKCE verifier.
 *
 * @returns {void} Returns when the code holds; throws 401 otherwise.
 */
export function closeConnection(identity: IdentityService, code: string, verifier: string): void {
    const challenge = identity.connections.take(code);

    if (challenge === undefined || challenge !== pkceChallenge(verifier)) {
        throw new RequestError(StatusCodes.UNAUTHORIZED, 'Invalid or expired code');
    }
}
