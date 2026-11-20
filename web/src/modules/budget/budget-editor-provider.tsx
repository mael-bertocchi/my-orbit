import type { Maybe } from 'models';
import { BudgetEditorContext } from 'modules/budget/budget-editor-context';
import type { BudgetEditorContextProps, BudgetEditorProviderProps, BudgetEditorRoute, Operation } from 'modules/budget/budget-models';
import { useCallback, useMemo, useState, type JSX } from 'react';

/**
 * @function BudgetEditorProvider
 * @description Holds what the one operation sheet of the budget is open on, so every page can open it
 *
 * @param {BudgetEditorProviderProps} props The provider props
 * @returns {JSX.Element} The budget editor provider component
 */
export function BudgetEditorProvider(props: BudgetEditorProviderProps): JSX.Element {
    const [route, setRoute] = useState<Maybe<BudgetEditorRoute>>(null);
    /**
     * @function openNew
     * @description Opens the sheet on a new operation
     */
    const openNew = useCallback(() => setRoute({ kind: 'new' }), []);
    /**
     * @function openEdit
     * @description Opens the sheet on an existing operation
     */
    const openEdit = useCallback((operation: Operation) => setRoute({ kind: 'edit', operation }), []);
    /**
     * @function close
     * @description Closes the sheet
     */
    const close = useCallback(() => setRoute(null), []);
    const editor = useMemo<BudgetEditorContextProps>(() => ({ route, openNew, openEdit, close }), [route, openNew, openEdit, close]);

    return (
        <BudgetEditorContext.Provider value={editor}>
            {props.children}
        </BudgetEditorContext.Provider>
    );
}
