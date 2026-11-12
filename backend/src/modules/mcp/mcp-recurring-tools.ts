import { randomUUID } from 'node:crypto';

import { withPlace } from 'src/modules/budget/places/places-service';
import { CurrencyCodeSchema } from 'src/modules/budget/rates/rates-models';
import { INTERVALS } from 'src/modules/budget/recurring/recurring-models';
import type { RecurringOperation } from 'src/modules/budget/recurring/recurring-models';
import { isRealDay } from 'src/modules/budget/recurring/recurring-schedule';
import { createRecurring, deleteRecurring, listRecurring, updateRecurring } from 'src/modules/budget/recurring/recurring-service';
import type { ServerTool, ToolContext, ToolOutcome } from 'src/modules/mcp/mcp-tools';
import { DaySchema, failed, invalid, unknownCategory } from 'src/modules/mcp/mcp-tools';
import type { Perhaps } from 'src/shared/models';
import { z } from 'zod';

/**
 * @constant CalendarDaySchema
 * @description Zod schema for a day of the calendar, as `YYYY-MM-DD`.
 */
const CalendarDaySchema = DaySchema.refine(isRealDay, { message: 'Not a day of the calendar' });

/**
 * @constant IntervalSchema
 * @description Zod schema for how many months lie between two occurrences.
 */
const IntervalSchema = z.union(INTERVALS.map((interval) => z.literal(interval)));

/**
 * @constant INTERVAL_DESCRIPTION
 * @description How the model is told about the interval.
 */
const INTERVAL_DESCRIPTION = 'Months between two occurrences: 1 (monthly), 3 (quarterly), 6 (twice a year) or 12 (yearly)';

/**
 * @function findRecurring
 * @description Finds a recurring operation by its id.
 *
 * @param {ToolContext} context What the tool works with.
 * @param {string} id Its id.
 *
 * @returns {Promise<Perhaps<RecurringOperation>>} It, or undefined when it is unknown.
 */
async function findRecurring(context: ToolContext, id: string): Promise<Perhaps<RecurringOperation>> {
    const recurring = await listRecurring(context.prisma, context.logger);

    return recurring.find((candidate) => candidate.id === id);
}

/**
 * @constant UNKNOWN_RECURRING
 * @description The outcome of a call naming a recurring operation the budget does not hold.
 */
const UNKNOWN_RECURRING: ToolOutcome = { result: { error: 'Unknown recurring operation: find its id with budget_list_recurring' } };

/**
 * @constant listRecurringTool
 * @description Lists the recurring operations, each with its next occurrence.
 */
export const listRecurringTool: ServerTool = {
    isReadOnly: true,
    isDestructive: false,
    declaration: {
        name: 'budget_list_recurring',
        description: 'Lists the recurring operations (rent, subscriptions...): what each logs, how often, from when, until when, whether it is paused, and its next occurrence. Each occurrence is logged in the budget as a plain operation on its day.',
        parameters: {
            type: 'object',
            properties: {}
        }
    },
    run: async (context: ToolContext): Promise<ToolOutcome> => {
        const recurring = await listRecurring(context.prisma, context.logger);

        return { result: { recurring: recurring.map(({ updatedAt: _updatedAt, ...rest }) => rest) } };
    }
};

/**
 * @constant CreateRecurringSchema
 * @description Zod schema for the arguments of `budget_create_recurring`.
 */
const CreateRecurringSchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    categoryId: z.string().min(1),
    location: z.string().trim().max(200).optional(),
    amount: z.number().positive().max(1_000_000_000),
    currencyCode: CurrencyCodeSchema,
    isOnline: z.boolean().default(false),
    firstDate: CalendarDaySchema,
    intervalMonths: IntervalSchema.default(1),
    endDate: CalendarDaySchema.optional()
});

/**
 * @constant createRecurringTool
 * @description Creates a recurring operation, logging its occurrences already due.
 */
