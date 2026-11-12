import type { JSX, ReactNode } from 'react';

/**
 * @interface RingComponentProps
 * @description What the budget ring shows.
 */
interface RingComponentProps {
    progress: number; /*!< How full it is, between 0 and 1 */
    color: string; /*!< The filled arc's colour */
    size?: number; /*!< Its diameter, in pixels */
    children: ReactNode; /*!< What sits in its middle */
}

/**
 * @function RingComponent
 * @description The budget ring: a thick arc with rounded ends around the month's main figure.
 *
 * @param {RingComponentProps} props The properties of the component
 */
function RingComponent(props: RingComponentProps): JSX.Element {
    const size = props.size ?? 232;

    const stroke = 18;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const filled = Math.min(1, Math.max(0, props.progress));

    return (
        <div className='relative' style={{ width: size, height: size }}>
            <svg width={size} height={size} className='-rotate-90' aria-hidden='true'>
                <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke='#EDEDF0' strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke={props.color} strokeWidth={stroke} strokeLinecap='round' strokeDasharray={circumference} strokeDashoffset={circumference * (1 - filled)} style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), stroke 0.3s' }} opacity={filled !== 0 ? 1 : 0} />
            </svg>
            <div className='absolute inset-0 flex flex-col items-center justify-center text-center'>
                {props.children}
            </div>
        </div>
    );
}

export default RingComponent;
