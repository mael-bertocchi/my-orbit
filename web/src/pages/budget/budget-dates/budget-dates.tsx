import SheetComponent from 'components/sheet/sheet';
import type { Maybe } from 'models';
import type { DayRange } from 'modules/budget/budget-dates';
import { dayKey, dayRange, isSameDay, monthStart, parseDayKey, startOfDay } from 'modules/budget/budget-dates';
import type { MessageKey } from 'modules/language/language-en';
import { t } from 'modules/language/language-service';
import { useState, type ChangeEvent, type FormEvent, type JSX } from 'react';

/**
 * @constant FORM_ID
 * @description Ties the footer's button to the form.
 */
const FORM_ID = 'date-filter-form';

/**
 * @type Mode
 * @description Whether the filter is on one day or on a period.
 */
type Mode = 'day' | 'period';

/**
 * @constant MODES
 * @description The two ways to filter, as the sheet's segmented control names them.
 */
const MODES: { id: Mode; label: MessageKey }[] = [
    { id: 'day', label: 'history.day' },
    { id: 'period', label: 'history.period' }
];

/**
 * @interface BudgetDatesComponentProps
 * @description The History date filter sheet.
 */
interface BudgetDatesComponentProps {
    open: boolean; /*!< Whether it is shown */
    range: Maybe<DayRange>; /*!< The filter in place, if any */
    onApply: (range: DayRange) => void; /*!< Called with the days picked */
    onClear: () => void; /*!< Called to show every date again */
    onClose: () => void; /*!< Called when it is dismissed */
}

/**
 * @interface DateFormComponentProps
 * @description Properties of the date filter form
 */
interface DateFormComponentProps {
    range: Maybe<DayRange>; /*!< The filter in place, if any */
    onApply: (range: DayRange) => void; /*!< Called with the days picked */
    onClear: () => void; /*!< Called to show every date again */
}

/**
 * @function DateFormComponent
 * @description The sheet's content, mounted fresh each time it opens. It starts on the filter in place, or on today; a
 * period not yet picked runs from the first of the day's month up to that day. Neither end can be in the future, and
 * moving one past the other carries the other along.
 *
 * @param {DateFormComponentProps} props The properties of the component
 */
function DateFormComponent(props: DateFormComponentProps): JSX.Element {
    const range = props.range;

    const today = startOfDay(new Date());
    const isPeriod = range !== null && !isSameDay(range.start, range.end);
    const [mode, setMode] = useState<Mode>(isPeriod ? 'period' : 'day');
    const [day, setDay] = useState(range?.end ?? today);
    const [start, setStart] = useState(isPeriod ? range.start : monthStart(range?.end ?? today));
    const [end, setEnd] = useState(range?.end ?? today);
    const max = dayKey(today);

    /**
     * @function pickStart
     * @description Moves the first day of the period, and the last one with it when it would come before it.
     */
    const pickStart = (key: string): void => {
        const picked = parseDayKey(key);

        if (picked !== null) {
            setStart(picked);
            setEnd((current) => (picked.getTime() > current.getTime() ? picked : current));
        }
    };

    /**
     * @function pickEnd
     * @description Moves the last day of the period, and the first one with it when it would come after it.
     */
    const pickEnd = (key: string): void => {
        const picked = parseDayKey(key);

        if (picked !== null) {
            setEnd(picked);
            setStart((current) => (picked.getTime() < current.getTime() ? picked : current));
        }
    };

    /**
     * @function pickDay
     * @description Moves the one day shown
     */
    const pickDay = (event: ChangeEvent<HTMLInputElement>): void => {
        const picked = parseDayKey(event.target.value);

        if (picked !== null) {
            setDay(picked);
        }
    };

    /**
     * @function submit
     * @description Applies the day or the period instead of sending the form
     */
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        props.onApply(mode !== 'day' ? dayRange(start, end) : { start: day, end: day });
    };

    return (
        <form id={FORM_ID} onSubmit={submit} className='space-y-5'>
            <div role='radiogroup' aria-label={t('history.dateFilter')} className='grid grid-cols-2 rounded-full bg-fill-strong/80 p-1'>
                {MODES.map(({ id, label }) => (
                    <button key={id} type='button' role='radio' aria-checked={mode === id} onClick={() => setMode(id)} className={`rounded-full py-1.5 text-[14px] font-medium transition ${mode !== id ? 'text-ink-secondary hover:text-ink' : 'bg-white text-ink shadow-control'}`}>
                        {t(label)}
                    </button>
                ))}
            </div>

            {mode === 'day' && (
                <div>
                    <label className='field-label' htmlFor='filter-day'>{t('history.date')}</label>
                    <input id='filter-day' type='date' className='field' value={dayKey(day)} max={max} onChange={pickDay} />
                </div>
            )}

            {mode === 'period' && (
                <div className='grid grid-cols-2 gap-3'>
                    <div>
                        <label className='field-label' htmlFor='filter-from'>{t('history.from')}</label>
                        <input id='filter-from' type='date' className='field' value={dayKey(start)} max={max} onChange={(event) => pickStart(event.target.value)} />
                    </div>
                    <div>
                        <label className='field-label' htmlFor='filter-to'>{t('history.to')}</label>
                        <input id='filter-to' type='date' className='field' value={dayKey(end)} max={max} onChange={(event) => pickEnd(event.target.value)} />
                    </div>
                </div>
            )}

            {range !== null && (
                <button type='button' onClick={props.onClear} className='w-full py-2 text-[15px] font-medium text-accent transition hover:opacity-70'>
                    {t('history.allDates')}
                </button>
            )}
        </form>
    );
}

/**
 * @function BudgetDatesComponent
 * @description Picks the day or the period History shows.
 *
 * @param {BudgetDatesComponentProps} props The properties of the component
 */
function BudgetDatesComponent(props: BudgetDatesComponentProps): JSX.Element {
    /**
     * @constant footer
     * @description The button applying the dates, pinned under them
     */
    const footer = (
        <button type='submit' form={FORM_ID} className='button-primary'>
            {t('history.apply')}
        </button>
    );

    return (
        <SheetComponent open={props.open} title={t('history.dateFilter')} onClose={props.onClose} footer={footer}>
            <DateFormComponent range={props.range} onApply={props.onApply} onClear={props.onClear} />
        </SheetComponent>
    );
}

export default BudgetDatesComponent;
