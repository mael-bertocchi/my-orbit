import type { Category, MonthlyBudget, Operation, RateSnapshot, RecurringFields, RecurringOperation, StoredState, TrashedOperation } from 'modules/budget/budget-models';
import { RateSnapshotSchema, RecurringOperationSchema, StoredStateSchema, TrashedOperationSchema } from 'modules/budget/budget-models';
import { fetchWithAuthentication } from 'utils/request';
import { z } from 'zod';

/**
 * @function getState
 * @description Reads the whole budget and its revision
 *
 * @returns {Promise<StoredState>} The budget, as the server holds it
 */
async function getState(): Promise<StoredState> {
    return await fetchWithAuthentication('/v1/budget/state', { method: 'GET' }, StoredStateSchema);
}

/**
 * @function path
 * @description The path of one budget entry, its id escaped
 *
 * @param {string} collection The kind of entry
 * @param {string} id Its id
 * @returns {string} Its path
 */
function path(collection: string, id: string): string {
    return `/v1/budget/${collection}/${encodeURIComponent(id)}`;
}

/**
 * @function operationFields
 * @description What an operation holds, as the server takes it on creation or change
 *
 * @param {Operation} operation The operation
 * @returns {Omit<Operation, 'id' | 'updatedAt' | 'recurringId'>} Its fields, without its id, its update stamp and the
 * recurring operation it is an occurrence of, which the server sets
 */
function operationFields(operation: Operation): Omit<Operation, 'id' | 'updatedAt' | 'recurringId'> {
    return {
        date: operation.date,
        name: operation.name,
        description: operation.description ?? null,
        categoryId: operation.categoryId,
        location: operation.location ?? null,
        amount: operation.amount,
        currencyCode: operation.currencyCode,
        rateToEuro: operation.rateToEuro,
        isOnline: operation.isOnline,
        isRecurring: operation.isRecurring
    };
}

/**
 * @function createOperation
 * @description Logs an operation under the id the page minted. Rejects with a conflict when the id is taken.
 *
 * @param {Operation} operation The operation
 * @returns {Promise<void>} Resolves once it is stored
 */
async function createOperation(operation: Operation): Promise<void> {
    await fetchWithAuthentication('/v1/budget/operations', { method: 'POST', body: JSON.stringify({ id: operation.id, ...operationFields(operation) }) }, z.unknown());
}

/**
 * @function updateOperation
 * @description Changes an operation. Rejects with a 404 when it is unknown or in the trash.
 *
 * @param {Operation} operation The operation, as it should now be
 * @returns {Promise<void>} Resolves once it is stored
 */
async function updateOperation(operation: Operation): Promise<void> {
    await fetchWithAuthentication(path('operations', operation.id), { method: 'PATCH', body: JSON.stringify(operationFields(operation)) }, z.unknown());
}

/**
 * @function deleteOperation
 * @description Moves an operation to the trash
 *
 * @param {string} id The operation's id
 * @returns {Promise<void>} Resolves once it is in the trash
 */
async function deleteOperation(id: string): Promise<void> {
    await fetchWithAuthentication(path('operations', id), { method: 'DELETE' }, z.unknown());
}

/**
 * @function listTrash
 * @description Reads the operations in the trash, the most recently deleted first
 *
 * @returns {Promise<TrashedOperation[]>} The deleted operations
 */
async function listTrash(): Promise<TrashedOperation[]> {
    return await fetchWithAuthentication('/v1/budget/operations/trash', { method: 'GET' }, z.array(TrashedOperationSchema));
}

/**
 * @function restoreOperation
 * @description Takes an operation out of the trash, back into the budget
 *
 * @param {string} id The operation's id
 * @returns {Promise<void>} Resolves once it is restored
 */
async function restoreOperation(id: string): Promise<void> {
    await fetchWithAuthentication(`${path('operations', id)}/restore`, { method: 'POST', body: '{}' }, z.unknown());
}

/**
 * @function listRecurring
 * @description Reads the recurring operations, once the server logged their due occurrences
 *
 * @returns {Promise<RecurringOperation[]>} The recurring operations, in the order they were created
 */
async function listRecurring(): Promise<RecurringOperation[]> {
    return await fetchWithAuthentication('/v1/budget/recurring', { method: 'GET' }, z.array(RecurringOperationSchema));
}

/**
 * @function createRecurring
 * @description Creates a recurring operation under a freshly minted id; the server logs its occurrences already due
 *
 * @param {RecurringFields} fields What it logs and when
 * @returns {Promise<RecurringOperation>} The stored recurring operation
 */
