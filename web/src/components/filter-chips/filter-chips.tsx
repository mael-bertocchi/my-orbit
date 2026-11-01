import type { JSX, ReactNode } from 'react';
import { toggled } from 'utils/filters';

/**
 * @interface FilterChipOption
 * @description One filter of a row
 */
export interface FilterChipOption {
    value: string; /*!< What tells it apart among the row's filters */
    label: ReactNode; /*!< What it shows */
}

/**
 * @interface FilterChipsComponentProps
 * @description A row of filters, and what picking them does
 */
interface FilterChipsComponentProps {
    label: string; /*!< What the row filters, for those who can't see it */
    allLabel: string; /*!< What the chip showing everything is called */
    options: readonly FilterChipOption[]; /*!< The filters, in order */
    selected: readonly string[]; /*!< The values picked, none for everything */
    onChange: (selected: string[]) => void; /*!< Called with the values now picked */
    leading?: ReactNode; /*!< Controls before the chips, such as a date picker */
    className?: string; /*!< Its spacing */
}

/**
 * @function chipClass
 * @description How a chip looks: filled when it is picked
 *
 * @param {boolean} isActive Whether it is picked
 * @returns {string} Its classes
 */
function chipClass(isActive: boolean): string {
    return `h-8 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition ${isActive ? 'bg-ink text-white' : 'bg-white text-ink shadow-control hover:bg-fill'}`;
}

/**
 * @function FilterChipsComponent
 * @description One row of filters where several can be picked at once. The first chip shows everything: it is lit
 * while nothing is picked, and tapping it lets go of every filter; picking a filter lets go of it. Filters of different
 * kinds (a year and a kind of title) narrow the list together, filters of one kind (two years) add up; the page
 * decides which is which. On a phone the row scrolls sideways.
 *
 * @param {FilterChipsComponentProps} props The properties of the component
 */
function FilterChipsComponent(props: FilterChipsComponentProps): JSX.Element {
    return (
        <div className={`no-scrollbar -mx-5 -mb-2 flex gap-2 overflow-x-auto px-5 py-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 ${props.className ?? ''}`} role='group' aria-label={props.label}>
            {props.leading}
            <button type='button' aria-pressed={props.selected.length === 0} onClick={() => props.onChange([])} className={chipClass(props.selected.length === 0)}>
                {props.allLabel}
            </button>
            {props.options.map((option) => (
                <button key={option.value} type='button' aria-pressed={props.selected.includes(option.value)} onClick={() => props.onChange(toggled(props.selected, option.value))} className={chipClass(props.selected.includes(option.value))}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export default FilterChipsComponent;
