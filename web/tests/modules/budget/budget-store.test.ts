import type { BudgetDocument, BudgetServer, MonthlyBudget, Operation, StoredState } from 'modules/budget/budget-models';
import { BudgetStore } from 'modules/budget/budget-store';
import { UserError } from 'utils/errors';
import { RequestError } from 'utils/request';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import { unusedServer } from '../../support/budget-server';
import { document, NOW, operation } from '../../support/fixtures';

/**
 * @interface FakeServerState
 * @description What the fake server holds, and how it is set to behave.
 */
interface FakeServerState {
    stored: StoredState; /*!< The budget document it holds, and its revision */
    operations: Operation[]; /*!< The operations it holds */
    rivals: (() => void)[]; /*!< Writes from another device, landing before the next write */
    offline: boolean; /*!< Whether it can be reached */
    writes: string[]; /*!< The writes it took, as `route id` */
}

/**
 * @interface FakeServer
 * @description The fake server and the routes the store calls.
 */
interface FakeServer {
    state: FakeServerState; /*!< What it holds */
    api: BudgetServer & { getState: Mock<() => Promise<StoredState>> }; /*!< Its routes */
}

/**
 * @function server
 * @description A fake server holding one budget, written entry by entry, which can be made to take a rival write
 * before the next one lands, or to be unreachable.
 */
function server(initial: BudgetDocument, operations: Operation[] = []): FakeServer {
    const state: FakeServerState = { stored: { ...initial, operationCount: operations.length, revision: 1 }, operations, rivals: [], offline: false, writes: [] };
    const unreachable = (): Promise<never> => Promise.reject(new RequestError(0, "Can't reach the server."));
    const write = (label: string, edit: (current: StoredState) => StoredState): Promise<void> => {
        if (state.offline) {
            return unreachable();
        }

        const rival = state.rivals.shift();

        if (rival !== undefined) {
            rival();
            state.stored = { ...state.stored, revision: state.stored.revision + 1 };
        }

        state.writes.push(label);
        state.stored = { ...edit(structuredClone(state.stored)), revision: state.stored.revision + 1 };

        return Promise.resolve();
    };
    const api: FakeServer['api'] = {
        ...unusedServer(),
        getState: vi.fn(() => (state.offline ? unreachable() : Promise.resolve(structuredClone(state.stored)))),
        createOperation: vi.fn((created: Operation) => {
            if (state.operations.some((entry) => entry.id === created.id)) {
                return Promise.reject(new RequestError(409, 'An operation with this id already exists'));
            }

            return write(`createOperation ${created.id}`, (current) => {
                state.operations = [...state.operations, created];

                return current;
            });
        }),
        updateOperation: vi.fn((changed: Operation) => {
            if (!state.operations.some((entry) => entry.id === changed.id)) {
                return Promise.reject(new RequestError(404, 'Unknown operation'));
            }

            return write(`updateOperation ${changed.id}`, (current) => {
                state.operations = state.operations.map((entry) => (entry.id !== changed.id ? entry : changed));

                return current;
            });
        }),
        deleteOperation: vi.fn((id: string) => write(`deleteOperation ${id}`, (current) => {
            state.operations = state.operations.filter((entry) => entry.id !== id);

            return current;
        })),
        storeSettings: vi.fn((monthlyLimit: number) => write('storeSettings', (current) => ({ ...current, budget: { monthlyLimit } }))),
        storeMonth: vi.fn((month: string, budget: MonthlyBudget) => write(`storeMonth ${month}`, (current) => ({ ...current, budgetHistory: { ...current.budgetHistory, [month]: budget } })))
    };

    return { state, api };
}

/**
 * @function settle
 * @description Lets the store's queued sends run.
 */
async function settle(): Promise<void> {
    for (let turn = 0; turn < 20; turn += 1) {
        await Promise.resolve();
    }
}

