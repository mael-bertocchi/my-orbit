import type { FastifyInstance } from 'fastify';
import placesController from 'src/modules/budget/places/places-controller';
import type { PlacesLocateRequest, PlacesSearchRequest } from 'src/modules/budget/places/places-models';
import { PlacesLocateQuerySchema, PlacesSearchQuerySchema } from 'src/modules/budget/places/places-models';

/**
 * @function placesRoutes
 * @description Defines the places routes of the budget: the cities matching what is typed, and the city at a position,
 * which the operation editor suggests. They come from Geoapify, which the server asks so it never learns who asks.
 */
export default function (fastify: FastifyInstance): void {
    fastify.get<PlacesSearchRequest>('/search', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            querystring: PlacesSearchQuerySchema
        }
    }, placesController.search);

    fastify.get<PlacesLocateRequest>('/locate', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            querystring: PlacesLocateQuerySchema
        }
    }, placesController.locate);
}
