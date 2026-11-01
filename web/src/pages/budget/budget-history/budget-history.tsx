import CategoryIconComponent from 'components/category-icon/category-icon';
import EmptyStateComponent from 'components/empty-state/empty-state';
import FilterChipsComponent from 'components/filter-chips/filter-chips';
import SearchFieldComponent from 'components/search-field/search-field';
import { AlignLeft, CalendarDays, Globe, MapPin, Repeat } from 'lucide-react';
import type { Maybe } from 'models';
import { categoriesOf, categoryName, categoryOrFallback } from 'modules/budget/budget-categories';
import { currencyNamed, EURO } from 'modules/budget/budget-currencies';
import type { DayRange } from 'modules/budget/budget-dates';
import { dayKey, dayRange, isInRange, parseDayKey } from 'modules/budget/budget-dates';
import { useBudgetEditorContext } from 'modules/budget/budget-editor-hooks';
import { clockTime, euroPrecise, money, rangeTitle, relativeDay } from 'modules/budget/budget-formatting';
import { useDocument } from 'modules/budget/budget-hooks';
import { dayGroups, euroAmount } from 'modules/budget/budget-math';
import type { BudgetDocument, Operation } from 'modules/budget/budget-models';
import { t } from 'modules/language/language-service';
import BudgetDatesComponent from 'pages/budget/budget-dates/budget-dates';
import { useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readList, writeList } from 'utils/filters';

/**
 * @function matches
 * @description Whether an operation matches a search, by name, note, place or category, as the app searches.
 */
function matches(document: BudgetDocument, operation: Operation, query: string): boolean {
    const needle = query.trim().toLowerCase();

    if (needle === '') {
        return true;
    }

    const haystack = [operation.name, operation.description, operation.location, categoryName(categoryOrFallback(document.categories, operation.categoryId))];

    return haystack.some((text) => (text ?? '').toLowerCase().includes(needle));
}

/**
 * @function isListed
 * @description Whether an operation shows under the filters: in one of the categories picked (any category when none
 * is), within the dates picked, and matching the search.
 */
function isListed(document: BudgetDocument, operation: Operation, categoryIds: readonly string[], range: Maybe<DayRange>, query: string): boolean {
    const isInCategories = categoryIds.length === 0 || categoryIds.includes(operation.categoryId);
    const isInDates = range === null || isInRange(operation.date, range);

    return isInCategories && isInDates && matches(document, operation, query);
}

/**
 * @function rangeOf
 * @description The date filter in the address: the days from one to the other, or the only one that reads as a day.
 */
function rangeOf(from: Maybe<string>, to: Maybe<string>): Maybe<DayRange> {
    const start = from === null ? null : parseDayKey(from);
    const end = to === null ? null : parseDayKey(to);

    if (start === null || end === null) {
        const only = start ?? end;

        return only === null ? null : { start: only, end: only };
    }

    return dayRange(start, end);
}

/**
 * @interface OperationRowComponentProps
 * @description Properties of one operation row
 */
interface OperationRowComponentProps {
    document: BudgetDocument; /*!< The budget */
    operation: Operation; /*!< The operation */
    onOpen: () => void; /*!< Called to open it */
}

/**
 * @function OperationRowComponent
 * @description One operation: its category, name and marks, when and where it happened, and its amount, with the euro
 * figure under a foreign one.
 *
 * @param {OperationRowComponentProps} props The properties of the component
 */
function OperationRowComponent(props: OperationRowComponentProps): JSX.Element {
    const category = categoryOrFallback(props.document.categories, props.operation.categoryId);
    const isForeign = props.operation.currencyCode !== EURO.code;
    const hasDescription = (props.operation.description ?? '') !== '';

    return (
        <button type='button' onClick={props.onOpen} className='flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-fill/60 sm:px-5'>
            <CategoryIconComponent category={category} size={40} />
            <span className='min-w-0 flex-1'>
                <span className='flex items-center gap-1.5'>
                    <span className='truncate text-[15px] font-medium'>{props.operation.name}</span>
                    {props.operation.isRecurring && (
                        <Repeat size={13} className='shrink-0 text-ink-quaternary' aria-label={t('history.recurring')} />
                    )}
                    {hasDescription && (
                        <AlignLeft size={13} className='shrink-0 text-ink-quaternary' aria-label={t('history.hasNote')} />
                    )}
                </span>
                <span className='mt-0.5 flex items-center gap-2 text-[13px] text-ink-secondary'>
                    <time dateTime={props.operation.date.toISOString()} className='shrink-0 tabular-nums'>
                        {clockTime(props.operation.date)}
                    </time>
                    {props.operation.isOnline && (
                        <span className='flex items-center gap-1'><Globe size={12} /> {t('history.online')}</span>
                    )}
                    {!props.operation.isOnline && (props.operation.location ?? '') !== '' && (
                        <span className='flex min-w-0 items-center gap-1'>
                            <MapPin size={12} className='shrink-0' />{' '}
                            <span className='truncate'>{props.operation.location}</span>
                        </span>
                    )}
                </span>
            </span>
            <span className='shrink-0 text-right'>
                <span className='block text-[15px] font-semibold tabular-nums'>
                    {money(props.operation.amount, currencyNamed(props.operation.currencyCode))}
                </span>
                {isForeign && (
                    <span className='block text-[12px] text-ink-tertiary tabular-nums'>
                        {euroPrecise(euroAmount(props.operation))}
                    </span>
                )}
            </span>
        </button>
    );
}

