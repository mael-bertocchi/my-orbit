import CategoryIconComponent from 'components/category-icon/category-icon';
import EmptyStateComponent from 'components/empty-state/empty-state';
import SheetComponent from 'components/sheet/sheet';
import SpinnerComponent from 'components/spinner/spinner';
import { ChevronRight } from 'lucide-react';
import type { Maybe } from 'models';
import { categoriesOf, categoryOrFallback } from 'modules/budget/budget-categories';
import { bankRate, currencyNamed } from 'modules/budget/budget-currencies';
import { dayShort, euro, money } from 'modules/budget/budget-formatting';
import { useDocument, useRates } from 'modules/budget/budget-hooks';
import type { Category, RecurringOperation } from 'modules/budget/budget-models';
import { dayOf, intervalLabel, isRunning, monthlyEuros } from 'modules/budget/budget-recurring';
import budgetService from 'modules/budget/budget-service';
import { t } from 'modules/language/language-service';
import type { RecurringEditorRoute } from 'pages/budget/budget-recurring/budget-recurring';
import BudgetRecurringComponent from 'pages/budget/budget-recurring/budget-recurring';
import { useEffect, useState, type JSX } from 'react';
import { messageOf } from 'utils/errors';

/**
 * @interface BudgetRecurringListComponentProps
 * @description Properties of the recurring operations' sheet
 */
interface BudgetRecurringListComponentProps {
    open: boolean; /*!< Whether it is shown */
    onClose: () => void; /*!< Called when it is dismissed */
}

/**
 * @interface RecurringRowComponentProps
 * @description Properties of one recurring operation
 */
interface RecurringRowComponentProps {
    recurring: RecurringOperation; /*!< The recurring operation */
    category: Category; /*!< Its category */
    monthly: Maybe<number>; /*!< What it costs a month on average, in euros, none while its rate is unknown */
    onOpen: (recurring: RecurringOperation) => void; /*!< Called to open it */
}

/**
 * @function RecurringRowComponent
 * @description A recurring operation: its name, how often it comes back and when next, and what it costs a month and a
 * year. Opening it shows its details, to change or delete it.
 *
 * @param {RecurringRowComponentProps} props The properties of the component
 */
function RecurringRowComponent(props: RecurringRowComponentProps): JSX.Element {
    const { recurring, category, monthly } = props;
    const next = dayOf(recurring.nextDate);
    let status = next !== null ? t('recurring.nextOn', { date: dayShort(next).replaceAll(' ', ' ') }) : t('recurring.ended');

    if (recurring.isPaused) {
        status = t('recurring.paused');
    }

    return (
        <button type='button' onClick={() => props.onOpen(recurring)} className={`pressable flex w-full items-center gap-3 px-4 py-2.5 text-left ${isRunning(recurring) ? '' : 'opacity-60'}`}>
            <CategoryIconComponent category={category} size={34} />
            <span className='min-w-0 flex-1'>
                <span className='block truncate text-[15px] font-medium'>{recurring.name}</span>
                <span className='block text-[13px] leading-snug text-ink-secondary'>{`${intervalLabel(recurring.intervalMonths)} • ${status}`}</span>
            </span>
            <span className='text-right'>
                <span className='block text-[15px] font-semibold tabular-nums'>{money(recurring.amount, currencyNamed(recurring.currencyCode))}</span>
                <span className='block text-[13px] text-ink-secondary tabular-nums'>{monthly !== null ? t('recurring.perYear', { amount: euro(monthly * 12) }) : '•'}</span>
            </span>
            <ChevronRight size={17} className='shrink-0 text-ink-quaternary' />
        </button>
    );
}

/**
 * @function RecurringListComponent
 * @description The recurring operations, read from the server each time the sheet opens, the running ones first, each
 * kind by its next occurrence: a button adds one, and each opens to be changed, paused or deleted.
 */
function RecurringListComponent(): JSX.Element {
    const document = useDocument();
    const rates = useRates();
    const [recurring, setRecurring] = useState<Maybe<RecurringOperation[]>>(null);
    const [failure, setFailure] = useState<Maybe<string>>(null);
    const [route, setRoute] = useState<Maybe<RecurringEditorRoute>>(null);
    const categories = categoriesOf(document.categories);

    useEffect(() => {
        budgetService.listRecurring().then(setRecurring).catch((error: unknown) => setFailure(messageOf(error)));
    }, []);

    /**
     * @function monthlyOf
     * @description What a recurring operation costs a month on average, in euros, at the latest rate of its currency
     */
    const monthlyOf = (candidate: RecurringOperation): Maybe<number> => {
        const reference = rates.latest?.rates[candidate.currencyCode];

        return monthlyEuros(candidate, reference !== undefined ? bankRate(reference, candidate.currencyCode) : null);
    };

    /**
     * @function saved
     * @description Puts the stored recurring operation in the list, in place of its former self
     */
    const saved = (stored: RecurringOperation): void => {
        setRecurring((current) => (current?.some((candidate) => candidate.id === stored.id) ? current.map((candidate) => (candidate.id !== stored.id ? candidate : stored)) : [...current ?? [], stored]));
        setRoute(null);
    };

    /**
     * @function deleted
     * @description Takes a deleted recurring operation out of the list
     */
    const deleted = (id: string): void => {
        setRecurring((current) => current?.filter((candidate) => candidate.id !== id) ?? null);
        setRoute(null);
    };

    const sorted = (recurring ?? []).toSorted((left, right) => Number(isRunning(right)) - Number(isRunning(left)) || (left.nextDate ?? '').localeCompare(right.nextDate ?? ''));

    let body: JSX.Element = (
        <div className='flex justify-center py-10'>
            <SpinnerComponent />
        </div>
    );

    if (failure !== null) {
        body = <EmptyStateComponent message={`${t('recurring.loadFailed')} ${failure}`} />;
    } else if (recurring !== null && sorted.length === 0) {
        body = <EmptyStateComponent message={t('recurring.empty')} />;
    } else if (recurring !== null) {
        body = (
            <div className='card divide-y divide-hairline overflow-hidden'>
                {sorted.map((candidate) => (
                    <RecurringRowComponent key={candidate.id} recurring={candidate} category={categoryOrFallback(categories, candidate.categoryId)} monthly={monthlyOf(candidate)} onOpen={(opened) => setRoute({ kind: 'edit', recurring: opened })} />
                ))}
            </div>
        );
    }

    return (
        <>
            <button type='button' onClick={() => setRoute({ kind: 'new' })} className='mb-4 w-full rounded-xl bg-fill px-4 py-2.5 text-[15px] font-medium text-accent transition hover:bg-fill-strong'>
                {t('recurring.new')}
            </button>
            {body}
            <BudgetRecurringComponent route={route} onSaved={saved} onDeleted={deleted} onClose={() => setRoute(null)} />
        </>
    );
}

/**
 * @function BudgetRecurringListComponent
 * @description The recurring operations, in a sheet opened from the settings
 *
 * @param {BudgetRecurringListComponentProps} props The properties of the component
 */
function BudgetRecurringListComponent(props: BudgetRecurringListComponentProps): JSX.Element {
    return (
        <SheetComponent open={props.open} title={t('recurring.title')} onClose={props.onClose} isFull>
            <p className='mb-4 text-[14px] text-ink-secondary'>{t('recurring.note')}</p>
            <RecurringListComponent />
        </SheetComponent>
    );
}

export default BudgetRecurringListComponent;
