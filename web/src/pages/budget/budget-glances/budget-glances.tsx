import CategoryIconComponent from 'components/category-icon/category-icon';
import SpinnerComponent from 'components/spinner/spinner';
import type { Maybe } from 'models';
import { categoryOrFallback } from 'modules/budget/budget-categories';
import { currencyNamed } from 'modules/budget/budget-currencies';
import { useBudgetEditorContext } from 'modules/budget/budget-editor-hooks';
import { dayShort, money } from 'modules/budget/budget-formatting';
import { useDocument } from 'modules/budget/budget-hooks';
import { operationsIn } from 'modules/budget/budget-math';
import type { RecurringOperation } from 'modules/budget/budget-models';
import { dayOf, isRunning } from 'modules/budget/budget-recurring';
import budgetService from 'modules/budget/budget-service';
import { t } from 'modules/language/language-service';
import OperationRowComponent from 'pages/budget/budget-operation-row/budget-operation-row';
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { messageOf } from 'utils/errors';

/**
 * @constant UPCOMING_COUNT
 * @description How many coming occurrences the upcoming card lists
 */
const UPCOMING_COUNT = 5;

/**
 * @constant LATEST_COUNT
 * @description How many operations the latest card lists
 */
const LATEST_COUNT = 5;

/**
 * @interface GlanceCardComponentProps
 * @description Properties of a card beside the categories
 */
interface GlanceCardComponentProps {
    title: string; /*!< Its title */
    link: string; /*!< The page that lists everything it sums up */
    linkLabel: string; /*!< The link's label */
    children: ReactNode; /*!< Its list */
}

/**
 * @interface GlanceEmptyComponentProps
 * @description Properties of what an empty card says
 */
interface GlanceEmptyComponentProps {
    children: ReactNode; /*!< The message */
}

/**
 * @interface LatestCardComponentProps
 * @description Properties of the latest operations' card
 */
interface LatestCardComponentProps {
    month: Date; /*!< The first day of the month shown */
}

/**
 * @function GlanceCardComponent
 * @description A card beside the categories: its title with a link to the page listing everything, then its list
 *
 * @param {GlanceCardComponentProps} props The properties of the component
 */
function GlanceCardComponent(props: GlanceCardComponentProps): JSX.Element {
    return (
        <section className='card flex min-w-0 flex-col overflow-hidden'>
            <div className='flex items-baseline justify-between gap-3 px-5 pb-1 pt-6'>
                <h2 className='truncate text-[17px] font-semibold tracking-tight'>{props.title}</h2>
                <Link to={props.link} className='shrink-0 text-[14px] font-medium text-accent hover:text-accent-strong'>{props.linkLabel}</Link>
            </div>
            {props.children}
        </section>
    );
}

/**
 * @function GlanceEmptyComponent
 * @description What a card says while its list is empty, centred in the room it has
 *
 * @param {GlanceEmptyComponentProps} props The properties of the component
 */
function GlanceEmptyComponent(props: GlanceEmptyComponentProps): JSX.Element {
    return (
        <div className='flex flex-1 items-center justify-center px-5 py-8 text-center text-[14px] text-ink-secondary'>
            {props.children}
        </div>
    );
}

/**
 * @function UpcomingCardComponent
 * @description The recurring operations coming next, the soonest first, each with its category, its name, the day it
 * is due on and its amount. Paused or ended ones are left out.
 */
export function UpcomingCardComponent(): JSX.Element {
    const document = useDocument();
    const [recurring, setRecurring] = useState<Maybe<RecurringOperation[]>>(null);
    const [failure, setFailure] = useState<Maybe<string>>(null);

    useEffect(() => {
        budgetService.listRecurring().then(setRecurring).catch((error: unknown) => setFailure(messageOf(error)));
    }, []);

    const coming = (recurring ?? []).filter((candidate) => isRunning(candidate) && dayOf(candidate.nextDate) !== null).toSorted((left, right) => (left.nextDate ?? '').localeCompare(right.nextDate ?? '')).slice(0, UPCOMING_COUNT);

    let body: JSX.Element = (
        <div className='flex flex-1 items-center justify-center py-8'>
            <SpinnerComponent />
        </div>
    );

    if (failure !== null) {
        body = <GlanceEmptyComponent>{`${t('analysis.recurringFailed')} ${failure}`}</GlanceEmptyComponent>;
    } else if (recurring !== null && coming.length === 0) {
        body = <GlanceEmptyComponent>{t('budget.noUpcoming')}</GlanceEmptyComponent>;
    } else if (recurring !== null) {
        body = (
            <ul className='divide-y divide-hairline px-5 pb-3'>
                {coming.map((candidate) => {
                    const next = dayOf(candidate.nextDate);

                    return (
                        <li key={candidate.id} className='flex items-center gap-3 py-2.5'>
                            <CategoryIconComponent category={categoryOrFallback(document.categories, candidate.categoryId)} size={30} />
                            <span className='min-w-0 flex-1'>
                                <span className='block truncate text-[14px] font-medium'>{candidate.name}</span>
                                <span className='block text-[12px] text-ink-tertiary'>{next !== null ? dayShort(next) : ''}</span>
                            </span>
                            <span className='shrink-0 text-[14px] font-semibold tabular-nums'>{money(candidate.amount, currencyNamed(candidate.currencyCode))}</span>
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <GlanceCardComponent title={t('budget.upcoming')} link='/budget/analysis' linkLabel={t('budget.seeAll')}>
            {body}
        </GlanceCardComponent>
    );
}

/**
 * @function LatestCardComponent
 * @description The month's latest operations, as History lists them, each opening its sheet
 *
 * @param {LatestCardComponentProps} props The properties of the component
 */
export function LatestCardComponent(props: LatestCardComponentProps): JSX.Element {
    const document = useDocument();
    const { openEdit } = useBudgetEditorContext();
    const latest = operationsIn(document.operations, props.month).toSorted((left, right) => right.date.getTime() - left.date.getTime()).slice(0, LATEST_COUNT);

    return (
        <GlanceCardComponent title={t('budget.latest')} link='/budget/history' linkLabel={t('navigation.history')}>
            {latest.length !== 0 ? (
                <div className='divide-y divide-hairline pb-2'>
                    {latest.map((operation) => (
                        <OperationRowComponent key={operation.id} document={document} operation={operation} onOpen={() => openEdit(operation.id)} />
                    ))}
                </div>
            ) : (
                <GlanceEmptyComponent>{t('budget.emptyMonth')}</GlanceEmptyComponent>
            )}
        </GlanceCardComponent>
    );
}
