import EmptyStateComponent from 'components/empty-state/empty-state';
import FilterChipsComponent from 'components/filter-chips/filter-chips';
import PageHeaderComponent from 'components/page-header/page-header';
import SearchFieldComponent from 'components/search-field/search-field';
import { CalendarDays } from 'lucide-react';
import type { Maybe } from 'models';
import { categoriesOf, categoryName, categoryOrFallback } from 'modules/budget/budget-categories';
import type { DayRange } from 'modules/budget/budget-dates';
import { dayKey, dayRange, isInRange, monthStart, parseDayKey } from 'modules/budget/budget-dates';
import { useBudgetEditorContext } from 'modules/budget/budget-editor-hooks';
import { money, rangeTitle, relativeDay } from 'modules/budget/budget-formatting';
import { useDocument } from 'modules/budget/budget-hooks';
import { dayGroups } from 'modules/budget/budget-math';
import type { BudgetDocument, Operation } from 'modules/budget/budget-models';
import { t } from 'modules/language/language-service';
import BudgetDatesComponent from 'pages/budget/budget-dates/budget-dates';
import BudgetHistorySummaryComponent from 'pages/budget/budget-history-summary/budget-history-summary';
import OperationRowComponent from 'pages/budget/budget-operation-row/budget-operation-row';
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

    const haystack = [operation.name, operation.description, operation.location, operation.place?.nameEn, operation.place?.nameFr, categoryName(categoryOrFallback(document.categories, operation.categoryId))];

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
 * @constant EVERY_DATE
 * @description The value of the address's dates parameter once the date filter is cleared, so every date shows
 * instead of the current month
 */
const EVERY_DATE = 'all';

/**
 * @function monthToDate
 * @description The days of the current month up to today, the date filter the tab opens with
 */
function monthToDate(): DayRange {
    const today = new Date();

    return dayRange(monthStart(today), today);
}

/**
 * @function rangeOf
 * @description The date filter in the address: the days from one to the other, or the only one that reads as a day.
 * With neither, the current month up to today, unless the filter was cleared.
 */
function rangeOf(from: Maybe<string>, to: Maybe<string>, dates: Maybe<string>): Maybe<DayRange> {
    if (from === null && to === null) {
        return dates !== EVERY_DATE ? monthToDate() : null;
    }

    const start = from !== null ? parseDayKey(from) : null;
    const end = to !== null ? parseDayKey(to) : null;

    if (start === null || end === null) {
        const only = start ?? end;

        return only !== null ? { start: only, end: only } : null;
    }

    return dayRange(start, end);
}

/**
 * @function BudgetHistoryComponent
 * @description The History tab: every operation grouped by day with each day's total, a search, and one row of filters:
 * a date filter on one day or a period, set to the current month up to today until it is changed or cleared, then one chip per category, several of which can be picked at once (All shows
 * every category). Under a date filter, the total of what is listed comes first. The filters live in the address, so a
 * category opened from Budget survives a reload. On a wide desktop, that total moves to a column beside the list, split
 * between categories, whatever the filters.
 */
function BudgetHistoryComponent(): JSX.Element {
    const document = useDocument();
    const { openEdit } = useBudgetEditorContext();
    const [params, setParams] = useSearchParams();
    const query = params.get('q') ?? '';
    const categoryIds = useMemo(() => readList(params, 'category'), [params]);
    const from = params.get('from');
    const to = params.get('to');
    const dates = params.get('dates');
    const range = useMemo(() => rangeOf(from, to, dates), [from, to, dates]);
    const [isPickingDates, setIsPickingDates] = useState(false);

    const groups = useMemo(() => dayGroups(document.operations.filter((operation) => isListed(document, operation, categoryIds, range, query))), [document, categoryIds, range, query]);

    /**
     * @function update
     * @description Changes filters in the address, dropping the ones set to nothing.
     */
    const update = (changes: Record<string, Maybe<string>>): void => {
        const next = new URLSearchParams(params);

        Object.entries(changes).forEach(([key, value]) => {
            if (value !== null && value !== '') {
                next.set(key, value);
            } else {
                next.delete(key);
            }
        });

        setParams(next, { replace: true });
    };

    /**
     * @function filterDates
     * @description Puts a date filter in the address, or takes it out so that every date shows.
     */
    const filterDates = (picked: Maybe<DayRange>): void => {
        update({ from: picked !== null ? dayKey(picked.start) : null, to: picked !== null ? dayKey(picked.end) : null, dates: picked !== null ? null : EVERY_DATE });
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
                {range !== null ? rangeTitle(range) : t('history.date')}
            </button>
            <span aria-hidden='true' className='my-1.5 w-px shrink-0 bg-hairline' />
        </>
    );

    return (
        <div className='animate-rise'>
            <PageHeaderComponent>
                <p className='eyebrow'>{t('history.eyebrow')}</p>
                <h1 className='mt-1 text-[34px] font-semibold leading-tight tracking-tight'>{t('history.title')}</h1>
            </PageHeaderComponent>

            <div className='xl:grid xl:grid-cols-12 xl:gap-6'>
                <div className='xl:col-span-8'>
                    <SearchFieldComponent value={query} onChange={(next) => update({ q: next })} placeholder={t('history.search')} clearLabel={t('history.clearSearch')} className='mt-6' />

                    <FilterChipsComponent label={t('history.filters')} allLabel={t('history.all')} options={options} selected={categoryIds} onChange={filterCategories} leading={dateChip} className='mt-2' />

                    <div className='mt-2'>
                        {groups.length === 0 && (
                            <div className='mt-6'>
                                <EmptyStateComponent message={isFiltered ? t('history.noMatch') : t('history.empty')} />
                            </div>
                        )}
                        {range !== null && groups.length > 0 && (
                            <div className='card mt-6 flex items-baseline justify-between gap-4 px-5 py-4 xl:hidden'>
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
                </div>

                {groups.length > 0 && (
                    <aside className='hidden xl:col-span-4 xl:block'>
                        <div className='sticky top-10 mt-6'>
                            <BudgetHistorySummaryComponent document={document} groups={groups} range={range} />
                        </div>
                    </aside>
                )}
            </div>

            <BudgetDatesComponent open={isPickingDates} range={range} onApply={filterDates} onClear={() => filterDates(null)} onClose={() => setIsPickingDates(false)} />
        </div>
    );
}

export default BudgetHistoryComponent;
