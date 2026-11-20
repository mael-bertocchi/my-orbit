import SpinnerComponent from 'components/spinner/spinner';
import type { Maybe } from 'models';
import type { JSX } from 'react';

/**
 * @interface BudgetLoadingComponentProps
 * @description Properties of what shows while figures are on their way from the server
 */
interface BudgetLoadingComponentProps {
    error: Maybe<string>; /*!< Why reading them failed, none while they are on their way */
}

/**
 * @function BudgetLoadingComponent
 * @description What shows in place of figures the server hasn't sent yet: a spinner, or why reading them failed.
 *
 * @param {BudgetLoadingComponentProps} props The properties of the component
 */
function BudgetLoadingComponent(props: BudgetLoadingComponentProps): JSX.Element {
    return (
        <div className='flex justify-center py-16'>
            {props.error !== null ? <p className='text-[14px] text-ink-secondary'>{props.error}</p> : <SpinnerComponent />}
        </div>
    );
}

export default BudgetLoadingComponent;