export const createRecurringTool: ServerTool = {
    isReadOnly: false,
    isDestructive: false,
    declaration: {
        name: 'budget_create_recurring',
        description: 'Creates a recurring operation, such as a rent or a subscription. Every occurrence, from the first date on, is logged in the budget as an operation on its day, priced at that day\'s rate; those already due are logged at once. Use a category id from budget_list_categories.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'What it is, usually the merchant' },
                description: { type: 'string', description: 'A note, if the owner gave one' },
                categoryId: { type: 'string', description: 'One of the category ids' },
                location: { type: 'string', description: 'The city or place, if any' },
                amount: { type: 'number', description: 'The amount in its own currency' },
                currencyCode: { type: 'string', description: 'ISO 4217 code, EUR unless the owner said otherwise' },
                isOnline: { type: 'boolean', description: 'Whether it is paid online, false by default' },
                firstDate: { type: 'string', description: 'Its first occurrence, YYYY-MM-DD; every occurrence falls on the same day of the month, or the month\'s last day when shorter' },
                intervalMonths: { type: 'integer', enum: [...INTERVALS], description: INTERVAL_DESCRIPTION },
                endDate: { type: 'string', description: 'The last day an occurrence may fall on, YYYY-MM-DD, if it ends' }
            },
            required: ['name', 'categoryId', 'amount', 'currencyCode', 'firstDate']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = CreateRecurringSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const refusal = await unknownCategory(context.prisma, parsed.data.categoryId);

        if (refusal !== undefined) {
            return refusal;
        }

        try {
            const recurring = await createRecurring(context.prisma, context.logger, { ...await withPlace(context, parsed.data), id: randomUUID().toUpperCase(), isPaused: false });

            return { result: { status: 'Created', recurring } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};

/**
 * @constant UpdateRecurringSchema
 * @description Zod schema for the arguments of `budget_update_recurring`.
 */
const UpdateRecurringSchema = z.object({
    recurringId: z.string().min(1),
    changes: z.object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        categoryId: z.string().min(1).optional(),
        location: z.string().trim().max(200).nullable().optional(),
        amount: z.number().positive().max(1_000_000_000).optional(),
        currencyCode: CurrencyCodeSchema.optional(),
        isOnline: z.boolean().optional(),
        firstDate: CalendarDaySchema.optional(),
        intervalMonths: IntervalSchema.optional(),
        endDate: CalendarDaySchema.nullable().optional(),
        isPaused: z.boolean().optional()
    })
});

/**
 * @constant updateRecurringTool
 * @description Changes a recurring operation, for its occurrences still to come.
 */
export const updateRecurringTool: ServerTool = {
    isReadOnly: false,
    isDestructive: false,
    declaration: {
        name: 'budget_update_recurring',
        description: 'Changes a recurring operation, found first with budget_list_recurring. Only the fields given change, and only for the occurrences still to come: those already logged stay as they are. Pausing it skips its occurrences until it is resumed; an end date set to null makes it endless.',
        parameters: {
            type: 'object',
            properties: {
                recurringId: { type: 'string', description: 'The recurring operation\'s id' },
                changes: {
                    type: 'object',
                    description: 'Only the fields that change',
                    properties: {
                        name: { type: 'string' },
                        description: { type: ['string', 'null'] },
                        categoryId: { type: 'string' },
                        location: { type: ['string', 'null'] },
                        amount: { type: 'number' },
                        currencyCode: { type: 'string' },
                        isOnline: { type: 'boolean' },
                        firstDate: { type: 'string', description: 'YYYY-MM-DD' },
                        intervalMonths: { type: 'integer', enum: [...INTERVALS], description: INTERVAL_DESCRIPTION },
                        endDate: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null for no end' },
                        isPaused: { type: 'boolean' }
                    }
                }
            },
            required: ['recurringId', 'changes']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = UpdateRecurringSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        if (await findRecurring(context, parsed.data.recurringId) === undefined) {
            return UNKNOWN_RECURRING;
        }

        const refusal = await unknownCategory(context.prisma, parsed.data.changes.categoryId);

        if (refusal !== undefined) {
            return refusal;
        }

        try {
            const recurring = await updateRecurring(context.prisma, context.logger, parsed.data.recurringId, await withPlace(context, parsed.data.changes));

            return { result: { status: 'Changed', recurring } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};

/**
 * @constant DeleteRecurringSchema
 * @description Zod schema for the arguments of `budget_delete_recurring`.
 */
const DeleteRecurringSchema = z.object({
    recurringId: z.string().min(1)
});

/**
 * @constant deleteRecurringTool
 * @description Deletes a recurring operation, keeping the occurrences already logged.
 */
export const deleteRecurringTool: ServerTool = {
    isReadOnly: false,
    isDestructive: true,
    declaration: {
        name: 'budget_delete_recurring',
        description: 'Deletes one recurring operation, found first with budget_list_recurring: no occurrence is logged anymore, and those already logged stay in the budget. It cannot be restored, so only delete one the owner asked for; to stop it for a while, pause it with budget_update_recurring instead.',
        parameters: {
            type: 'object',
            properties: {
                recurringId: { type: 'string', description: 'The recurring operation\'s id' }
            },
            required: ['recurringId']
        }
    },
    run: async (context: ToolContext, args: Record<string, unknown>): Promise<ToolOutcome> => {
        const parsed = DeleteRecurringSchema.safeParse(args);

        if (!parsed.success) {
            return invalid(parsed.error);
        }

        const existing = await findRecurring(context, parsed.data.recurringId);

        if (existing === undefined) {
            return UNKNOWN_RECURRING;
        }

        try {
            await deleteRecurring(context.prisma, existing.id);

            return { result: { status: 'Deleted', recurring: { id: existing.id, name: existing.name } } };
        } catch (error: unknown) {
            return failed(error);
        }
    }
};
