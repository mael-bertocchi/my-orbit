import FrameActionComponent from 'components/frame-action/frame-action';
import FrameComponent from 'components/frame/frame';
import LoadingScreenComponent from 'components/loading-screen/loading-screen';
import { useBudgetEditorContext } from 'modules/budget/budget-editor-hooks';
import { BudgetEditorProvider } from 'modules/budget/budget-editor-provider';
import { useBudget, useBudgetContext, useCatchUp } from 'modules/budget/budget-hooks';
import { budget } from 'modules/budget/budget-manifest';
import type { BudgetEditorContextProps, BudgetServices } from 'modules/budget/budget-models';
import { BudgetProvider } from 'modules/budget/budget-provider';
import { t } from 'modules/language/language-service';
import { useToastContext } from 'modules/toast/toast-hooks';
import type { ToastContextProps } from 'modules/toast/toast-models';
import BudgetAnalysisComponent from 'pages/budget/budget-analysis/budget-analysis';
import BudgetHistoryComponent from 'pages/budget/budget-history/budget-history';
import BudgetOperationComponent from 'pages/budget/budget-operation/budget-operation';
import BudgetOverviewComponent from 'pages/budget/budget-overview/budget-overview';
import BudgetSettingsComponent from 'pages/budget/budget-settings/budget-settings';
import { useEffect, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

/**
 * @function NewOperationButtonComponent
 * @description The budget's main action in the portal's bar
 *
 * @returns {JSX.Element} The new operation button
 */
function NewOperationButtonComponent(): JSX.Element {
    const { openNew }: BudgetEditorContextProps = useBudgetEditorContext();

    return (
        <FrameActionComponent label={t('navigation.newOperation')} onClick={openNew} />
    );
}

/**
 * @function BudgetOperationSheetComponent
 * @description The one operation sheet of the budget, open on what the editor says
 *
 * @returns {JSX.Element} The operation sheet
 */
function BudgetOperationSheetComponent(): JSX.Element {
    const { route, close }: BudgetEditorContextProps = useBudgetEditorContext();

    return <BudgetOperationComponent route={route} onClose={close} />;
}

/**
 * @function BudgetShellComponent
 * @description Keeps the budget in step with the server, waits for its first read, then shows the tabs in the portal's
 * frame. The server's refusals show as toasts.
 *
 * @returns {JSX.Element} The budget, or what stands in for it while it loads
 */
function BudgetShellComponent(): JSX.Element {
    const services: BudgetServices = useBudgetContext();
    const { document, status, error } = useBudget();
    const { showToast }: ToastContextProps = useToastContext();

    useEffect(() => services.store.onRejected(showToast), [services, showToast]);
    useCatchUp(services);

    if (document === null) {
        if (status === 'syncing') {
            return <LoadingScreenComponent />;
        }

        return (
            <main className='flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center'>
                <p className='text-[17px] font-semibold'>{t('layout.loadFailed')}</p>
                <p className='text-[15px] text-ink-secondary'>{error}</p>
                <button type='button' onClick={() => void services.store.refresh()} className='mt-2 rounded-full bg-accent px-5 py-2 text-[15px] font-semibold text-white'>
                    {t('layout.tryAgain')}
                </button>
            </main>
        );
    }

    return (
        <BudgetEditorProvider>
            <FrameComponent app={budget} action={<NewOperationButtonComponent />}>
                <Routes>
                    <Route index element={<BudgetOverviewComponent />} />
                    <Route path='history' element={<BudgetHistoryComponent />} />
                    <Route path='analysis' element={<BudgetAnalysisComponent />} />
                    <Route path='settings' element={<BudgetSettingsComponent />} />
                    <Route path='*' element={<Navigate to='/budget' replace />} />
                </Routes>
            </FrameComponent>
            <BudgetOperationSheetComponent />
        </BudgetEditorProvider>
    );
}

/**
 * @function BudgetPage
 * @description The budget, as the portal loads it under `/budget`. It shares one budget with its tile on the home page.
 *
 * @returns {JSX.Element} The budget page
 */
function BudgetPage(): JSX.Element {
    return (
        <BudgetProvider>
            <BudgetShellComponent />
        </BudgetProvider>
    );
}

export default BudgetPage;