describe('BudgetStore', () => {
    it('shows an edit at once and sends only that entry', async () => {
        const { state, api } = server(document());
        const store = new BudgetStore(api);

        await store.refresh();
        store.apply((current) => ({ ...current, budget: { monthlyLimit: 2500 } }));

        expect(store.getSnapshot().document?.budget.monthlyLimit).toBe(2500);
        await settle();
        expect(state.writes).toEqual(['storeSettings']);
        expect(store.getSnapshot()).toMatchObject({ status: 'synced', hasPendingChanges: false });
    });

    it('sends an operation and moves on to the server\'s new revision, so the pages read again', async () => {
        const { state, api } = server(document());
        const store = new BudgetStore(api);

        await store.refresh();
        store.write({ kind: 'createOperation', operation: operation({ id: 'A', date: NOW }) });

        expect(store.getSnapshot().hasPendingChanges).toBe(true);
        await settle();
        expect(state.writes).toEqual(['createOperation A']);
        expect(store.getSnapshot()).toMatchObject({ status: 'synced', hasPendingChanges: false, revision: 2 });
    });

    it('leaves alone what the app wrote in between, erasing nothing', async () => {
        const { state, api } = server(document());
        const store = new BudgetStore(api);

        await store.refresh();
        state.rivals.push(() => {
            state.operations = [...state.operations, operation({ id: 'FROM-THE-APP', date: NOW })];
        });
        store.write({ kind: 'createOperation', operation: operation({ id: 'FROM-THE-WEB', date: NOW }) });
        await settle();

        expect(state.operations.map((entry) => entry.id).sort()).toEqual(['FROM-THE-APP', 'FROM-THE-WEB']);
    });

    it('drops an edit that no longer applies and says so', async () => {
        const { api } = server(document());
        const store = new BudgetStore(api);
        const rejected = vi.fn();

        store.onRejected(rejected);
        await store.refresh();
        store.apply(() => {
            throw new UserError('This operation was deleted on another device.');
        });
        await settle();

        expect(rejected).toHaveBeenCalledWith('This operation was deleted on another device.');
        expect(store.getSnapshot().hasPendingChanges).toBe(false);
    });

    it('keeps edits while offline and sends them once the server is back', async () => {
        const { state, api } = server(document());
        const store = new BudgetStore(api);

        await store.refresh();
        state.offline = true;
        store.apply((current) => ({ ...current, budget: { monthlyLimit: 2500 } }));
        await settle();

        expect(store.getSnapshot()).toMatchObject({ status: 'offline', hasPendingChanges: true });
        expect(store.getSnapshot().document?.budget.monthlyLimit).toBe(2500);

        state.offline = false;
        await store.refresh();

        expect(state.stored.budget.monthlyLimit).toBe(2500);
        expect(store.getSnapshot().status).toBe('synced');
        store.reset();
    });

    it('never rolls back to a read that a write overtook', async () => {
        const { state, api } = server(document());
        const store = new BudgetStore(api);
        const stale = structuredClone(state.stored);

        await store.refresh();
        store.apply((current) => ({ ...current, budget: { monthlyLimit: 1234 } }));
        await settle();
        vi.mocked(api.getState).mockResolvedValueOnce(stale);
        await store.refresh();

        expect(store.getSnapshot().document?.budget.monthlyLimit).toBe(1234);
    });

    it('takes a creation the server already holds as a change, so a retried send never fails', async () => {
        const { state, api } = server(document(), [operation({ id: 'A', date: NOW, amount: 5 })]);
        const store = new BudgetStore(api);

        await store.refresh();
        store.write({ kind: 'createOperation', operation: operation({ id: 'A', date: NOW, amount: 12 }) });
        await settle();

        expect(state.operations).toEqual([expect.objectContaining({ id: 'A', amount: 12 })]);
        expect(store.getSnapshot().status).toBe('synced');
    });

    it('brings back an operation deleted elsewhere in the meantime, with the change', async () => {
        const { state, api } = server(document());
        const store = new BudgetStore(api);
        const rejected = vi.fn();
        const trashed = operation({ id: 'A', date: NOW });

        store.onRejected(rejected);
        await store.refresh();
        vi.mocked(api.restoreOperation).mockImplementation(() => {
            state.operations = [trashed];

            return Promise.resolve();
        });
        store.write({ kind: 'updateOperation', operation: operation({ id: 'A', date: NOW, amount: 99 }) });
        await settle();

        expect(rejected).not.toHaveBeenCalled();
        expect(state.operations.map((entry) => entry.amount)).toEqual([99]);
        expect(store.getSnapshot()).toMatchObject({ status: 'synced', hasPendingChanges: false });
    });

    it('drops a change to an operation gone for good, even from the trash, and says so', async () => {
        const { state, api } = server(document());
        const store = new BudgetStore(api);
        const rejected = vi.fn();

        store.onRejected(rejected);
        await store.refresh();
        vi.mocked(api.restoreOperation).mockRejectedValue(new RequestError(404, 'Unknown operation'));
        store.write({ kind: 'updateOperation', operation: operation({ id: 'A', date: NOW, amount: 99 }) });
        await settle();

        expect(rejected).toHaveBeenCalledWith('This operation was deleted on another device.');
        expect(state.operations).toEqual([]);
        expect(store.getSnapshot()).toMatchObject({ status: 'synced', hasPendingChanges: false });
    });
});
