import CategoryIconComponent from 'components/category-icon/category-icon';
import { AlignLeft, Globe, MapPin, Repeat } from 'lucide-react';
import { categoryOrFallback } from 'modules/budget/budget-categories';
import { currencyNamed, EURO } from 'modules/budget/budget-currencies';
import { clockTime, euroPrecise, money, whereabouts } from 'modules/budget/budget-formatting';
import { euroAmount } from 'modules/budget/budget-math';
import type { BudgetDocument, Operation } from 'modules/budget/budget-models';
import { t } from 'modules/language/language-service';
import type { JSX } from 'react';

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
    const isOccurrence = (props.operation.recurringId ?? '') !== '';

    return (
        <button type='button' onClick={props.onOpen} className='flex w-full items-center gap-3.5 px-4 py-3.5 text-left pressable sm:px-5'>
            <CategoryIconComponent category={category} size={40} />
            <span className='min-w-0 flex-1'>
                <span className='flex items-center gap-1.5'>
                    <span className='truncate text-[15px] font-medium'>{props.operation.name}</span>
                    {isOccurrence && (
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
                    {!props.operation.isOnline && whereabouts(props.operation) !== '' && (
                        <span className='flex min-w-0 items-center gap-1'>
                            <MapPin size={12} className='shrink-0' />{' '}
                            <span className='truncate'>{whereabouts(props.operation)}</span>
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

export default OperationRowComponent;
