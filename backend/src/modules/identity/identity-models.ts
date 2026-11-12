import type { RequestGenericInterface } from 'fastify';
import type { Maybe } from 'src/shared/models';
import { z } from 'zod';

/**
 * @constant Base64UrlSchema
 * @description Zod schema for the base64url strings WebAuthn answers are written in.
 */
const Base64UrlSchema = z.string().min(1).max(64 * 1024).regex(/^[A-Za-z0-9_-]+={0,2}$/);

/**
 * @constant ExtensionResultsSchema
 * @description Zod schema for the extension outputs a passkey answer carries. None is asked for, so they are only passed
 * along.
 */
const ExtensionResultsSchema = z.record(z.string(), z.unknown());

/**
 * @constant AttachmentSchema
 * @description Zod schema for where the authenticator sits: in the device, or beside it (a security key, a phone).
 */
const AttachmentSchema = z.enum(['platform', 'cross-platform']);

/**
 * @constant AuthenticationResponseSchema
 * @description Zod schema for a passkey's answer to a sign-in challenge, as `navigator.credentials.get()` gives it in JSON.
 */
export const AuthenticationResponseSchema = z.object({
    id: Base64UrlSchema,
    rawId: Base64UrlSchema,
    type: z.literal('public-key'),
    response: z.object({
        clientDataJSON: Base64UrlSchema,
        authenticatorData: Base64UrlSchema,
        signature: Base64UrlSchema,
        userHandle: Base64UrlSchema.optional()
    }),
    authenticatorAttachment: AttachmentSchema.optional(),
    clientExtensionResults: ExtensionResultsSchema
});

/**
 * @constant RegistrationResponseSchema
 * @description Zod schema for a new passkey, as `navigator.credentials.create()` gives it in JSON.
 */
export const RegistrationResponseSchema = z.object({
    id: Base64UrlSchema,
    rawId: Base64UrlSchema,
    type: z.literal('public-key'),
    response: z.object({
        clientDataJSON: Base64UrlSchema,
        attestationObject: Base64UrlSchema,
        authenticatorData: Base64UrlSchema.optional(),
        transports: z.array(z.string().max(32)).max(8).optional(),
        publicKeyAlgorithm: z.number().int().optional(),
        publicKey: Base64UrlSchema.optional()
    }),
    authenticatorAttachment: AttachmentSchema.optional(),
    clientExtensionResults: ExtensionResultsSchema
});

/**
 * @type AuthenticationResponseBody
 * @description Inferred type of a passkey's answer to a sign-in challenge.
 */
export type AuthenticationResponseBody = z.infer<typeof AuthenticationResponseSchema>;

/**
 * @type RegistrationResponseBody
 * @description Inferred type of a new passkey.
 */
export type RegistrationResponseBody = z.infer<typeof RegistrationResponseSchema>;

/**
 * @constant LoginSchema
 * @description Zod schema for the login request body: the passkey's signed answer.
 */
export const LoginSchema = z.object({
    response: AuthenticationResponseSchema
});

/**
 * @type LoginBody
 * @description Inferred body type for the login endpoint.
 */
export type LoginBody = z.infer<typeof LoginSchema>;

/**
 * @constant ConnectSchema
 * @description Zod schema for the connect request body: the passkey's signed answer, and the PKCE challenge (the
 * base64url SHA-256 of a secret only the app knows) the one-time code is bound to.
 */
export const ConnectSchema = z.object({
    response: AuthenticationResponseSchema,
    challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
});

/**
 * @type ConnectBody
 * @description Inferred body type for the connect endpoint.
 */
export type ConnectBody = z.infer<typeof ConnectSchema>;

/**
 * @constant ConnectTokenSchema
 * @description Zod schema for the connect token request body: the one-time code, and the PKCE verifier it was asked with.
 */
export const ConnectTokenSchema = z.object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/)
});

/**
 * @type ConnectTokenBody
 * @description Inferred body type for the connect token endpoint.
 */
export type ConnectTokenBody = z.infer<typeof ConnectTokenSchema>;

/**
 * @constant EnrollmentOptionsSchema
 * @description Zod schema for the enrollment options request body: the token set in the environment.
 */
export const EnrollmentOptionsSchema = z.object({
    token: z.string().min(1).max(512)
});

/**
 * @type EnrollmentOptionsBody
 * @description Inferred body type for the enrollment options endpoint.
 */
export type EnrollmentOptionsBody = z.infer<typeof EnrollmentOptionsSchema>;

/**
 * @constant EnrollmentSchema
 * @description Zod schema for the enrollment request body: the token set in the environment, and the new passkey.
 */
export const EnrollmentSchema = z.object({
    token: z.string().min(1).max(512),
    response: RegistrationResponseSchema
});

/**
 * @type EnrollmentBody
 * @description Inferred body type for the enrollment endpoint.
 */
export type EnrollmentBody = z.infer<typeof EnrollmentSchema>;

