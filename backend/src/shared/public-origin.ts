import type { FastifyRequest } from 'fastify';
import type { Perhaps } from 'src/shared/models';

/**
 * @constant LOOPBACK_HOST
 * @description The host names of a server run on the developer's machine, the only ones reached over plain HTTP.
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * @function firstHeader
 * @description The first value of a header a proxy may have set, if it did.
 *
 * @param {FastifyRequest} request The request.
 * @param {string} name The header's name, in lower case.
 *
 * @returns {Perhaps<string>} Its first value, or undefined.
 */
export function firstHeader(request: FastifyRequest, name: string): Perhaps<string> {
    const value = request.headers[name];
    const first = Array.isArray(value) ? value[0] : value;

    return first?.split(',')[0]?.trim() || undefined;
}

/**
 * @function publicOrigin
 * @description The origin the API is reached at from outside: what OAuth and MCP clients are told to call. Its host is the
 * one the proxy in front of it forwards. Outside the developer's machine it is always HTTPS, whatever a proxy between
 * Cloudflare and the server says, since the public address is only served over HTTPS.
 *
 * @param {FastifyRequest} request The request.
 *
 * @returns {string} The origin, such as `https://api.example.fr`.
 */
export function publicOrigin(request: FastifyRequest): string {
    const host = firstHeader(request, 'x-forwarded-host') ?? request.host;
    const protocol = LOOPBACK_HOST.test(host) ? firstHeader(request, 'x-forwarded-proto') ?? request.protocol : 'https';

    return `${protocol}://${host}`;
}
