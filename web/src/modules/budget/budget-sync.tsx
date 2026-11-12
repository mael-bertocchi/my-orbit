import type { BudgetDocument, BudgetServer, Category, MonthlyBudget, Operation } from 'modules/budget/budget-models';
import { RequestError } from 'utils/request';

/**
 * @type BudgetWrite
 * @description One write to the server, entry by entry: what it takes to bring the server's budget to the page's.
 */
export type BudgetWrite =
    | { kind: 'createOperation'; operation: Operation }
    | { kind: 'updateOperation'; operation: Operation }
    | { kind: 'deleteOperation'; id: string }
    | { kind: 'storeCategory'; category: Category; position: number }
    | { kind: 'deleteCategory'; id: string }
    | { kind: 'storeSettings'; monthlyLimit: number }
    | { kind: 'storeMonth'; month: string; budget: MonthlyBudget }
    | { kind: 'deleteMonth'; month: string };

/**
 * @function sameOperation
 * @description Whether two operations hold the same thing, setting aside what the server rewrites on its own (its
 * update stamp, an absent text written as null).
 */
function sameOperation(lhs: Operation, rhs: Operation): boolean {
    return lhs.date.getTime() === rhs.date.getTime()
        && lhs.name === rhs.name
        && (lhs.description ?? null) === (rhs.description ?? null)
        && lhs.categoryId === rhs.categoryId
        && (lhs.location ?? null) === (rhs.location ?? null)
        && (lhs.placeId ?? null) === (rhs.placeId ?? null)
        && lhs.amount === rhs.amount
        && lhs.currencyCode === rhs.currencyCode
        && lhs.rateToEuro === rhs.rateToEuro
        && lhs.isOnline === rhs.isOnline;
}

/**
 * @function sameCategory
 * @description Whether two categories hold the same thing.
 */
function sameCategory(lhs: Category, rhs: Category): boolean {
    return lhs.name === rhs.name && lhs.symbol === rhs.symbol && lhs.colorHex === rhs.colorHex && lhs.monthlyLimit === rhs.monthlyLimit;
}

/**
 * @function sameMonth
 * @description Whether two finished months hold the same budget.
 */
function sameMonth(lhs: MonthlyBudget, rhs: MonthlyBudget): boolean {
    const keys = new Set([...Object.keys(lhs.categoryLimits), ...Object.keys(rhs.categoryLimits)]);

    return lhs.monthlyLimit === rhs.monthlyLimit && [...keys].every((key) => lhs.categoryLimits[key] === rhs.categoryLimits[key]);
}

/**
 * @function operationWrites
 * @description The writes that turn one list of operations into another.
 */
function operationWrites(before: readonly Operation[], after: readonly Operation[]): BudgetWrite[] {
    const previous = new Map(before.map((operation) => [operation.id, operation]));
    const next = new Set(after.map((operation) => operation.id));
    const writes: BudgetWrite[] = [];

    for (const operation of after) {
        const known = previous.get(operation.id);

        if (known === undefined) {
            writes.push({ kind: 'createOperation', operation });
        } else if (!sameOperation(known, operation)) {
            writes.push({ kind: 'updateOperation', operation });
        }
    }

    for (const operation of before) {
        if (!next.has(operation.id)) {
            writes.push({ kind: 'deleteOperation', id: operation.id });
        }
    }

    return writes;
}

/**
 * @function categoryWrites
 * @description The writes that turn one list of categories into another, their order included.
 */
function categoryWrites(before: readonly Category[], after: readonly Category[]): BudgetWrite[] {
    const previous = new Map(before.map((category, position) => [category.id, { category, position }]));
    const next = new Set(after.map((category) => category.id));
    const writes: BudgetWrite[] = [];

    after.forEach((category, position) => {
        const known = previous.get(category.id);

        if (known === undefined || known.position !== position || !sameCategory(known.category, category)) {
            writes.push({ kind: 'storeCategory', category, position });
        }
    });

    for (const category of before) {
        if (!next.has(category.id)) {
            writes.push({ kind: 'deleteCategory', id: category.id });
        }
    }

    return writes;
}

/**
 * @function historyWrites
 * @description The writes that turn one budget history into another.
 */
function historyWrites(before: Readonly<Record<string, MonthlyBudget>>, after: Readonly<Record<string, MonthlyBudget>>): BudgetWrite[] {
    const writes: BudgetWrite[] = [];

    for (const [month, budget] of Object.entries(after)) {
        const known = before[month];

        if (known === undefined || !sameMonth(known, budget)) {
            writes.push({ kind: 'storeMonth', month, budget });
        }
    }

    for (const month of Object.keys(before)) {
        if (!(month in after)) {
            writes.push({ kind: 'deleteMonth', month });
        }
    }

    return writes;
}

/**
 * @function diffDocuments
 * @description The writes that bring the server's budget to the page's: only the entries that differ, never the whole
 * budget. Categories go first, so an operation never lands before the category it is filed under.
 *
 * @param {BudgetDocument} before The budget as the server holds it
 * @param {BudgetDocument} after The budget as the page wants it
 * @returns {BudgetWrite[]} The writes, in the order to send them
 */
export function diffDocuments(before: BudgetDocument, after: BudgetDocument): BudgetWrite[] {
    const settings: BudgetWrite[] = before.budget.monthlyLimit !== after.budget.monthlyLimit ? [{ kind: 'storeSettings', monthlyLimit: after.budget.monthlyLimit }] : [];

    return [
        ...categoryWrites(before.categories, after.categories),
        ...settings,
        ...historyWrites(before.budgetHistory, after.budgetHistory),
        ...operationWrites(before.operations, after.operations)
    ];
}

/**
 * @function isStatus
 * @description Whether an error is the server refusing with a given status.
 */
function isStatus(error: unknown, status: number): boolean {
    return error instanceof RequestError && error.status === status;
}

/**
 * @function sendWrite
 * @description Sends one write. Every write can be sent again safely: a creation the server already took (an earlier
 * send whose answer was lost) becomes a change, and deleting what is already gone is a success.
 *
 * @param {BudgetServer} api The server
 * @param {BudgetWrite} write The write
 * @returns {Promise<boolean>} Whether it landed: false when it changes an operation deleted elsewhere in the meantime
 */
export async function sendWrite(api: BudgetServer, write: BudgetWrite): Promise<boolean> {
    try {
        switch (write.kind) {
            case 'createOperation':
                await api.createOperation(write.operation).catch(async (error: unknown) => {
                    if (!isStatus(error, 409)) {
                        throw error;
                    }

                    await api.updateOperation(write.operation);
                });
                break;
            case 'updateOperation':
                await api.updateOperation(write.operation);
                break;
            case 'deleteOperation':
                await api.deleteOperation(write.id);
                break;
            case 'storeCategory':
                await api.storeCategory(write.category, write.position);
                break;
            case 'deleteCategory':
                await api.deleteCategory(write.id);
                break;
            case 'storeSettings':
                await api.storeSettings(write.monthlyLimit);
                break;
            case 'storeMonth':
                await api.storeMonth(write.month, write.budget);
                break;
            case 'deleteMonth':
                await api.deleteMonth(write.month);
                break;
        }
    } catch (error: unknown) {
        if (!isStatus(error, 404)) {
            throw error;
        }

        return write.kind !== 'createOperation' && write.kind !== 'updateOperation';
    }

    return true;
}
