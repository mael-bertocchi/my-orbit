import EmptyStateComponent from 'components/empty-state/empty-state';
import FilterChipsComponent from 'components/filter-chips/filter-chips';
import PageHeaderComponent from 'components/page-header/page-header';
import SearchFieldComponent from 'components/search-field/search-field';
import { CalendarDays } from 'lucide-react';
import type { Maybe } from 'models';
import { categoriesOf, categoryName } from 'modules/budget/budget-categories';
import type { DayRange } from 'modules/budget/budget-dates';
import { dayKey, dayRange, parseDayKey } from 'modules/budget/budget-dates';
import { useBudgetEditorContext } from 'modules/budget/budget-editor-hooks';
import { money, rangeTitle, relativeDay } from 'modules/budget/budget-formatting';
import { useBudget, useDocument } from 'modules/budget/budget-hooks';
import { dayGroups } from 'modules/budget/budget-math';
import type { Operation, OperationPage, OperationQuery } from 'modules/budget/budget-models';
import budgetService from 'modules/budget/budget-service';
import { t } from 'modules/language/language-service';
import BudgetDatesComponent from 'pages/budget/budget-dates/budget-dates';
import BudgetLoadingComponent from 'pages/budget/budget-loading/budget-loading';
import OperationRowComponent from 'pages/budget/budget-operation-row/budget-operation-row';
import { useEffect, useEffectEvent, useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messageOf } from 'utils/errors';
import { readList, writeList } from 'utils/filters';

/**
 * @constant PAGE_SIZE
 * @description How many operations the list shows at most at first, and each tap on Show more adds: the server sends
 * whole days only, so a day is never split between two pages
 */
const PAGE_SIZE = 40;

/**
 * @constant RELOAD_MAX
 * @description How many operations already shown are read again at most when the budget changes, as the server sends
 * no more at once.
 */
const RELOAD_MAX = 100;

/**
 * @constant SEARCH_DELAY
 * @description How long typing must pause before the search is sent to the server, in milliseconds.
 */
const SEARCH_DELAY = 250;

/**
 * @interface LoadedOperations
 * @description The operations read so far for some filters.
 */
interface LoadedOperations {
    key: string; /*!< The filters they were read for */
    operations: Operation[]; /*!< The operations read, the latest first */
    total: number; /*!< How many operations match the filters */
}

/**
 * @function withoutRepeats
 * @description Operations read in several pages, each once: one logged meanwhile shifts the next page by one.
 */
function withoutRepeats(operations: readonly Operation[]): Operation[] {
    const seen = new Set<string>();

    return operations.filter((operation) => {
        if (seen.has(operation.id)) {
            return false;
        }

        seen.add(operation.id);

        return true;
    });
}

/**
 * @function rangeOf
 * @description The date filter in the address: the days from one to the other, or the only one that reads as a day.
 * With neither, every date shows.
 */
