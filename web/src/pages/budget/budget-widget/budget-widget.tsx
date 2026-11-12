import SpinnerComponent from 'components/spinner/spinner';
import TrackBarComponent from 'components/track-bar/track-bar';
import { monthStart } from 'modules/budget/budget-dates';
import { euro } from 'modules/budget/budget-formatting';
import { useBudget, useBudgetContext } from 'modules/budget/budget-hooks';
import { monthlyBudgetFor, operationsIn, summary } from 'modules/budget/budget-math';
import { BudgetProvider } from 'modules/budget/budget-provider';
import { t } from 'modules/language/language-service';
import { useEffect, type JSX } from 'react';

/**
 * @constant ACCENT
 * @description The bar's colour while there is budget left.
 */
const ACCENT = '#56616F';

/**
 * @constant NEGATIVE
 * @description The colour of anything over budget.
 */
const NEGATIVE = '#FF3B30';

/**
 * @function BudgetGlanceComponent
 * @description What is left to spend this month, how much of the budget is gone, and what that leaves per remaining
 * day. It reads the same budget the app shows, loading it if the app hasn't.
 *
 * @returns {JSX.Element} The glance at the budget
 */
function BudgetGlanceComponent(): JSX.Element {
    const { store } = useBudgetContext();
    const { document, status } = useBudget();

    useEffect(() => {
        if (store.getSnapshot().document === null) {
            void store.refresh();
        }
    }, [store]);

    if (document === null) {
        return (
            <div className='flex h-[118px] items-center justify-center'>
                {status !== 'syncing' ? <p className='text-[14px] text-ink-secondary'>{t('layout.loadFailed')}</p> : <SpinnerComponent />}
            </div>
        );
    }

    const now = new Date();
    const month = monthStart(now);
    const figures = summary(document.operations, month, monthlyBudgetFor(document, month), now);
    const hasOperations = operationsIn(document.operations, month).length > 0;
    const isOverBudget = hasOperations && figures.left < 0;

    return (
        <div>
            <p className={`text-[13px] font-medium ${isOverBudget ? 'text-negative-text' : 'text-ink-secondary'}`}>
                {isOverBudget ? t('budget.overspent') : t('budget.leftToSpend')}
            </p>
            <p className='mt-0.5 text-[30px] font-semibold leading-tight tracking-tight tabular-nums'>
                {hasOperations ? euro(Math.abs(figures.left)) : '•'}
            </p>
            <p className='text-[13px] text-ink-tertiary'>
                {hasOperations ? t('budget.of', { amount: euro(figures.limit) }) : t('budget.noOperations')}
            </p>
            <div className='mt-3'>
                <TrackBarComponent progress={hasOperations ? figures.progress : 0} color={isOverBudget ? NEGATIVE : ACCENT} />
            </div>
            <dl className='mt-3 flex gap-6 text-[13px]'>
                <div>
                    <dt className='text-ink-secondary'>{t('budget.perDay')}</dt>
                    <dd className='font-semibold tabular-nums'>{hasOperations ? euro(figures.perDay) : '•'}</dd>
                </div>
                <div>
                    <dt className='text-ink-secondary'>{t('budget.daysLeft')}</dt>
                    <dd className='font-semibold tabular-nums'>{hasOperations ? figures.daysLeft : '•'}</dd>
                </div>
            </dl>
        </div>
    );
}

/**
 * @function BudgetWidgetComponent
 * @description The budget's tile on the portal's home page, sharing the app's budget
 *
 * @returns {JSX.Element} The budget's tile
 */
function BudgetWidgetComponent(): JSX.Element {
    return (
        <BudgetProvider>
            <BudgetGlanceComponent />
        </BudgetProvider>
    );
}

export default BudgetWidgetComponent;
