import type { RequestGenericInterface } from 'fastify';
import { z } from 'zod';

/**
 * @constant MonthQuerySchema
 * @description Zod schema for the month the figures are about, as `YYYY-MM`.
 */
export const MonthQuerySchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/)
});

/**
 * @constant SuggestionsQuerySchema
 * @description Zod schema for what is typed in the operation editor: a name and a city, each optional.
 */
export const SuggestionsQuerySchema = z.object({
    name: z.string().max(120).default(''),
    city: z.string().max(200).default('')
});

/**
 * @interface MonthFiguresRequest
 * @description Fastify request generic for the figures of a month.
 *
 * @extends RequestGenericInterface
 */
export interface MonthFiguresRequest extends RequestGenericInterface {
    Querystring: z.infer<typeof MonthQuerySchema>; /*!< The month */
}

/**
 * @interface SuggestionsRequest
 * @description Fastify request generic for the suggestions of the operation editor.
 *
 * @extends RequestGenericInterface
 */
export interface SuggestionsRequest extends RequestGenericInterface {
    Querystring: z.infer<typeof SuggestionsQuerySchema>; /*!< What is typed */
}
