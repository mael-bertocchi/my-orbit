import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { ownerTimeZone } from 'src/modules/budget/state/state-service';
import { answerMcp } from 'src/modules/mcp/mcp-service';
import type { ToolContext } from 'src/modules/mcp/mcp-tools';
import { useConnection } from 'src/modules/oauth/oauth-service';
import { RequestError } from 'src/shared/models';
import { dayAt } from 'src/shared/owner-day';
import { publicOrigin } from 'src/shared/public-origin';

/**
 * @constant LANGUAGE
 * @description The language the tools write titles and summaries in: the owner's.
 */
const LANGUAGE = 'fr';

/**
 * @function checkConnection
 * @description Checks the bearer access token and, for a client the owner authorized, that its connection wasn't revoked,
 * marking it as used.
 *
 * @returns {Promise<void>} Resolves when both hold; rejects with 401 otherwise.
 */
async function checkConnection(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await request.server.identity.authenticateClient(request, reply);

    const connectionId = request.user.cid;

    if (connectionId !== undefined && !await useConnection(request.server.prisma, connectionId)) {
        throw new RequestError(StatusCodes.UNAUTHORIZED, 'Revoked or expired connection');
    }
}

/**
 * @function authenticate
 * @description Guards the MCP endpoint with a bearer access token. A client without one is told where to read how to
 * get one, as the MCP authorization spec asks.
 *
 * @returns {Promise<void>} Resolves when the token holds; rejects with 401 otherwise.
 */
async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
        await checkConnection(request, reply);
    } catch (error: unknown) {
        reply.header('WWW-Authenticate', `Bearer resource_metadata="${publicOrigin(request)}/.well-known/oauth-protected-resource/mcp"`);

        throw error;
    }
}

/**
 * @function message
 * @description Answers one MCP message, with the tools running as the owner.
 *
 * @returns {Promise<void>} Resolves when the answer is sent.
 */
async function message(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { prisma, variables } = request.server;
    const timeZone = await ownerTimeZone(prisma);
    const context: ToolContext = { prisma, variables, logger: request.log, language: LANGUAGE, today: dayAt(new Date(), timeZone), timeZone };
    const answer = await answerMcp(request, context);

    reply.status(answer.status).headers(answer.headers).send(answer.body);
}

/**
 * @function unsupported
 * @description Refuses the stream and session methods: the server keeps no session and answers each message on its own.
 *
 * @returns {Promise<void>} Never resolves; rejects with 405.
 */
function unsupported(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.header('Allow', 'POST');

    return Promise.reject(new RequestError(StatusCodes.METHOD_NOT_ALLOWED, 'Only POST is supported'));
}

export default {
    authenticate,
    message,
    unsupported
};
