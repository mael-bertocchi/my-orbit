import type { LucideIcon } from 'lucide-react';
import { useState, type JSX, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

/**
 * @interface Suggestion
 * @description A value the field offers to fill in
 */
export interface Suggestion {
    value: string; /*!< What it fills in */
    detail?: string; /*!< A word after it, to tell two alike apart */
}

/**
 * @interface SuggestionFieldComponentProps
 * @description What a field with suggestions holds and does
 */
interface SuggestionFieldComponentProps {
    id: string; /*!< Its identifier, for its label */
    value: string; /*!< What is typed */
    onType: (value: string) => void; /*!< Called as it is typed */
    onPick: (value: string) => void; /*!< Called with the suggestion picked */
    suggestions: readonly Suggestion[]; /*!< What it offers, for what is typed */
    label: string; /*!< The list's name, for those who can't see it */
    placeholder: string; /*!< What to type, shown while it is empty */
    maxLength: number; /*!< How long it can get */
    icon?: LucideIcon; /*!< An icon at its start */
    trailing?: ReactNode; /*!< A control at its end, such as a button */
}

/**
 * @function keepFocus
 * @description Keeps the focus in the field as a suggestion is pressed, so the list stays until the press ends
 */
function keepFocus(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
}

/**
 * @function SuggestionFieldComponent
 * @description A text field offering, as it is typed, values to fill in: they show under it while it has the focus and
 * something was typed since, and are picked with a tap, or with the arrows and Enter. Escape puts them away.
 *
 * @param {SuggestionFieldComponentProps} props The properties of the component
 */
function SuggestionFieldComponent(props: SuggestionFieldComponentProps): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const listId = `${props.id}-suggestions`;
    const isShown = isOpen && props.suggestions.length > 0;
    const active = isShown && highlighted >= 0 && highlighted < props.suggestions.length ? highlighted : -1;
    const Icon = props.icon;
    const padding = `${Icon === undefined ? 'pl-3.5' : 'pl-9'} ${props.trailing === undefined ? '' : 'pr-28'}`;

    /**
     * @function type
     * @description Passes on what is typed, and shows the suggestions for it
     */
    const type = (value: string): void => {
        props.onType(value);
        setIsOpen(true);
        setHighlighted(-1);
    };

    /**
     * @function pick
     * @description Fills in a suggestion and puts the list away
     */
    const pick = (suggestion: Suggestion): void => {
        props.onPick(suggestion.value);
        setIsOpen(false);
        setHighlighted(-1);
    };

    /**
     * @function close
     * @description Puts the list away
     */
    const close = (): void => {
        setIsOpen(false);
        setHighlighted(-1);
    };

    /**
     * @function move
     * @description Highlights the next or the previous suggestion; past either end, none is, and what is typed stands
     */
    const move = (step: number): void => {
        const next = active + step;
        const last = props.suggestions.length - 1;

        if (next > last) {
            setHighlighted(-1);
            return;
        }

        setHighlighted(next < -1 ? last : next);
    };

    /**
     * @function navigate
     * @description Moves through the suggestions with the arrows, picks one with Enter, and puts them away with Escape
     */
    const navigate = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (!isShown) {
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }

        const suggestion = props.suggestions[active];

        if (event.key === 'Enter' && suggestion !== undefined) {
            event.preventDefault();
            pick(suggestion);
        }
    };

    return (
        <div>
            <div className='relative'>
                {Icon !== undefined && <Icon size={16} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent' />}
                <input id={props.id} role='combobox' aria-autocomplete='list' aria-expanded={isShown} aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} className={`field ${padding}`} value={props.value} maxLength={props.maxLength} onChange={(event) => type(event.target.value)} onKeyDown={navigate} onBlur={close} placeholder={props.placeholder} autoComplete='off' />
                {props.trailing}
            </div>
            {isShown && (
                <ul id={listId} role='listbox' aria-label={props.label} className='mt-1.5 overflow-hidden rounded-xl bg-fill py-1'>
                    {props.suggestions.map((suggestion, index) => (
                        <li key={`${suggestion.value}|${suggestion.detail ?? ''}`} id={`${listId}-${index}`} role='option' aria-selected={index === active} onMouseDown={keepFocus} onClick={() => pick(suggestion)} onMouseEnter={() => setHighlighted(index)} className={`flex cursor-pointer items-baseline gap-2 px-3.5 py-2 text-[15px] ${index === active ? 'bg-fill-strong' : ''}`}>
                            <span className='truncate'>{suggestion.value}</span>
                            {suggestion.detail !== undefined && suggestion.detail !== '' && <span className='truncate text-[13px] text-ink-tertiary'>{suggestion.detail}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default SuggestionFieldComponent;
