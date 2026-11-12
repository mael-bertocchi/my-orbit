import type { Maybe } from 'models';
import { useEffect, useRef, useState, type JSX, type PointerEvent, type RefObject } from 'react';

/**
 * @constant HEIGHT
 * @description The chart's height, in pixels.
 */
const HEIGHT = 220;

/**
 * @constant PADDING
 * @description The room around the plot: the amounts on the left, the months below.
 */
const PADDING = { top: 12, right: 8, bottom: 26, left: 52 };

/**
 * @constant ACCENT
 * @description The bars' colour.
 */
const ACCENT = '#56616F';

/**
 * @constant GRID
 * @description The colour of the grid.
 */
const GRID = '#E8E8ED';

/**
 * @constant MUTED
 * @description The colour of the axes' words and of the average's line.
 */
const MUTED = '#86868B';

/**
 * @constant MARKER
 * @description The colour of the budget's marks.
 */
const MARKER = '#1D1D1F';

/**
 * @constant GRID_STEPS
 * @description How many lines the amounts are read against.
 */
const GRID_STEPS = 4;

/**
 * @constant RADIUS
 * @description The rounding of a bar's top corners.
 */
const RADIUS = 4;

/**
 * @constant LABEL_ROOM
 * @description The room a month's name needs under its bar, in pixels; below it, every other name is left out, the latest
 * month kept.
 */
const LABEL_ROOM = 34;

/**
 * @interface MonthBar
 * @description One month of the chart.
 */
export interface MonthBar {
    key: string; /*!< Its identifier */
    label: string; /*!< Its short name, under the bar */
    title: string; /*!< Its full name, in the tooltip */
    value: number; /*!< What it spent */
    marker: Maybe<number>; /*!< Its budget, marked across the bar, or null */
    isPartial: boolean; /*!< Whether it is still under way, drawn lighter */
}

/**
 * @interface MonthBarsLabels
 * @description The words the chart shows, in the page's language.
 */
export interface MonthBarsLabels {
    spent: string; /*!< What a bar is */
    budget: string; /*!< What a mark is */
    average: string; /*!< What the dashed line is */
    partial: string; /*!< What a lighter bar is */
}

/**
 * @interface MonthBarsComponentProps
 * @description What the chart draws: what each month spent, its budget, and the average.
 */
interface MonthBarsComponentProps {
    bars: MonthBar[]; /*!< The months, the oldest first */
    average: Maybe<number>; /*!< The average of the finished months, or null */
    labels: MonthBarsLabels; /*!< Its words */
    formatAmount: (amount: number) => string; /*!< Writes an amount */
}

/**
 * @function niceStep
 * @description A round step for the amounts' grid: 1, 2 or 5 times a power of ten.
 *
 * @param {number} maximum The highest amount to show.
 *
 * @returns {number} The step between two lines.
 */
function niceStep(maximum: number): number {
    const raw = Math.max(1, maximum) / GRID_STEPS;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const multiple = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= raw) ?? 10;

    return multiple * magnitude;
}

/**
 * @function barPath
 * @description A bar standing on the baseline, its top corners rounded.
 *
 * @param {number} x Its left edge.
 * @param {number} y Its top.
 * @param {number} width Its width.
 * @param {number} bottom The baseline.
 *
 * @returns {string} Its SVG path.
 */
function barPath(x: number, y: number, width: number, bottom: number): string {
    const radius = Math.min(RADIUS, width / 2, Math.max(0, bottom - y));

    return `M${x},${bottom} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + width - radius},${y} Q${x + width},${y} ${x + width},${y + radius} L${x + width},${bottom} Z`;
}

/**
 * @function useWidth
 * @description The width an element takes, followed as it resizes.
 *
 * @returns {[RefObject<HTMLDivElement | null>, number]} The element's reference and its width.
 */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
    const reference = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const element = reference.current;

        if (element === null) {
            return;
        }

        const observer = new ResizeObserver(() => setWidth(element.clientWidth));

        observer.observe(element);
        setWidth(element.clientWidth);

        return () => observer.disconnect();
    }, []);

    return [reference, width];
}

/**
 * @interface LegendItemComponentProps
 * @description Properties of one entry of the legend
 */
interface LegendItemComponentProps {
    label: string; /*!< What the mark stands for */
    swatch: JSX.Element; /*!< The mark, drawn small */
}

/**
 * @function LegendItemComponent
 * @description A small drawing of a mark, with its name.
 *
 * @param {LegendItemComponentProps} props The properties of the component
 */
function LegendItemComponent(props: LegendItemComponentProps): JSX.Element {
    return (
        <span className='flex items-center gap-1.5'>
            <svg width='14' height='12' aria-hidden='true'>{props.swatch}</svg>
            {props.label}
        </span>
    );
}

/**
 * @function MonthBarsComponent
 * @description What each month spent as a bar, the month under way drawn lighter, its budget marked across it, and the
 * average of the finished months as a dashed line. Hovering or touching a month reads its figures.
 *
 * @param {MonthBarsComponentProps} props The properties of the component
 */
