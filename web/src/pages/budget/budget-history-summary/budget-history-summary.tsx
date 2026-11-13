import type { Maybe } from 'models';
import { categoryName, categoryOrFallback, hexColor } from 'modules/budget/budget-categories';
import type { DayRange } from 'modules/budget/budget-dates';
import { money, rangeTitle } from 'modules/budget/budget-formatting';
import type { DayGroup } from 'modules/budget/budget-math';
import { euroAmount } from 'modules/budget/budget-math';
import type { BudgetDocument, Category } from 'modules/budget/budget-models';
import { t } from 'modules/language/language-service';
import type { JSX } from 'react';

/**
 * @interface CategoryTotal
 * @description What one category adds up to among the operations listed
 */
interface CategoryTotal {
    category: Category; /*!< The category */
    spent: number; /*!< Its euro total */
}

/**
 * @interface BudgetHistorySummaryComponentProps
 * @description Properties of the summary beside the history
 */
interface BudgetHistorySummaryComponentProps {
    document: BudgetDocument; /*!< The budget */
    groups: readonly DayGroup[]; /*!< The days listed, under the filters */
    range: Maybe<DayRange>; /*!< The dates filtered on, none when every date shows */
}

/**
 * @function categoryTotals
 * @description What each category adds up to among the days listed, the largest first, leaving out the categories that
 * add up to nothing
 *
 * @param {BudgetDocument} document The budget
 * @param {readonly DayGroup[]} groups The days listed
 * @returns {CategoryTotal[]} Each category's total
 */
function categoryTotals(document: BudgetDocument, groups: readonly DayGroup[]): CategoryTotal[] {
    const totals = new Map<string, number>();

    groups.flatMap((group) => group.operations).forEach((operation) => {
        totals.set(operation.categoryId, (totals.get(operation.categoryId) ?? 0) + euroAmount(operation));
    });

    return [...totals.entries()].filter(([, spent]) => spent > 0).map(([id, spent]) => ({ category: categoryOrFallback(document.categories, id), spent })).sort((left, right) => right.spent - left.spent);
}

/**
 * @function BudgetHistorySummaryComponent
 * @description On a desktop, beside the history, what the operations listed add up to, then how that total splits
 * between categories, as one bar and as a list. It follows the search and the filters.
 *
 * @param {BudgetHistorySummaryComponentProps} props The properties of the component
 */
function BudgetHistorySummaryComponent(props: BudgetHistorySummaryComponentProps): JSX.Element {
    const totals = categoryTotals(props.document, props.groups);
    const total = totals.reduce((sum, entry) => sum + entry.spent, 0);

    return (
        <section className='card p-6'>
            <p className='text-[14px] font-medium text-ink-secondary'>{t('history.totalSpent')}</p>
            <p className='mt-1 text-[32px] font-semibold leading-tight tracking-tight tabular-nums'>{money(total)}</p>
            {props.range !== null && <p className='text-[13px] text-ink-tertiary'>{rangeTitle(props.range)}</p>}

            {total > 0 && (
                <>
                    <div className='mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full' aria-hidden='true'>
                        {totals.map((entry) => (
                            <span key={entry.category.id} className='h-full' style={{ flexGrow: entry.spent, backgroundColor: hexColor(entry.category.colorHex) }} />
                        ))}
                    </div>
                    <h2 className='mt-5 text-[13px] font-semibold text-ink-secondary'>{t('budget.byCategory')}</h2>
                    <ul className='mt-2 flex flex-col gap-2.5'>
                        {totals.map((entry) => (
                            <li key={entry.category.id} className='flex items-center gap-2.5 text-[14px]'>
                                <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{ backgroundColor: hexColor(entry.category.colorHex) }} />
                                <span className='min-w-0 flex-1 truncate'>{categoryName(entry.category)}</span>
                                <span className='text-ink-secondary tabular-nums'>{money(entry.spent)}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

export default BudgetHistorySummaryComponent;