/**
 * @function BudgetHistoryComponent
 * @description The History tab: every operation grouped by day with each day's total, a search, and one row of filters:
 * a date filter on one day or a period, then one chip per category, several of which can be picked at once (All shows
 * every category). Under a date filter, the total of what is listed comes first. The filters live in the address, so a
 * category opened from Budget survives a reload.
 */
function BudgetHistoryComponent(): JSX.Element {
    const document = useDocument();
    const { openEdit } = useBudgetEditorContext();
    const [params, setParams] = useSearchParams();
    const query = params.get('q') ?? '';
    const categoryIds = useMemo(() => readList(params, 'category'), [params]);
    const from = params.get('from');
    const to = params.get('to');
    const range = useMemo(() => rangeOf(from, to), [from, to]);
    const [isPickingDates, setIsPickingDates] = useState(false);

    const groups = useMemo(() => dayGroups(document.operations.filter((operation) => isListed(document, operation, categoryIds, range, query))), [document, categoryIds, range, query]);

    /**
     * @function update
     * @description Changes filters in the address, dropping the ones set to nothing.
     */
    const update = (changes: Record<string, Maybe<string>>): void => {
        const next = new URLSearchParams(params);

        Object.entries(changes).forEach(([key, value]) => {
            if (value === null || value === '') {
                next.delete(key);
            } else {
                next.set(key, value);
            }
        });

        setParams(next, { replace: true });
    };

    /**
     * @function filterDates
     * @description Puts a date filter in the address, or takes it out.
     */
    const filterDates = (picked: Maybe<DayRange>): void => {
        update({ from: picked === null ? null : dayKey(picked.start), to: picked === null ? null : dayKey(picked.end) });
        setIsPickingDates(false);
    };

    /**
     * @function filterCategories
     * @description Puts the categories picked in the address, or takes them out when every category shows.
     */
    const filterCategories = (picked: string[]): void => {
        setParams(writeList(params, 'category', picked), { replace: true });
    };

    const isFiltered = query !== '' || categoryIds.length > 0 || range !== null;
    const options = categoriesOf(document.categories).map((category) => ({ value: category.id, label: categoryName(category) }));
    const dateChip = (
        <>
            <button type='button' aria-haspopup='dialog' onClick={() => setIsPickingDates(true)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition ${range !== null ? 'bg-ink text-white' : 'bg-white text-ink shadow-control hover:bg-fill'}`}>
                <CalendarDays size={15} />
                {range === null ? t('history.date') : rangeTitle(range)}
            </button>
            <span aria-hidden='true' className='my-1.5 w-px shrink-0 bg-hairline' />
        </>
    );

    return (
        <div className='animate-rise'>
            <p className='eyebrow'>{t('history.eyebrow')}</p>
            <h1 className='mt-1 text-[34px] font-semibold leading-tight tracking-tight'>{t('history.title')}</h1>

            <SearchFieldComponent value={query} onChange={(next) => update({ q: next })} placeholder={t('history.search')} clearLabel={t('history.clearSearch')} className='mt-6' />

            <FilterChipsComponent label={t('history.filters')} allLabel={t('history.all')} options={options} selected={categoryIds} onChange={filterCategories} leading={dateChip} className='mt-2' />

            <div className='mt-2'>
                {groups.length === 0 && (
                    <div className='mt-6'>
                        <EmptyStateComponent message={isFiltered ? t('history.noMatch') : t('history.empty')} />
                    </div>
                )}
                {range !== null && groups.length > 0 && (
                    <div className='card mt-6 flex items-baseline justify-between gap-4 px-5 py-4'>
                        <span className='text-[15px] font-medium text-ink-secondary'>{t('history.totalSpent')}</span>
                        <span className='text-[20px] font-semibold tracking-tight tabular-nums'>
                            {money(groups.reduce((total, group) => total + group.spent, 0))}
                        </span>
                    </div>
                )}
                {groups.map((group) => (
                    <section key={group.date.getTime()}>
                        <div className='flex items-baseline justify-between px-1 pb-2 pt-7'>
                            <h2 className='eyebrow'>{relativeDay(group.date)}</h2>
                            <span className='text-[13px] text-ink-tertiary tabular-nums'>{money(group.spent)}</span>
                        </div>
                        <div className='card divide-y divide-hairline overflow-hidden'>
                            {group.operations.map((operation) => (
                                <OperationRowComponent key={operation.id} document={document} operation={operation} onOpen={() => openEdit(operation.id)} />
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            <BudgetDatesComponent open={isPickingDates} range={range} onApply={filterDates} onClear={() => filterDates(null)} onClose={() => setIsPickingDates(false)} />
        </div>
    );
}

export default BudgetHistoryComponent;
