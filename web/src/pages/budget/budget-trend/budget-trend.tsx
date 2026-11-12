import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { Maybe } from 'models';
import { percent } from 'modules/budget/budget-formatting';
import { t } from 'modules/language/language-service';
import type { JSX } from 'react';

/**
 * @constant STEADY
 * @description How far from usual a figure may move and still read as steady: under 5%, once rounded as the badge shows it.
 */
const STEADY = 0.05;

/**
 * @type Trend
 * @description Which way a figure moved from usual: up, down, steady, or new when it usually is nothing.
 */
type Trend = 'up' | 'down' | 'steady' | 'new';

/**
 * @function trendOf
 * @description Which way a figure moved from usual.
 *
 * @param {Maybe<number>} change The change, as a fraction, or null when it usually is nothing.
 *
 * @returns {Trend} Its trend.
 */
function trendOf(change: Maybe<number>): Trend {
    if (change === null) {
        return 'new';
    }

    if (Math.round(Math.abs(change) * 100) < STEADY * 100) {
        return 'steady';
    }

    return change > 0 ? 'up' : 'down';
}

/**
 * @constant TREND_STYLES
 * @description How each trend's badge looks: spending more reads red, spending less green, the rest grey.
 */
const TREND_STYLES: Record<Trend, string> = {
    up: 'bg-negative-soft text-negative-text',
    down: 'bg-[#EAF8EE] text-positive-text',
    steady: 'bg-fill text-ink-secondary',
    new: 'bg-accent-soft text-accent'
};

/**
 * @interface TrendBadgeComponentProps
 * @description Properties of a change badge
 */
interface TrendBadgeComponentProps {
    change: Maybe<number>; /*!< The change, as a fraction, or null when it usually is nothing */
}

/**
 * @function TrendBadgeComponent
 * @description A change from usual, with an arrow and its sign so it never rests on colour alone.
 *
 * @param {TrendBadgeComponentProps} props The properties of the component
 */
function TrendBadgeComponent(props: TrendBadgeComponentProps): JSX.Element {
    const trend = trendOf(props.change);
    const Icon = trend === 'down' ? TrendingDown : trend !== 'up' ? Minus : TrendingUp;
    const label = props.change !== null ? `${props.change > 0 ? '+' : ''}${percent(props.change)}` : t('analysis.new');

    return (
        <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${TREND_STYLES[trend]}`}>
            {trend !== 'new' && <Icon size={13} strokeWidth={2.4} />}
            {label}
        </span>
    );
}

export default TrendBadgeComponent;