/**
 * @constant PasskeySchema
 * @description Zod schema for the add-passkey request body: the new passkey.
 */
export const PasskeySchema = z.object({
    response: RegistrationResponseSchema
});

/**
 * @type PasskeyBody
 * @description Inferred body type for the add-passkey endpoint.
 */
export type PasskeyBody = z.infer<typeof PasskeySchema>;

/**
 * @constant PasskeyParamsSchema
 * @description Zod schema for the path naming one passkey.
 */
export const PasskeyParamsSchema = z.object({
    id: Base64UrlSchema.max(1024)
});

/**
 * @type PasskeyParams
 * @description Inferred path type naming one passkey.
 */
export type PasskeyParams = z.infer<typeof PasskeyParamsSchema>;

/**
 * @constant PasskeyUpdateSchema
 * @description Zod schema for the rename-passkey request body: the name the owner gave it, or null (or nothing but
 * spaces) to go back to the name its authenticator gives it.
 */
export const PasskeyUpdateSchema = z.object({
    name: z.string().trim().max(64).transform((name) => (name !== '' ? name : null)).nullable()
});

/**
 * @type PasskeyUpdateBody
 * @description Inferred body type for the rename-passkey endpoint.
 */
export type PasskeyUpdateBody = z.infer<typeof PasskeyUpdateSchema>;

/**
 * @constant RefreshSchema
 * @description Zod schema for the refresh request body.
 */
export const RefreshSchema = z.object({
    refreshToken: z.string().min(1)
});

/**
 * @type RefreshBody
 * @description Inferred body type for the refresh endpoint.
 */
export type RefreshBody = z.infer<typeof RefreshSchema>;

/**
 * @constant LogoutSchema
 * @description Zod schema for the logout request body (the refresh token to invalidate).
 */
export const LogoutSchema = z.object({
    refreshToken: z.string().min(1)
});

/**
 * @type LogoutBody
 * @description Inferred body type for the logout endpoint.
 */
export type LogoutBody = z.infer<typeof LogoutSchema>;

/**
 * @interface PasskeySummary
 * @description A passkey as the portal lists it. Its key itself never leaves the server.
 */
export interface PasskeySummary {
    id: string; /*!< The credential's id */
    aaguid: string; /*!< Which authenticator holds it (a password manager, a security key…), zeros when it doesn't say; the portal names it */
    name: Maybe<string>; /*!< The name the owner gave it, if any, shown instead of the authenticator's */
    backedUp: boolean; /*!< Whether it syncs between devices, as a password manager's passkey does */
    createdAt: Date; /*!< When it was created */
    lastUsedAt: Maybe<Date>; /*!< When it last signed in, if ever */
}

/**
 * @interface LoginRequest
 * @description Fastify request generic for the login endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface LoginRequest extends RequestGenericInterface {
    Body: LoginBody; /*!< Validated login body */
}

/**
 * @interface ConnectRequest
 * @description Fastify request generic for the connect endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface ConnectRequest extends RequestGenericInterface {
    Body: ConnectBody; /*!< Validated connect body */
}

/**
 * @interface ConnectTokenRequest
 * @description Fastify request generic for the connect token endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface ConnectTokenRequest extends RequestGenericInterface {
    Body: ConnectTokenBody; /*!< Validated connect token body */
}

/**
 * @interface EnrollmentOptionsRequest
 * @description Fastify request generic for the enrollment options endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface EnrollmentOptionsRequest extends RequestGenericInterface {
    Body: EnrollmentOptionsBody; /*!< Validated enrollment options body */
}

/**
 * @interface EnrollmentRequest
 * @description Fastify request generic for the enrollment endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface EnrollmentRequest extends RequestGenericInterface {
    Body: EnrollmentBody; /*!< Validated enrollment body */
}

/**
 * @interface PasskeyRequest
 * @description Fastify request generic for the add-passkey endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface PasskeyRequest extends RequestGenericInterface {
    Body: PasskeyBody; /*!< Validated add-passkey body */
}

/**
 * @interface PasskeyDeleteRequest
 * @description Fastify request generic for the remove-passkey endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface PasskeyDeleteRequest extends RequestGenericInterface {
    Params: PasskeyParams; /*!< Validated path */
}

/**
 * @interface PasskeyUpdateRequest
 * @description Fastify request generic for the rename-passkey endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface PasskeyUpdateRequest extends RequestGenericInterface {
    Params: PasskeyParams; /*!< Validated path */
    Body: PasskeyUpdateBody; /*!< Validated rename-passkey body */
}

/**
 * @interface RefreshRequest
 * @description Fastify request generic for the refresh endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface RefreshRequest extends RequestGenericInterface {
    Body: RefreshBody; /*!< Validated refresh body */
}

/**
 * @interface LogoutRequest
 * @description Fastify request generic for the logout endpoint.
 *
 * @extends RequestGenericInterface
 */
export interface LogoutRequest extends RequestGenericInterface {
    Body: LogoutBody; /*!< Validated logout body */
}
