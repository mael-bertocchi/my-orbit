import EmptyStateComponent from 'components/empty-state/empty-state';
import type { MonthBar, MonthBarsLabels } from 'components/month-bars/month-bars';
import MonthBarsComponent from 'components/month-bars/month-bars';
import PageHeaderComponent from 'components/page-header/page-header';
import { Globe, MapPin } from 'lucide-react';
import type { Maybe } from 'models';
import type { MonthTotal, PlaceSpend, SpendingHabits } from 'modules/budget/budget-analysis';
import { monthTotals, spendingHabits } from 'modules/budget/budget-analysis';
import { categoriesOf, categoryName } from 'modules/budget/budget-categories';
import { euro, monthShort, monthWithYear, percent, weekdayShort } from 'modules/budget/budget-formatting';
import { useDocument, useServerData } from 'modules/budget/budget-hooks';
import type { AnalysisFigures, Category } from 'modules/budget/budget-models';
import budgetService from 'modules/budget/budget-service';
import { t } from 'modules/language/language-service';
import BudgetLoadingComponent from 'pages/budget/budget-loading/budget-loading';
import { useState, type JSX } from 'react';

/**
 * @constant ACCENT
 * @description The colour of the bars and of the online share.
 */
const ACCENT = '#56616F';

/**
 * @constant ACCENT_LIGHT
 * @description The colour of the in-person share, next to the online one.
 */
const ACCENT_LIGHT = '#C3C9D2';

/**
 * @constant COMPARED_MONTHS
 * @description How many finished months the latest trend compares with the ones before them.
 */
const COMPARED_MONTHS = 3;

/**
 * @function spentOf
 * @description What a month spent, in all or in one category.
 *
 * @param {MonthTotal} total The month.
 * @param {Maybe<string>} categoryId The category, or null for all of them.
 *
 * @returns {number} The euros spent.
 */
function spentOf(total: MonthTotal, categoryId: Maybe<string>): number {
    return categoryId !== null ? total.byCategory[categoryId] ?? 0 : total.spent;
}

/**
 * @function average
 * @description The average of some numbers.
 *
 * @param {readonly number[]} values The numbers.
 *
 * @returns {Maybe<number>} Their average, or null without any.
 */
