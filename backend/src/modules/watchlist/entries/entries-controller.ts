import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { EntryCreateRequest, EntryDeleteRequest, EntryUpdateRequest } from 'src/modules/watchlist/entries/entries-models';
import { addEntry, listEntries, removeEntry, updateEntry } from 'src/modules/watchlist/entries/entries-service';

/**
 * @function list
 * @description Sends every title on the watchlist.
 *
 * @returns {Promise<void>} Resolves when the titles are sent.
 */
async function list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const entries = await listEntries(request.server.prisma);

    reply.status(StatusCodes.OK).send({ data: entries });
}

/**
 * @function add
 * @description Puts a film or a series on the watchlist.
 *
 * @returns {Promise<void>} Resolves when the stored title is sent.
 */
async function add(request: FastifyRequest<EntryCreateRequest>, reply: FastifyReply): Promise<void> {
    const entry = await addEntry(request.server.prisma, request.server.variables, request.log, request.body);

    reply.status(StatusCodes.CREATED).send({ data: entry });
}

/**
 * @function update
 * @description Starts a title, says where a series is, marks a title watched or not, rates it, comments on it.
 *
 * @returns {Promise<void>} Resolves when the stored title is sent.
 */
async function update(request: FastifyRequest<EntryUpdateRequest>, reply: FastifyReply): Promise<void> {
    const entry = await updateEntry(request.server.prisma, request.params.entryId, request.body, { variables: request.server.variables, logger: request.log });

    reply.status(StatusCodes.OK).send({ data: entry });
}

/**
 * @function remove
 * @description Takes a title off the watchlist.
 *
 * @returns {Promise<void>} Resolves when the answer is sent.
 */
async function remove(request: FastifyRequest<EntryDeleteRequest>, reply: FastifyReply): Promise<void> {
    await removeEntry(request.server.prisma, request.params.entryId);

    reply.status(StatusCodes.NO_CONTENT).send();
}

export default {
    list,
    add,
    update,
    remove
};