function MonthBarsComponent(props: MonthBarsComponentProps): JSX.Element {
    const [reference, width] = useWidth();
    const [hovered, setHovered] = useState<Maybe<number>>(null);

    const peak = Math.max(1, props.average ?? 0, ...props.bars.map((bar) => Math.max(bar.value, bar.marker ?? 0)));
    const step = niceStep(peak * 1.05);
    const top = step * Math.max(1, Math.ceil((peak * 1.05) / step));
    const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const slot = plotWidth / Math.max(1, props.bars.length);
    const barWidth = Math.min(36, slot * 0.62);
    const bottom = PADDING.top + plotHeight;
    const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
    const hasMarkers = props.bars.some((bar) => bar.marker !== null);
    const hasPartial = props.bars.some((bar) => bar.isPartial);
    const labelEvery = slot < LABEL_ROOM ? 2 : 1;

    /**
     * @function y
     * @description Where an amount sits up the plot.
     */
    const y = (amount: number): number => bottom - (amount / top) * plotHeight;

    /**
     * @function centre
     * @description Where a month's bar is centred across the plot.
     */
    const centre = (index: number): number => PADDING.left + slot * index + slot / 2;

    /**
     * @function leave
     * @description Forgets the hovered month once the mouse leaves the plot. A finger lifting leaves it too, so a touched
     * month stays read until another is touched.
     */
    const leave = (event: PointerEvent<HTMLDivElement>): void => {
        if (event.pointerType !== 'mouse') {
            return;
        }

        setHovered(null);
    };

    const shown = hovered !== null ? props.bars[hovered] ?? null : null;
    const tooltipLeft = hovered !== null ? Math.min(Math.max(centre(hovered) - 85, 0), Math.max(0, width - 170)) : 0;

    return (
        <div>
            <div className='mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-secondary'>
                <LegendItemComponent label={props.labels.spent} swatch={<rect x='2' y='1' width='10' height='10' rx='2' fill={ACCENT} />} />
                {hasPartial && <LegendItemComponent label={props.labels.partial} swatch={<rect x='2' y='1' width='10' height='10' rx='2' fill={ACCENT} fillOpacity='0.4' />} />}
                {hasMarkers && <LegendItemComponent label={props.labels.budget} swatch={<line x1='1' y1='6' x2='13' y2='6' stroke={MARKER} strokeWidth='2' strokeLinecap='round' />} />}
                {props.average !== null && <LegendItemComponent label={props.labels.average} swatch={<line x1='1' y1='6' x2='13' y2='6' stroke={MUTED} strokeWidth='2' strokeDasharray='3 3' />} />}
            </div>
            <div ref={reference} className='relative w-full' style={{ height: HEIGHT }} onPointerLeave={leave}>
                {width > 0 && (
                    <svg width={width} height={HEIGHT} role='img' aria-label={props.bars.map((bar) => `${bar.title} ${props.formatAmount(bar.value)}`).join(', ')}>
                        {grid.map((amount) => (
                            <g key={amount}>
                                <line x1={PADDING.left} x2={width - PADDING.right} y1={y(amount)} y2={y(amount)} stroke={GRID} strokeWidth='1' />
                                <text x={PADDING.left - 8} y={y(amount) + 4} textAnchor='end' fontSize='11' fill={MUTED}>{props.formatAmount(amount)}</text>
                            </g>
                        ))}
                        {props.bars.map((bar, index) => (
                            <g key={bar.key} onPointerEnter={() => setHovered(index)} onClick={() => setHovered(index)}>
                                <rect x={centre(index) - slot / 2} y={PADDING.top} width={slot} height={plotHeight + PADDING.bottom} fill={hovered !== index ? 'transparent' : '#F2F2F4'} rx='8' />
                                <path d={barPath(centre(index) - barWidth / 2, y(bar.value), barWidth, bottom)} fill={ACCENT} fillOpacity={bar.isPartial ? 0.4 : 1} />
                                {bar.marker !== null && <line x1={centre(index) - barWidth / 2 - 3} x2={centre(index) + barWidth / 2 + 3} y1={y(bar.marker)} y2={y(bar.marker)} stroke={MARKER} strokeWidth='2' strokeLinecap='round' />}
                                {(props.bars.length - 1 - index) % labelEvery === 0 && <text x={centre(index)} y={HEIGHT - 6} textAnchor='middle' fontSize='11' fill={MUTED}>{bar.label}</text>}
                            </g>
                        ))}
                        {props.average !== null && <line x1={PADDING.left} x2={width - PADDING.right} y1={y(props.average)} y2={y(props.average)} stroke={MUTED} strokeWidth='1.5' strokeDasharray='4 4' pointerEvents='none' />}
                    </svg>
                )}
                {shown !== null && (
                    <div className='pointer-events-none absolute top-0 z-10 flex w-[170px] flex-col gap-1 rounded-xl bg-white px-3 py-2 text-[12px] shadow-card ring-1 ring-hairline' style={{ left: tooltipLeft }}>
                        <span className='font-semibold'>{shown.title}</span>
                        <span className='flex justify-between gap-3'><span className='text-ink-secondary'>{props.labels.spent}</span><span className='font-semibold tabular-nums'>{props.formatAmount(shown.value)}</span></span>
                        {shown.marker !== null && <span className='flex justify-between gap-3'><span className='text-ink-secondary'>{props.labels.budget}</span><span className='font-semibold tabular-nums'>{props.formatAmount(shown.marker)}</span></span>}
                    </div>
                )}
            </div>
        </div>
    );
}

export default MonthBarsComponent;