async function createRecurring(fields: RecurringFields): Promise<RecurringOperation> {
    return await fetchWithAuthentication('/v1/budget/recurring', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID().toUpperCase(), ...fields }) }, RecurringOperationSchema);
}

/**
 * @function updateRecurring
 * @description Changes a recurring operation, for its occurrences still to come
 *
 * @param {string} id Its id
 * @param {Partial<RecurringFields>} fields What changes
 * @returns {Promise<RecurringOperation>} The stored recurring operation
 */
async function updateRecurring(id: string, fields: Partial<RecurringFields>): Promise<RecurringOperation> {
    return await fetchWithAuthentication(path('recurring', id), { method: 'PATCH', body: JSON.stringify(fields) }, RecurringOperationSchema);
}

/**
 * @function deleteRecurring
 * @description Deletes a recurring operation; its occurrences already logged stay
 *
 * @param {string} id Its id
 * @returns {Promise<void>} Resolves once it is deleted
 */
async function deleteRecurring(id: string): Promise<void> {
    await fetchWithAuthentication(path('recurring', id), { method: 'DELETE' }, z.unknown());
}

/**
 * @function storeCategory
 * @description Creates a category or replaces what it holds
 *
 * @param {Category} category The category
 * @param {number} position Where it sits in the list
 * @returns {Promise<void>} Resolves once it is stored
 */
async function storeCategory(category: Category, position: number): Promise<void> {
    const body = { name: category.name, symbol: category.symbol, colorHex: category.colorHex, monthlyLimit: category.monthlyLimit, position };

    await fetchWithAuthentication(path('categories', category.id), { method: 'PUT', body: JSON.stringify(body) }, z.unknown());
}

/**
 * @function deleteCategory
 * @description Removes a category
 *
 * @param {string} id The category's id
 * @returns {Promise<void>} Resolves once it is removed
 */
async function deleteCategory(id: string): Promise<void> {
    await fetchWithAuthentication(path('categories', id), { method: 'DELETE' }, z.unknown());
}

/**
 * @function storeSettings
 * @description Stores the monthly budget
 *
 * @param {number} monthlyLimit The monthly budget
 * @returns {Promise<void>} Resolves once it is stored
 */
async function storeSettings(monthlyLimit: number): Promise<void> {
    await fetchWithAuthentication('/v1/budget/settings', { method: 'PUT', body: JSON.stringify({ monthlyLimit }) }, z.unknown());
}

/**
 * @function storeMonth
 * @description Stores the budget of a finished month
 *
 * @param {string} month The month, as `YYYY-MM`
 * @param {MonthlyBudget} budget Its budget
 * @returns {Promise<void>} Resolves once it is stored
 */
async function storeMonth(month: string, budget: MonthlyBudget): Promise<void> {
    await fetchWithAuthentication(path('history', month), { method: 'PUT', body: JSON.stringify(budget) }, z.unknown());
}

/**
 * @function deleteMonth
 * @description Forgets the budget of a finished month
 *
 * @param {string} month The month, as `YYYY-MM`
 * @returns {Promise<void>} Resolves once it is forgotten
 */
async function deleteMonth(month: string): Promise<void> {
    await fetchWithAuthentication(path('history', month), { method: 'DELETE' }, z.unknown());
}

/**
 * @function getRates
 * @description Reads the latest reference rates, in euros per unit
 *
 * @returns {Promise<RateSnapshot>} The rates
 */
async function getRates(): Promise<RateSnapshot> {
    return await fetchWithAuthentication('/v1/budget/rates', { method: 'GET' }, RateSnapshotSchema);
}

/**
 * @function getRatesOn
 * @description Reads the reference rates of one day, in euros per unit
 *
 * @param {string} day The day, as `YYYY-MM-DD`
 * @returns {Promise<RateSnapshot>} The rates
 */
async function getRatesOn(day: string): Promise<RateSnapshot> {
    return await fetchWithAuthentication(`/v1/budget/rates/${day}`, { method: 'GET' }, RateSnapshotSchema);
}

export default {
    getState,
    createOperation,
    updateOperation,
    deleteOperation,
    listTrash,
    restoreOperation,
    listRecurring,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    storeCategory,
    deleteCategory,
    storeSettings,
    storeMonth,
    deleteMonth,
    getRates,
    getRatesOn
};
