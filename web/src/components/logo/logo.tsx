import { useId, type JSX } from 'react';

/**
 * @constant RING_BACK
 * @description The half of the ring behind the planet, in the ring's own frame before it is tilted
 */
const RING_BACK = 'M 10 32 A 22 7 0 0 1 54 32';

/**
 * @constant RING_FRONT
 * @description The half of the ring in front of the planet, in the ring's own frame before it is tilted
 */
const RING_FRONT = 'M 54 32 A 22 7 0 0 1 10 32';

/**
 * @constant RING_COLOR
 * @description The ring's colour, a muted grey over the slate tile
 */
const RING_COLOR = '#A4AAB2';

/**
 * @constant PLANET_COLOR
 * @description The planet's colour, a warm off-white
 */
const PLANET_COLOR = '#E9E4DA';

/**
 * @interface LogoComponentProps
 * @description Logo properties
 */
interface LogoComponentProps {
    size?: number; /*!< Its side, in pixels */
}

/**
 * @function LogoComponent
 * @description Orbit's mark, as the favicon draws it: on its slate tile, a planet whose tilted ring passes behind it
 * and then in front of it, with a sand-coloured satellite on the ring. Where the front of the ring crosses the planet,
 * a soft band shades the planet so the ring reads on top of it.
 *
 * @param {LogoComponentProps} props The properties of the component
 */
function LogoComponent(props: LogoComponentProps): JSX.Element {
    const size = props.size ?? 28;

    const gradient = useId();
    const planet = useId();

    return (
        <svg width={size} height={size} viewBox='0 0 64 64' aria-hidden='true' className='shrink-0'>
            <defs>
                <linearGradient id={gradient} x1='0' y1='0' x2='1' y2='1'>
                    <stop offset='0' stopColor='#6B7787' />
                    <stop offset='1' stopColor='#434C59' />
                </linearGradient>
                <clipPath id={planet}>
                    <circle cx='32' cy='32' r='10' />
                </clipPath>
            </defs>
            <rect width='64' height='64' rx='15' fill={`url(#${gradient})`} />
            <g transform='rotate(-24 32 32)'>
                <path d={RING_BACK} fill='none' stroke={RING_COLOR} strokeWidth='2.5' />
                <circle cx='32' cy='32' r='10' fill={PLANET_COLOR} />
                <path d={RING_FRONT} fill='none' stroke='#C3C3C0' strokeWidth='5.5' clipPath={`url(#${planet})`} />
                <path d={RING_FRONT} fill='none' stroke={RING_COLOR} strokeWidth='2.5' />
                <circle cx='50' cy='28' r='3.6' fill='#C9B79C' />
            </g>
        </svg>
    );
}

export default LogoComponent;