function rangeOf(from: Maybe<string>, to: Maybe<string>): Maybe<DayRange> {
    if (from === null && to === null) {
        return null;
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
 * a date filter on one day or a period, every date showing until one is picked, then one chip per category, several of
 * which can be picked at once (All shows every category). The server sends the latest operations under the filters and
 * the search, PAGE_SIZE at a time: Show more, at the end of the list, adds the next ones, and changing the filters or
 * the search starts over from the first page. When the budget changes, from the page or elsewhere, what is shown is read
 * again. The filters live in the address, so a category opened from Budget survives a reload.
 */
function BudgetHistoryComponent(): JSX.Element {
    const document = useDocument();
    const { revision } = useBudget();
    const { openEdit } = useBudgetEditorContext();
    const [params, setParams] = useSearchParams();
    const query = params.get('q') ?? '';
    const categoryIds = useMemo(() => readList(params, 'category'), [params]);
    const from = params.get('from');
    const to = params.get('to');
    const range = useMemo(() => rangeOf(from, to), [from, to]);
    const [isPickingDates, setIsPickingDates] = useState(false);
    const [search, setSearch] = useState(query);
    const [loaded, setLoaded] = useState<Maybe<LoadedOperations>>(null);
    const [failure, setFailure] = useState<Maybe<string>>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const filters = useMemo((): OperationQuery => {
        const needle = search.trim().toLowerCase();
        const queryCategories = needle !== '' ? categoriesOf(document.categories).filter((category) => categoryName(category).toLowerCase().includes(needle)).map((category) => category.id) : [];

        return { categories: categoryIds, from: range !== null ? dayKey(range.start) : null, to: range !== null ? dayKey(range.end) : null, query: search.trim(), queryCategories };
    }, [document.categories, categoryIds, range, search]);
    const key = JSON.stringify(filters);
    const current = loaded !== null && loaded.key === key ? loaded : null;
    const groups = useMemo(() => dayGroups(current?.operations ?? []), [current]);
    const hasMore = current !== null && current.operations.length < current.total;

    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(query), SEARCH_DELAY);

        return () => window.clearTimeout(timer);
    }, [query]);

    /**
     * @function readShown
     * @description Reads the operations under the filters again: as many as are shown, or a first page
     */
    const readShown = useEffectEvent(async (): Promise<OperationPage> => {
        const count = current !== null ? Math.min(RELOAD_MAX, Math.max(PAGE_SIZE, current.operations.length)) : PAGE_SIZE;

        return await budgetService.listOperations(filters, 0, count);
    });

    useEffect(() => {
        let isCurrent = true;

        readShown().then((page) => {
            if (isCurrent) {
                setLoaded({ key, operations: page.operations, total: page.total });
                setFailure(null);
            }
        }).catch((error: unknown) => {
            if (isCurrent) {
                setFailure(messageOf(error));
            }
        });

        return () => {
            isCurrent = false;
        };
    }, [key, revision]);

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
        update({ from: picked !== null ? dayKey(picked.start) : null, to: picked !== null ? dayKey(picked.end) : null });
        setIsPickingDates(false);
    };

    /**
     * @function filterCategories
     * @description Puts the categories picked in the address, or takes them out when every category shows.
     */
    const filterCategories = (picked: string[]): void => {
        setParams(writeList(params, 'category', picked), { replace: true });
    };

    /**
     * @function showMore
     * @description Reads the next PAGE_SIZE operations under the same filters and search, and adds them to the list.
     */
    const showMore = async (): Promise<void> => {
        if (current === null) {
            return;
        }

        setIsLoadingMore(true);

        try {
            const page = await budgetService.listOperations(filters, current.operations.length, PAGE_SIZE);

            setLoaded((previous) => (previous !== null && previous.key === key ? { key, operations: withoutRepeats([...previous.operations, ...page.operations]), total: page.total } : previous));
        } catch (error: unknown) {
            setFailure(messageOf(error));
        } finally {
            setIsLoadingMore(false);
        }
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

            <SearchFieldComponent value={query} onChange={(next) => update({ q: next })} placeholder={t('history.search')} clearLabel={t('history.clearSearch')} className='mt-6' />

            <FilterChipsComponent label={t('history.filters')} allLabel={t('history.all')} options={options} selected={categoryIds} onChange={filterCategories} leading={dateChip} className='mt-2' />

            <div className='mt-2'>
                {current === null && <BudgetLoadingComponent error={failure} />}
                {current !== null && groups.length === 0 && (
                    <div className='mt-6'>
                        <EmptyStateComponent message={isFiltered ? t('history.noMatch') : t('history.empty')} />
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
                                <OperationRowComponent key={operation.id} document={document} operation={operation} onOpen={() => openEdit(operation)} />
                            ))}
                        </div>
                    </section>
                ))}
                {hasMore && (
                    <button type='button' disabled={isLoadingMore} onClick={() => void showMore()} className='mx-auto mt-6 flex h-10 items-center rounded-full bg-white px-5 text-[15px] font-medium text-ink shadow-control transition hover:bg-fill disabled:opacity-50'>
                        {t('history.showMore')}
                    </button>
                )}
            </div>

            <BudgetDatesComponent open={isPickingDates} range={range} onApply={filterDates} onClear={() => filterDates(null)} onClose={() => setIsPickingDates(false)} />
        </div>
    );
}

export default BudgetHistoryComponent;
