import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { ConnectRequest, ConnectTokenRequest, EnrollmentOptionsRequest, EnrollmentRequest, LoginRequest, LogoutRequest, PasskeyDeleteRequest, PasskeyRequest, PasskeyUpdateRequest, RefreshRequest } from 'src/modules/identity/identity-models';
import { addPasskey, closeConnection, listPasskeys, openConnection, passkeyOptions, removePasskey, renamePasskey, signInOptions, verifySignIn } from 'src/modules/identity/identity-service';
import { OWNER_ID } from 'src/plugins/identity';
import { RequestError } from 'src/shared/models';

/**
 * @function isEnrollmentOpen
 * @description Whether a passkey can be created with the enrollment token: one must be set, and no passkey stored yet.
 * Once the first one exists, the others are added from the account page, so a token left set can't open the account.
 *
 * @returns {Promise<boolean>} Whether enrollment is open.
 */
async function isEnrollmentOpen(request: FastifyRequest): Promise<boolean> {
    return request.server.variables.IDENTITY_ENROLLMENT_TOKEN !== '' && await request.server.prisma.identityPasskey.count() === 0;
}

/**
 * @function requireEnrollmentToken
 * @description Lets a request through only with the enrollment token set in the environment, while no passkey is
 * stored. Otherwise enrollment is closed and every token is refused.
 *
 * @returns {Promise<void>} Resolves when the token holds; throws 403 otherwise.
 */
async function requireEnrollmentToken(request: FastifyRequest, token: string): Promise<void> {
    if (!request.server.identity.isEnrollmentToken(token) || !await isEnrollmentOpen(request)) {
        throw new RequestError(StatusCodes.FORBIDDEN, 'Enrollment is closed or the token is wrong');
    }
}

/**
 * @function loginOptions
 * @description Hands out a challenge for one of the owner's passkeys to sign.
 *
 * @returns {Promise<void>} Resolves when the options are sent.
 */
async function loginOptions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const options = await signInOptions(request.server.identity);

    reply.status(StatusCodes.OK).send({ data: options });
}

/**
 * @function login
 * @description Checks the passkey's signed answer and returns a fresh access/refresh token pair.
 *
 * @returns {Promise<void>} Resolves when the tokens are sent.
 */
async function login(request: FastifyRequest<LoginRequest>, reply: FastifyReply): Promise<void> {
    const { identity, prisma } = request.server;

    await verifySignIn(prisma, identity, request.body.response);

    const tokens = await identity.issueTokens(OWNER_ID);

    reply.status(StatusCodes.OK).send({ data: tokens });
}

/**
 * @function connect
 * @description Checks the passkey's signed answer, made on the portal's connect page the app opened, and returns a
 * one-time code for the page to hand back to the app.
 *
 * @returns {Promise<void>} Resolves when the code is sent.
 */
async function connect(request: FastifyRequest<ConnectRequest>, reply: FastifyReply): Promise<void> {
    const { identity, prisma } = request.server;

    await verifySignIn(prisma, identity, request.body.response);

    reply.status(StatusCodes.OK).send({ data: { code: openConnection(identity, request.body.challenge) } });
}

/**
 * @function connectToken
 * @description Trades the app's one-time code, with the PKCE verifier it was asked with, for a fresh access/refresh token pair.
 *
 * @returns {Promise<void>} Resolves when the tokens are sent.
 */
async function connectToken(request: FastifyRequest<ConnectTokenRequest>, reply: FastifyReply): Promise<void> {
    const { identity } = request.server;

    closeConnection(identity, request.body.code, request.body.verifier);

    const tokens = await identity.issueTokens(OWNER_ID);

    reply.status(StatusCodes.OK).send({ data: tokens });
}

/**
 * @function enrollment
 * @description Tells the sign-in page whether enrollment is open, so it only offers to create a passkey when one
 * could be.
 *
 * @returns {Promise<void>} Resolves when the answer is sent.
 */
async function enrollment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(StatusCodes.OK).send({ data: { open: await isEnrollmentOpen(request) } });
}

/**
 * @function enrollmentOptions
 * @description Hands out a challenge to create a passkey, for whoever holds the enrollment token.
 *
 * @returns {Promise<void>} Resolves when the options are sent.
 */
