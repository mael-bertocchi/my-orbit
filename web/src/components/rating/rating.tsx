import { Star } from 'lucide-react';
import type { Maybe } from 'models';
import type { JSX, KeyboardEvent, MouseEvent } from 'react';

/**
 * @constant STARS
 * @description How many stars a rating has
 */
const STARS = 5;

/**
 * @constant HALVES
 * @description The best rating, in half stars
 */
const HALVES = STARS * 2;

/**
 * @constant GOLD
 * @description The colour of a lit star
 */
const GOLD = '#FF9F0A';

/**
 * @interface RatingComponentProps
 * @description What a rating shows, and what changing it does
 */
interface RatingComponentProps {
    value: Maybe<number>; /*!< The rating in half stars, from 1 to 10, or null when there is none */
    label: string; /*!< What it says, for those who can't see the stars */
    onChange?: (value: number) => void; /*!< Called with a new rating, which makes it editable */
    size?: number; /*!< A star's side, in pixels */
}

/**
 * @function clamp
 * @description Keeps a rating within half a star and five
 *
 * @param {number} value The rating, in half stars
 * @returns {number} The rating, within bounds
 */
function clamp(value: number): number {
    return Math.min(HALVES, Math.max(1, value));
}

/**
 * @function RatingComponent
 * @description Five stars lit up to a rating, in half stars. Editable, a click on a star's left half gives half of it and
 * on its right half all of it, and the arrow keys move by half a star.
 *
 * @param {RatingComponentProps} props The properties of the component
 */
function RatingComponent(props: RatingComponentProps): JSX.Element {
    const size = props.size ?? 18;
    const value = props.value ?? 0;
    const onChange = props.onChange;

    const stars = Array.from({ length: STARS }, (_, index) => {
        const lit = Math.min(2, Math.max(0, value - index * 2));

        return (
            <span key={index} className='relative inline-block shrink-0' style={{ width: size, height: size }}>
                <Star size={size} strokeWidth={1.8} className='text-ink-quaternary' />
                {lit > 0 && (
                    <span className='absolute inset-y-0 left-0 overflow-hidden' style={{ width: lit !== 2 ? size / 2 : size }}>
                        <Star size={size} strokeWidth={1.8} fill={GOLD} color={GOLD} />
                    </span>
                )}
            </span>
        );
    });

    if (onChange === undefined) {
        return (
            <span className='inline-flex items-center gap-0.5' role='img' aria-label={props.label}>
                {stars}
            </span>
        );
    }

    /**
     * @function pick
     * @description Rates at the half star under the pointer
     */
    const pick = (event: MouseEvent<HTMLDivElement>): void => {
        const bounds = event.currentTarget.getBoundingClientRect();

        onChange(clamp(Math.ceil(((event.clientX - bounds.left) / bounds.width) * HALVES)));
    };

    /**
     * @function step
     * @description Moves the rating by half a star with the arrow keys, or to an end with Home and End
     */
    const step = (event: KeyboardEvent<HTMLDivElement>): void => {
        const moves: Record<string, number> = { ArrowRight: value + 1, ArrowUp: value + 1, ArrowLeft: value - 1, ArrowDown: value - 1, Home: 1, End: HALVES };
        const next = moves[event.key];

        if (next === undefined) {
            return;
        }

        event.preventDefault();
        onChange(clamp(next));
    };

    return (
        <div role='slider' tabIndex={0} aria-label={props.label} aria-valuemin={1} aria-valuemax={HALVES} aria-valuenow={props.value ?? undefined} aria-valuetext={props.value !== null ? `${props.value / 2} / ${STARS}` : undefined} onClick={pick} onKeyDown={step} className='inline-flex cursor-pointer items-center gap-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40'>
            {stars}
        </div>
    );
}

export default RatingComponent;
