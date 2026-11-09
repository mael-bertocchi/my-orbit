import { useId, type JSX } from 'react';

/**
 * @interface LogoTile
 * @description Where one of the mark's square tiles sits, in its 64-unit box
 */
interface LogoTile {
    x: number; /*!< Its left edge */
    y: number; /*!< Its top edge */
}

/**
 * @constant TILES
 * @description The three square tiles beside the coin, completing the grid
 */
const TILES: readonly LogoTile[] = [
    { x: 35, y: 15.5 },
    { x: 15.5, y: 35 },
    { x: 35, y: 35 }
];

/**
 * @interface LogoComponentProps
 * @description Logo properties
 */
interface LogoComponentProps {
    size?: number; /*!< Its side, in pixels */
}

/**
 * @function LogoComponent
 * @description Orbit's mark, as the favicon draws it: on its violet tile, a grid of apps whose first is a coin, the
 * budget the portal grew from
 *
 * @param {LogoComponentProps} props The properties of the component
 */
function LogoComponent(props: LogoComponentProps): JSX.Element {
    const size = props.size ?? 28;

    const gradient = useId();

    return (
        <svg width={size} height={size} viewBox='0 0 64 64' aria-hidden='true' className='shrink-0'>
            <defs>
                <linearGradient id={gradient} x1='0' y1='0' x2='1' y2='1'>
                    <stop offset='0' stopColor='#8B74E8' />
                    <stop offset='1' stopColor='#5B45B8' />
                </linearGradient>
            </defs>
            <rect width='64' height='64' rx='15' fill={`url(#${gradient})`} />
            <circle cx='22.5' cy='22.5' r='7' fill='#fff' />
            {TILES.map((tile) => (
                <rect key={`${tile.x}-${tile.y}`} x={tile.x} y={tile.y} width='14' height='14' rx='4' fill='#fff' fillOpacity='0.72' />
            ))}
        </svg>
    );
}

export default LogoComponent;
