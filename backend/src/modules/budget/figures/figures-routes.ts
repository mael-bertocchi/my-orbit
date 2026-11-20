import type { FastifyInstance } from 'fastify';
import figuresController from 'src/modules/budget/figures/figures-controller';
import type { MonthFiguresRequest, SuggestionsRequest } from 'src/modules/budget/figures/figures-models';
import { MonthQuerySchema, SuggestionsQuerySchema } from 'src/modules/budget/figures/figures-models';

/**
 * @function figuresRoutes
 * @description Defines the routes of the figures the server works out from the operations, so the apps never hold them
 * all: a month's spending, the Analysis tab, and the operation editor's suggestions.
 */
export default function (fastify: FastifyInstance): void {
    fastify.get<MonthFiguresRequest>('/month', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            querystring: MonthQuerySchema
        }
    }, figuresController.month);

    fastify.get('/analysis', {
        preHandler: [fastify.identity.authenticate]
    }, figuresController.analysis);

    fastify.get<SuggestionsRequest>('/suggestions', {
        preHandler: [fastify.identity.authenticate],
        schema: {
            querystring: SuggestionsQuerySchema
        }
    }, figuresController.suggestions);
}