function average(values: readonly number[]): Maybe<number> {
    return values.length !== 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

/**
 * @interface FigureComponentProps
 * @description Properties of one figure under the chart
 */
interface FigureComponentProps {
    label: string; /*!< Its label */
    value: string; /*!< Its figure */
    note?: string; /*!< A line under it, saying what it is measured on */
}

/**
 * @function FigureComponent
 * @description One figure under the trends' chart.
 *
 * @param {FigureComponentProps} props The properties of the component
 */
function FigureComponent(props: FigureComponentProps): JSX.Element {
    return (
        <div className='rounded-2xl bg-fill px-3 py-3'>
            <p className='text-[12px] font-medium text-ink-secondary'>{props.label}</p>
            <p className='mt-0.5 text-[19px] font-semibold tracking-tight tabular-nums'>{props.value}</p>
            {props.note !== undefined && <p className='mt-0.5 text-[12px] text-ink-tertiary tabular-nums'>{props.note}</p>}
        </div>
    );
}

/**
 * @interface CategoryFilterComponentProps
 * @description Properties of the category chips
 */
interface CategoryFilterComponentProps {
    categories: Category[]; /*!< The categories to pick from */
    selected: Maybe<string>; /*!< The category picked, or null for all of them */
    onSelect: (categoryId: Maybe<string>) => void; /*!< Called with the category picked */
}

/**
 * @function chipClass
 * @description How a category chip looks, picked or not.
 *
 * @param {boolean} isSelected Whether it is picked.
 *
 * @returns {string} Its classes.
 */
function chipClass(isSelected: boolean): string {
    return `shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${isSelected ? 'bg-ink text-white' : 'bg-fill text-ink-secondary hover:bg-fill-strong'}`;
}

/**
 * @function CategoryFilterComponent
 * @description A row of chips picking the category the trends show, all of them first.
 *
 * @param {CategoryFilterComponentProps} props The properties of the component
 */
function CategoryFilterComponent(props: CategoryFilterComponentProps): JSX.Element {
    return (
        <div className='-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1'>
            <button type='button' onClick={() => props.onSelect(null)} className={chipClass(props.selected === null)}>{t('analysis.allCategories')}</button>
            {props.categories.map((category) => (
                <button key={category.id} type='button' onClick={() => props.onSelect(category.id)} className={chipClass(props.selected === category.id)}>{categoryName(category)}</button>
            ))}
        </div>
    );
}

/**
 * @interface TrendsCardComponentProps
 * @description Properties of the trends' card
 */
interface TrendsCardComponentProps {
    totals: MonthTotal[]; /*!< The months, the oldest first */
    categories: Category[]; /*!< The categories that spent over them */
}

/**
 * @function TrendsCardComponent
 * @description What each month spent over the last year, in all or in one category: a bar per month against its
 * budget, the average of the finished months, the costliest month, and the last three finished months against the three
 * before.
 *
 * @param {TrendsCardComponentProps} props The properties of the component
 */
function TrendsCardComponent(props: TrendsCardComponentProps): JSX.Element {
    const [categoryId, setCategoryId] = useState<Maybe<string>>(null);

    const finished = props.totals.filter((total) => !total.isCurrent);
    const values = finished.map((total) => spentOf(total, categoryId));
    const mean = average(values);
    const costliest = finished.reduce<Maybe<MonthTotal>>((best, total) => (best === null || spentOf(total, categoryId) > spentOf(best, categoryId) ? total : best), null);
    const recent = average(values.slice(-COMPARED_MONTHS));
    const before = values.length >= COMPARED_MONTHS * 2 ? average(values.slice(-COMPARED_MONTHS * 2, -COMPARED_MONTHS)) : null;
    const change = recent !== null && before !== null && before > 0 ? recent / before - 1 : null;
    const labels: MonthBarsLabels = { spent: t('analysis.spent'), budget: t('analysis.limit'), average: t('analysis.average'), partial: t('analysis.partial') };
    const bars: MonthBar[] = props.totals.map((total) => ({ key: total.month.toISOString(), label: monthShort(total.month), title: monthWithYear(total.month), value: spentOf(total, categoryId), marker: categoryId === null && total.limit > 0 ? total.limit : null, isPartial: total.isCurrent }));
    const trend = change !== null ? `${change > 0 ? '+' : ''}${percent(change)}` : '•';
    const costliestNote = costliest !== null ? monthWithYear(costliest.month) : undefined;
    const trendNote = recent !== null && before !== null ? t('analysis.lastThreeNote', { recent: euro(recent), before: euro(before) }) : t('analysis.notEnough');

    return (
        <section className='card p-6 sm:p-8'>
            <h2 className='text-[20px] font-semibold tracking-tight'>{t('analysis.trends')}</h2>
            <p className='mt-1 text-[13px] text-ink-secondary'>{t('analysis.trendsNote')}</p>
            <CategoryFilterComponent categories={props.categories} selected={categoryId} onSelect={setCategoryId} />

            <div className='mt-5'>
                <MonthBarsComponent bars={bars} average={mean} labels={labels} formatAmount={euro} />
            </div>

            <div className='mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3'>
                <FigureComponent label={t('analysis.monthlyAverage')} value={mean !== null ? euro(mean) : '•'} />
                <FigureComponent label={t('analysis.costliest')} value={costliest !== null ? euro(spentOf(costliest, categoryId)) : '•'} note={costliestNote} />
                <FigureComponent label={t('analysis.lastThree')} value={trend} note={trendNote} />
            </div>
        </section>
    );
}

/**
 * @interface HabitsCardComponentProps
 * @description Properties of the habits' card
 */
interface HabitsCardComponentProps {
    habits: SpendingHabits; /*!< The habits */
}

/**
 * @function HabitsCardComponent
 * @description How the last ninety days were spent, recurring operations left out: what each weekday costs on
 * average, and the share paid online.
 *
 * @param {HabitsCardComponentProps} props The properties of the component
 */
function HabitsCardComponent(props: HabitsCardComponentProps): JSX.Element {
    const { habits } = props;
    const busiest = Math.max(1, ...habits.weekdays.map((entry) => entry.average));
    const total = habits.online + habits.inPerson;
    const onlineShare = total > 0 ? habits.online / total : 0;

    return (
        <section className='card p-6 sm:p-8'>
            <h2 className='text-[20px] font-semibold tracking-tight'>{t('analysis.habits')}</h2>
            <p className='mt-1 text-[13px] text-ink-secondary'>{t('analysis.habitsNote')}</p>

            {total === 0 && (
                <div className='mt-4'>
                    <EmptyStateComponent message={t('analysis.noHabits')} />
                </div>
            )}
            {total > 0 && (
                <>
                    <h3 className='mt-5 text-[13px] font-semibold text-ink-secondary'>{t('analysis.byWeekday')}</h3>
                    <div className='mt-2 flex flex-col gap-1.5'>
                        {habits.weekdays.map((entry) => (
                            <div key={entry.weekday} className='flex items-center gap-3 text-[13px]'>
                                <span className='w-10 text-ink-secondary'>{weekdayShort(entry.weekday)}</span>
                                <span className='h-2 flex-1 overflow-hidden rounded-full bg-fill'>
                                    <span className='block h-full rounded-full' style={{ width: `${(entry.average / busiest) * 100}%`, backgroundColor: ACCENT, opacity: entry.average !== busiest ? 0.55 : 1 }} />
                                </span>
                                <span className='w-14 text-right font-medium tabular-nums'>{euro(entry.average)}</span>
                            </div>
                        ))}
                    </div>

                    <h3 className='mt-6 text-[13px] font-semibold text-ink-secondary'>{t('analysis.howPaid')}</h3>
                    <div className='mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full'>
                        <span className='h-full rounded-l-full' style={{ width: `${onlineShare * 100}%`, backgroundColor: ACCENT }} />
                        <span className='h-full flex-1 rounded-r-full' style={{ backgroundColor: ACCENT_LIGHT }} />
                    </div>
                    <div className='mt-2 flex justify-between text-[13px]'>
                        <span className='flex items-center gap-1.5'><Globe size={14} className='text-accent' />{t('analysis.online')} <span className='font-semibold tabular-nums'>{percent(onlineShare)}</span></span>
                        <span className='flex items-center gap-1.5'><MapPin size={14} className='text-ink-tertiary' />{t('analysis.inPerson')} <span className='font-semibold tabular-nums'>{percent(1 - onlineShare)}</span></span>
                    </div>

                </>
            )}
        </section>
    );
}

/**
 * @interface PlacesCardComponentProps
 * @description Properties of the places' card
 */
interface PlacesCardComponentProps {
    places: PlaceSpend[]; /*!< The places, the largest first */
}

/**
 * @function PlacesCardComponent
 * @description The places most spent at over the last ninety days, recurring operations left out, as a row of tiles,
 * or a column of them on a desktop, where the card sits beside the habits.
 *
 * @param {PlacesCardComponentProps} props The properties of the component
 */
function PlacesCardComponent(props: PlacesCardComponentProps): JSX.Element {
    return (
        <section className='card p-6 sm:p-8'>
            <h2 className='text-[20px] font-semibold tracking-tight'>{t('analysis.places')}</h2>
            <p className='mt-1 text-[13px] text-ink-secondary'>{t('analysis.habitsNote')}</p>
            <div className='mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-1'>
                {props.places.map((place, index) => (
                    <div key={place.name} className='flex min-w-0 items-center gap-3 rounded-2xl bg-fill px-3 py-2.5 sm:flex-col sm:items-start sm:gap-0 sm:py-3 lg:flex-row lg:items-center lg:gap-3 lg:py-2.5'>
                        <span className='flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-ink-secondary'><MapPin size={13} className='shrink-0 text-ink-tertiary' /><span className='tabular-nums'>{index + 1}</span></span>
                        <span className='min-w-0 flex-1 truncate text-[15px] font-semibold sm:mt-1 sm:w-full sm:flex-none lg:mt-0 lg:w-auto lg:flex-1'>{place.name}</span>
                        <span className='shrink-0 text-[13px] text-ink-secondary tabular-nums sm:mt-0.5 lg:mt-0'>{euro(place.spent)} • {t('analysis.visits', { count: String(place.count) })}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

/**
 * @interface AnalysisContentComponentProps
 * @description Properties of the Analysis tab once its figures arrived
 */
interface AnalysisContentComponentProps {
    figures: AnalysisFigures; /*!< The figures, as the server worked them out */
}

/**
 * @function AnalysisContentComponent
 * @description The Analysis tab once its figures arrived: the trends of the last months, the habits and the places.
 *
 * @param {AnalysisContentComponentProps} props The properties of the component
 */
function AnalysisContentComponent(props: AnalysisContentComponentProps): JSX.Element {
    const document = useDocument();
    const totals = monthTotals(document, props.figures);
    const spending = new Set(totals.flatMap((total) => Object.keys(total.byCategory).filter((id) => (total.byCategory[id] ?? 0) > 0)));
    const categories = categoriesOf(document.categories).filter((category) => spending.has(category.id));
    const habits = spendingHabits(props.figures);

    return (
        <div className='animate-rise'>
            <PageHeaderComponent>
                <p className='eyebrow'>{t('analysis.eyebrow')}</p>
                <h1 className='mt-1 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]'>{t('analysis.title', { count: String(totals.length) })}</h1>
            </PageHeaderComponent>

            <div className='mt-6 flex flex-col gap-5'>
                <TrendsCardComponent totals={totals} categories={categories} />
                <div className={`grid grid-cols-1 gap-5 ${habits.places.length !== 0 ? 'lg:grid-cols-2' : ''}`}>
                    <HabitsCardComponent habits={habits} />
                    {habits.places.length > 0 && <PlacesCardComponent places={habits.places} />}
                </div>
            </div>
        </div>
    );
}

/**
 * @function BudgetAnalysisComponent
 * @description The Analysis tab, about what a single month can't show: how the spending moved over the last year and
 * the recent habits, worked out by the server. On a desktop, the habits and the places share one row.
 */
function BudgetAnalysisComponent(): JSX.Element {
    const { data, error } = useServerData(budgetService.analysisFigures, 'analysis');

    return data !== null ? <AnalysisContentComponent figures={data} /> : <BudgetLoadingComponent error={error} />;
}

export default BudgetAnalysisComponent;
