import type { FastifyReply, FastifyRequest } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import type { PlacesLocateRequest, PlacesSearchRequest } from 'src/modules/budget/places/places-models';
import { locatePlace, placesContextOf, searchPlaces } from 'src/modules/budget/places/places-service';

/**
 * @function search
 * @description Suggests the cities whose name starts with what is typed.
 *
 * @returns {Promise<void>} Resolves when the cities are sent.
 */
async function search(request: FastifyRequest<PlacesSearchRequest>, reply: FastifyReply): Promise<void> {
    const places = await searchPlaces(placesContextOf(request), request.query.query, request.query.language);

    reply.status(StatusCodes.OK).send({ data: places });
}

/**
 * @function locate
 * @description Sends the city at a position.
 *
 * @returns {Promise<void>} Resolves when the city is sent.
 */
async function locate(request: FastifyRequest<PlacesLocateRequest>, reply: FastifyReply): Promise<void> {
    const place = await locatePlace(placesContextOf(request), request.query.latitude, request.query.longitude, request.query.language);

    reply.status(StatusCodes.OK).send({ data: place });
}

export default {
    search,
    locate
};
