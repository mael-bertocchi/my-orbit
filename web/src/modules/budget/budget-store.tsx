import type { Maybe } from 'models';
import type { BudgetDocument, BudgetServer, StoredState } from 'modules/budget/budget-models';
import type { BudgetWrite } from 'modules/budget/budget-sync';
import { diffDocuments, sendWrite } from 'modules/budget/budget-sync';
import { t } from 'modules/language/language-service';
import { RequestError } from 'utils/request';
import { messageOf } from 'utils/errors';

/**
 * @type SyncStatus
 * @description Where the page stands with the server, as the Settings badge shows it.
 */
export type SyncStatus = 'syncing' | 'synced' | 'offline' | 'error';

/**
 * @type Change
 * @description An edit to the budget, written as a function of the document it applies to. It may run more than once:
 * when the server turns a write away, it is applied again on top of what the server holds. It throws to give up.
 */
export type Change = (document: BudgetDocument) => BudgetDocument;

/**
 * @interface BudgetSnapshot
 * @description What the page renders.
 */
export interface BudgetSnapshot {
    document: Maybe<BudgetDocument>; /*!< The budget with every pending edit applied, null until first read */
    operationCount: number; /*!< How many operations the budget holds, as the server last said */
    revision: number; /*!< The server's latest known revision, which moves on with every write, wherever it comes from */
    status: SyncStatus; /*!< Where the page stands with the server */
    error: Maybe<string>; /*!< Why the last sync failed, if it did */
    hasPendingChanges: boolean; /*!< Whether some edits haven't reached the server yet */
}

/**
 * @constant RETRY_AFTER
 * @description How long to wait before trying again to send edits the server couldn't take.
 */
const RETRY_AFTER = 15 * 1000;

/**
 * @function withoutRevision
 * @description The document part of a stored state.
 */
function withoutRevision(state: StoredState): BudgetDocument {
    return { categories: state.categories, budget: state.budget, budgetHistory: state.budgetHistory };
}

/**
 * @function applyQuietly
 * @description Applies edits for display, skipping any that no longer applies.
 */
function applyQuietly(document: BudgetDocument, changes: readonly Change[]): BudgetDocument {
    return changes.reduce((current, change) => {
        try {
            return change(current);
        } catch {
            return current;
        }
    }, document);
}

/**
 * @class BudgetStore
 * @description The page's copy of the budget document, without the operations, which stay on the server. Edits to the
 * document show at once and are sent in order behind the scenes, entry by entry: the store applies them to the server's
 * latest document and sends only the categories, settings and months that differ, so what the app wrote to other entries
 * in between is never touched. Operations the page logs, changes or deletes are sent after them, in order. While the
 * page is in view it also picks up what the app writes; the revision tells the pages when to read their operations
 * again.
 */
export class BudgetStore {
    private readonly api: BudgetServer; /*!< The server */
    private confirmed: Maybe<StoredState> = null; /*!< The server's latest known budget */
    private stale = false; /*!< Whether a send failed partway, so the server's budget has to be read again before the next */
    private pending: Change[] = []; /*!< Edits not yet stored, oldest first */
    private operationWrites: BudgetWrite[] = []; /*!< Operations logged, changed or deleted, not yet stored, oldest first */
    private sending: Maybe<Promise<void>> = null; /*!< The send in progress */
    private retry: Maybe<ReturnType<typeof setTimeout>> = null; /*!< The scheduled retry of a failed send */
    private listeners = new Set<() => void>(); /*!< Who to tell about a new snapshot */
    private snapshot: BudgetSnapshot = { document: null, operationCount: 0, revision: 0, status: 'syncing', error: null, hasPendingChanges: false }; /*!< What the page renders */
    private rejectionListeners = new Set<(message: string) => void>(); /*!< Who to tell when an edit is dropped */

    /**
     * @constructor
     * @description Prepares an empty store
     *
     * @param {BudgetServer} api The server
     */
    constructor(api: BudgetServer) {
        this.api = api;
    }

    /**
     * @function subscribe
     * @description Registers a listener, for `useSyncExternalStore`.
     */
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    /**
     * @function getSnapshot
     * @description The current snapshot, for `useSyncExternalStore`.
     */
    getSnapshot = (): BudgetSnapshot => this.snapshot;

    /**
     * @method onRejected
     * @description Registers a listener told when an edit had to be dropped.
     *
     * @returns {() => void} Unregisters it.
     */
    onRejected(listener: (message: string) => void): () => void {
        this.rejectionListeners.add(listener);

        return () => {
            this.rejectionListeners.delete(listener);
        };
    }