async function enrollmentOptions(request: FastifyRequest<EnrollmentOptionsRequest>, reply: FastifyReply): Promise<void> {
    await requireEnrollmentToken(request, request.body.token);

    const options = await passkeyOptions(request.server.prisma, request.server.identity);

    reply.status(StatusCodes.OK).send({ data: options });
}

/**
 * @function enroll
 * @description Stores the passkey created with the enrollment token and signs in with it.
 *
 * @returns {Promise<void>} Resolves when the tokens are sent.
 */
async function enroll(request: FastifyRequest<EnrollmentRequest>, reply: FastifyReply): Promise<void> {
    const { identity, prisma } = request.server;

    await requireEnrollmentToken(request, request.body.token);

    await addPasskey(prisma, identity, request.body.response, true);

    const tokens = await identity.issueTokens(OWNER_ID);

    reply.status(StatusCodes.CREATED).send({ data: tokens });
}

/**
 * @function passkeys
 * @description Lists the owner's passkeys.
 *
 * @returns {Promise<void>} Resolves when the list is sent.
 */
async function passkeys(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(StatusCodes.OK).send({ data: await listPasskeys(request.server.prisma) });
}

/**
 * @function newPasskeyOptions
 * @description Hands the signed-in owner a challenge to create another passkey.
 *
 * @returns {Promise<void>} Resolves when the options are sent.
 */
async function newPasskeyOptions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const options = await passkeyOptions(request.server.prisma, request.server.identity);

    reply.status(StatusCodes.OK).send({ data: options });
}

/**
 * @function newPasskey
 * @description Stores another passkey for the signed-in owner.
 *
 * @returns {Promise<void>} Resolves when the stored passkey is sent.
 */
async function newPasskey(request: FastifyRequest<PasskeyRequest>, reply: FastifyReply): Promise<void> {
    const passkey = await addPasskey(request.server.prisma, request.server.identity, request.body.response);

    reply.status(StatusCodes.CREATED).send({ data: passkey });
}

/**
 * @function updatePasskey
 * @description Renames one of the owner's passkeys.
 *
 * @returns {Promise<void>} Resolves when the renamed passkey is sent.
 */
async function updatePasskey(request: FastifyRequest<PasskeyUpdateRequest>, reply: FastifyReply): Promise<void> {
    const passkey = await renamePasskey(request.server.prisma, request.params.id, request.body.name);

    reply.status(StatusCodes.OK).send({ data: passkey });
}

/**
 * @function deletePasskey
 * @description Forgets one of the owner's passkeys, unless it is the last one.
 *
 * @returns {Promise<void>} Resolves when it is forgotten.
 */
async function deletePasskey(request: FastifyRequest<PasskeyDeleteRequest>, reply: FastifyReply): Promise<void> {
    await removePasskey(request.server.prisma, request.params.id);

    reply.status(StatusCodes.OK).send({ data: { message: 'Passkey removed' } });
}

/**
 * @function refresh
 * @description Rotates an access/refresh token pair from a valid refresh token.
 *
 * @returns {Promise<void>} Resolves when the new tokens are sent.
 */
async function refresh(request: FastifyRequest<RefreshRequest>, reply: FastifyReply): Promise<void> {
    const tokens = await request.server.identity.rotateTokens(request.body.refreshToken);

    reply.status(StatusCodes.OK).send({ data: tokens });
}

/**
 * @function logout
 * @description Invalidates the caller's current refresh token.
 *
 * @returns {Promise<void>} Resolves when the session is revoked.
 */
async function logout(request: FastifyRequest<LogoutRequest>, reply: FastifyReply): Promise<void> {
    await request.server.identity.revokeSession(request.user.id, request.body.refreshToken);

    reply.status(StatusCodes.OK).send({ data: { message: 'Logged out' } });
}

/**
 * @function me
 * @description Returns the authenticated account's public profile: its id and the owner's name.
 *
 * @returns {void} Returns when the profile is sent.
 */
function me(request: FastifyRequest, reply: FastifyReply): void {
    reply.status(StatusCodes.OK).send({ data: { id: request.user.id, name: request.server.identity.ownerName } });
}

export default {
    loginOptions,
    login,
    connect,
    connectToken,
    enrollment,
    enrollmentOptions,
    enroll,
    passkeys,
    newPasskeyOptions,
    newPasskey,
    updatePasskey,
    deletePasskey,
    refresh,
    logout,
    me
};
