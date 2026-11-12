import CategoryIconComponent from 'components/category-icon/category-icon';
import SheetComponent from 'components/sheet/sheet';
import type { Maybe } from 'models';
import { categoriesOf, categoryName } from 'modules/budget/budget-categories';
import { euro, monthWithYear } from 'modules/budget/budget-formatting';
import { useDocument } from 'modules/budget/budget-hooks';
import { useBudgetContext } from 'modules/budget/budget-hooks';
import { isPastMonth, monthlyBudgetFor, withMonthlyBudget } from 'modules/budget/budget-math';
import { amountInputOf, groupAmountInput, sanitizeAmountInput } from 'modules/budget/budget-operations';
import { t } from 'modules/language/language-service';
import { useState, type FormEvent, type JSX } from 'react';

/**
 * @function parseLimit
 * @description Reads a limit field, where an empty one keeps the current value.
 */
function parseLimit(text: string): Maybe<number> {
    const cleaned = sanitizeAmountInput(text);

    return cleaned !== '' ? Number(cleaned) : null;
}

/**
 * @interface LimitsFormComponentProps
 * @description Properties of the limits form
 */
interface LimitsFormComponentProps {
    month: Date; /*!< The month whose budget is edited */
    onDone: () => void; /*!< Called once saved */
}

/**
 * @function LimitsFormComponent
 * @description The sheet's content, mounted fresh each time it opens.
 *
 * @param {LimitsFormComponentProps} props The properties of the component
 */
function LimitsFormComponent(props: LimitsFormComponentProps): JSX.Element {
    const document = useDocument();
    const { store } = useBudgetContext();
    const categories = categoriesOf(document.categories);
    const stored = monthlyBudgetFor(document, props.month);
    const [monthly, setMonthly] = useState(amountInputOf(stored.monthlyLimit));
    const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(categories.map((category) => [category.id, amountInputOf(stored.categoryLimits[category.id] ?? 0)])));
    const scope = isPastMonth(props.month) ? t('limits.scopePast', { month: monthWithYear(props.month) }) : t('limits.scopeCurrent');

    const budget = parseLimit(monthly) ?? 0;
    const remaining = budget - categories.reduce((total, category) => total + (parseLimit(limits[category.id] ?? '') ?? 0), 0);

    let dispatch = { text: t('limits.dispatched'), className: 'text-positive-text' };

    if (remaining > 0) {
        dispatch = { text: t('limits.toDispatch', { amount: euro(remaining) }), className: 'text-accent' };
    } else if (remaining < 0) {
        dispatch = { text: t('limits.overBudget', { amount: euro(-remaining) }), className: 'text-negative-text' };
    }

    /**
     * @function save
     * @description Stores the month's limits, keeping any left empty as they were.
     */
    const save = (): void => {
        const edit = { monthlyLimit: parseLimit(monthly), categoryLimits: Object.fromEntries(Object.entries(limits).map(([id, text]) => [id, parseLimit(text)])) };

        store.apply((current) => withMonthlyBudget(current, props.month, edit));
        props.onDone();
    };

    /**
     * @function submit
     * @description Saves the limits instead of sending the form
     */
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        save();
    };

    return (
        <form id='limits-form' onSubmit={submit}>
            <p className='mb-5 text-[14px] text-ink-secondary'>{scope}</p>
            <label className='field-label' htmlFor='monthly-limit'>{t('limits.monthly')}</label>
            <div className='relative'>
                <span className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-tertiary'>
                    €
                </span>
                <input id='monthly-limit' className='field pl-8 text-[17px] font-semibold tabular-nums' inputMode='decimal' value={monthly} onChange={(event) => setMonthly(groupAmountInput(sanitizeAmountInput(event.target.value)))} placeholder='3000' />
            </div>

            <div className='mb-2 mt-7 flex items-baseline justify-between'>
                <h3 className='text-[15px] font-semibold'>{t('limits.categories')}</h3>
                <span className={`text-[13px] font-medium ${dispatch.className}`}>{dispatch.text}</span>
            </div>
            <div className='divide-y divide-hairline rounded-2xl bg-fill/60'>
                {categories.map((category) => (
                    <label key={category.id} className='flex items-center gap-3 px-3.5 py-2.5'>
                        <CategoryIconComponent category={category} size={30} />
                        <span className='flex-1 text-[15px]'>{categoryName(category)}</span>
                        <span className='text-[15px] text-ink-tertiary'>€</span>
                        <input className='h-9 w-24 rounded-lg bg-white px-2.5 text-right text-[15px] font-medium tabular-nums outline-none ring-1 ring-hairline transition focus:ring-2 focus:ring-accent/50' inputMode='decimal' value={limits[category.id] ?? ''} placeholder='0' aria-label={t('limits.categoryLimit', { category: categoryName(category) })} onChange={(event) => setLimits({ ...limits, [category.id]: groupAmountInput(sanitizeAmountInput(event.target.value)) })} />
                    </label>
                ))}
            </div>
        </form>
    );
}

/**
 * @interface BudgetLimitsComponentProps
 * @description Properties of the limits sheet
 */
interface BudgetLimitsComponentProps {
    month: Date; /*!< The month whose budget is edited */
    open: boolean; /*!< Whether it is shown */
    onClose: () => void; /*!< Called when it is dismissed */
}

/**
 * @function BudgetLimitsComponent
 * @description The Edit limits sheet: a month's budget, each category's limit, and what is left to dispatch. A past
 * month's budget is its own; the current month's carries on to the next ones.
 *
 * @param {BudgetLimitsComponentProps} props The properties of the component
 */
function BudgetLimitsComponent(props: BudgetLimitsComponentProps): JSX.Element {
    /**
     * @constant footer
     * @description The button saving the limits, pinned under them
     */
    const footer = (
        <button type='submit' form='limits-form' className='button-primary'>
            {t('limits.save')}
        </button>
    );

    return (
        <SheetComponent open={props.open} title={t('limits.title')} onClose={props.onClose} footer={footer}>
            <LimitsFormComponent month={props.month} onDone={props.onClose} />
        </SheetComponent>
    );
}

export default BudgetLimitsComponent;