    /**
     * @method refresh
     * @description Catches up with the server: sends pending edits if there are any, reads the latest budget otherwise. A
     * read overtaken by a write that landed first is ignored, so it can never roll the page back.
     *
     * @returns {Promise<void>} Resolves once done; failures are reported in the snapshot.
     */
    async refresh(): Promise<void> {
        if (this.hasPending() || this.sending !== null) {
            await this.send();
            return;
        }

        try {
            const remote = await this.api.getState();

            if (this.confirmed === null || remote.revision >= this.confirmed.revision) {
                this.confirmed = remote;
            }

            this.publish(this.sending !== null ? 'syncing' : 'synced', null);
        } catch (error: unknown) {
            this.fail(error);
        }
    }

    /**
     * @method apply
     * @description Applies an edit now and sends it.
     *
     * @param {Change} change The edit.
     */
    apply(change: Change): void {
        this.pending.push(change);
        this.publish('syncing', null);
        void this.send();
    }

    /**
     * @method write
     * @description Sends an operation logged, changed or deleted, after every edit before it.
     *
     * @param {BudgetWrite} write The write.
     */
    write(write: BudgetWrite): void {
        this.operationWrites.push(write);
        this.publish('syncing', null);
        void this.send();
    }

    /**
     * @method reset
     * @description Forgets everything, on sign-out.
     */
    reset(): void {
        this.confirmed = null;
        this.stale = false;
        this.pending = [];
        this.operationWrites = [];

        if (this.retry !== null) {
            clearTimeout(this.retry);
            this.retry = null;
        }

        this.publish('syncing', null);
    }

    /**
     * @method send
     * @description Sends the pending edits, one send at a time.
     */
    private async send(): Promise<void> {
        this.sending ??= this.drain().finally(() => {
            this.sending = null;
        });

        await this.sending;
    }

    /**
     * @method drain
     * @description Writes every pending edit, then every operation written. An edit that no longer applies is dropped and
     * reported, and so is a change to an operation deleted for good elsewhere.
     */
    private async drain(): Promise<void> {
        if (this.retry !== null) {
            clearTimeout(this.retry);
            this.retry = null;
        }

        try {
            while (this.hasPending()) {
                if (this.confirmed === null || this.stale) {
                    this.confirmed = await this.api.getState();
                    this.stale = false;
                }

                const batch = [...this.pending];
                const writes = [...this.operationWrites];
                let next = withoutRevision(this.confirmed);

                for (const change of batch) {
                    try {
                        next = change(next);
                    } catch (error: unknown) {
                        this.pending = this.pending.filter((candidate) => candidate !== change);
                        this.reject(messageOf(error));
                    }
                }

                for (const write of diffDocuments(withoutRevision(this.confirmed), next)) {
                    await this.sendOrForget(write);
                }

                this.pending = this.pending.filter((change) => !batch.includes(change));

                for (const write of writes) {
                    if (!await this.sendOrForget(write)) {
                        this.reject(t('operation.deletedElsewhere'));
                    }

                    this.operationWrites = this.operationWrites.filter((candidate) => candidate !== write);
                }

                this.confirmed = await this.api.getState();
            }

            this.publish('synced', null);
        } catch (error: unknown) {
            this.fail(error);
            this.retry = setTimeout(() => void this.send(), RETRY_AFTER);
        }
    }

    /**
     * @method hasPending
     * @description Whether some edits or operations haven't reached the server yet.
     */
    private hasPending(): boolean {
        return this.pending.length > 0 || this.operationWrites.length > 0;
    }

    /**
     * @method sendOrForget
     * @description Sends one write. When it fails partway through the edits, the server's budget is forgotten, so the
     * next try reads it again and only sends what is still missing.
     *
     * @param {BudgetWrite} write The write.
     * @returns {Promise<boolean>} Whether it landed.
     */
    private async sendOrForget(write: BudgetWrite): Promise<boolean> {
        try {
            return await sendWrite(this.api, write);
        } catch (error: unknown) {
            this.stale = true;
            throw error;
        }
    }

    /**
     * @method reject
     * @description Tells the listeners an edit had to be dropped.
     */
    private reject(message: string): void {
        for (const listener of this.rejectionListeners) {
            listener(message);
        }
    }

    /**
     * @method fail
     * @description Reports a failed sync.
     */
    private fail(error: unknown): void {
        if (error instanceof RequestError && error.isOffline) {
            this.publish('offline', error.message);
        } else {
            this.publish('error', messageOf(error));
        }
    }

    /**
     * @method publish
     * @description Rebuilds the snapshot and tells the listeners.
     */
    private publish(status: SyncStatus, error: Maybe<string>): void {
        this.snapshot = {
            document: this.confirmed !== null ? applyQuietly(withoutRevision(this.confirmed), this.pending) : null,
            operationCount: this.confirmed?.operationCount ?? 0,
            revision: this.confirmed?.revision ?? 0,
            status,
            error,
            hasPendingChanges: this.hasPending()
        };

        for (const listener of this.listeners) {
            listener();
        }
    }
}
