import AlertComponent from 'components/alert/alert';
import SheetComponent from 'components/sheet/sheet';
import { CalendarX, Globe, MapPin, Pause } from 'lucide-react';
import type { Maybe } from 'models';
import { categoriesOf } from 'modules/budget/budget-categories';
import { CURRENCIES, EURO } from 'modules/budget/budget-currencies';
import { dayKey } from 'modules/budget/budget-dates';
import { euroPrecise, rate } from 'modules/budget/budget-formatting';
import { useBudgetContext, useDocument, useRates } from 'modules/budget/budget-hooks';
import type { RecurringOperation } from 'modules/budget/budget-models';
import { amountInputOf, groupAmountInput, Limits, parseAmountInput, sanitizeAmountInput } from 'modules/budget/budget-operations';
import { defaultCurrency } from 'modules/budget/budget-preferences';
import { intervalLabel, INTERVALS, toRecurringFields } from 'modules/budget/budget-recurring';
import budgetService from 'modules/budget/budget-service';
import { t } from 'modules/language/language-service';
import { useToastContext } from 'modules/toast/toast-hooks';
import type { ToastContextProps } from 'modules/toast/toast-models';
import { CategoryPickerComponent, FieldComponent, ToggleRowComponent } from 'pages/budget/budget-operation/budget-operation';
import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { messageOf } from 'utils/errors';

/**
 * @constant FORM_ID
 * @description Ties the sheet's pinned Save button to its form.
 */
const FORM_ID = 'recurring-form';

/**
 * @type RecurringEditorRoute
 * @description What the recurring operation sheet is open on: a new one, or an existing one
 */
export type RecurringEditorRoute = { kind: 'new' } | { kind: 'edit'; recurring: RecurringOperation };

/**
 * @interface RecurringFormComponentProps
 * @description Properties of the recurring operation form
 */
interface RecurringFormComponentProps {
    route: RecurringEditorRoute; /*!< What the form is open on */
    onSaved: (recurring: RecurringOperation) => void; /*!< Called with the stored recurring operation */
    onDelete: () => void; /*!< Called to delete it */
    onValidityChange: (isValid: boolean) => void; /*!< Called whenever the form becomes valid or not */
    onSavingChange: (isSaving: boolean) => void; /*!< Called when saving starts and ends */
}

/**
 * @function RecurringFormComponent
 * @description The editor, mounted fresh each time the sheet opens. Saving goes straight to the server, which logs the
 * occurrences already due; the budget is then read again so they show at once.
 *
 * @param {RecurringFormComponentProps} props The properties of the component
 */
function RecurringFormComponent(props: RecurringFormComponentProps): JSX.Element {
    const { route, onValidityChange } = props;
    const existing = route.kind === 'edit' ? route.recurring : null;

    const document = useDocument();
    const rates = useRates();
    const { store } = useBudgetContext();
    const { showToast }: ToastContextProps = useToastContext();
    const categories = categoriesOf(document.categories);
    const today = dayKey(new Date());

    const [amountText, setAmountText] = useState(existing === null ? '' : amountInputOf(existing.amount));
    const [currencyCode, setCurrencyCode] = useState(existing?.currencyCode ?? defaultCurrency());
    const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id ?? '');
    const [name, setName] = useState(existing?.name ?? '');
    const [description, setDescription] = useState(existing?.description ?? '');
    const [location, setLocation] = useState(existing?.location ?? '');
    const [isOnline, setIsOnline] = useState(existing?.isOnline ?? false);
    const [firstDate, setFirstDate] = useState(existing?.firstDate ?? today);
    const [intervalMonths, setIntervalMonths] = useState(existing?.intervalMonths ?? 1);
    const [endDate, setEndDate] = useState<Maybe<string>>(existing?.endDate ?? null);
    const [isPaused, setIsPaused] = useState(existing?.isPaused ?? false);

    const amount = parseAmountInput(amountText);
    const isForeign = currencyCode !== EURO.code;
    const latestRate = rates.rate(currencyCode, today);
    const isValid = amount !== null && name.trim() !== '' && categoryId !== '' && firstDate !== '' && (endDate === null || (endDate !== '' && endDate >= firstDate));

    useEffect(() => {
        if (isForeign) {
            void rates.load(today);
        }
    }, [rates, today, isForeign]);

    useEffect(() => {
        onValidityChange(isValid);
    }, [isValid, onValidityChange]);

    /**
     * @function save
     * @description Stores the recurring operation, then reads the budget again for the occurrences the server logged.
     */
    const save = async (): Promise<void> => {
        if (!isValid || amount === null) {
            return;
        }

        const fields = toRecurringFields({ name, description, amount, currencyCode, categoryId, location, isOnline, firstDate, intervalMonths, endDate, isPaused });

        props.onSavingChange(true);

        try {
            const stored = existing === null ? await budgetService.createRecurring(fields) : await budgetService.updateRecurring(existing.id, fields);

            await store.refresh();
            props.onSaved(stored);
        } catch (error: unknown) {
            showToast(messageOf(error));
        } finally {
            props.onSavingChange(false);
        }
    };

    /**
     * @function submit
     * @description Saves the recurring operation instead of sending the form
     */
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        void save();
    };

    /**
     * @function toggleEnd
     * @description Gives the recurring operation an end, on its first occurrence until another day is picked, or takes it
     * away
     */
    const toggleEnd = (hasEnd: boolean): void => {
        setEndDate(hasEnd ? firstDate : null);
    };

    return (
        <form id={FORM_ID} onSubmit={submit} className='space-y-5'>
            <div className='flex flex-col items-center pb-2 pt-1'>
                <label htmlFor='recurring-amount' className='eyebrow'>{t('operation.amount')}</label>
                <div className='mt-2 flex items-center gap-2'>
                    <input id='recurring-amount' inputMode='decimal' autoComplete='off' placeholder={groupAmountInput('0.00')} value={amountText} onChange={(event) => setAmountText(groupAmountInput(sanitizeAmountInput(event.target.value)))} style={{ width: `${Math.max(4, amountText.length) * 0.6 + 0.3}em` }} className='bg-transparent text-right text-[46px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-ink-quaternary' />
                    <select aria-label={t('operation.currency')} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} className='h-9 cursor-pointer rounded-xl bg-fill px-2.5 text-[15px] font-semibold outline-none transition hover:bg-fill-strong focus:ring-2 focus:ring-accent/40'>
                        {CURRENCIES.map((currency) => (
                            <option key={currency.code} value={currency.code}>{currency.code}</option>
                        ))}
                    </select>
                </div>
                {isForeign && latestRate !== null && amount !== null && (
                    <p className='mt-1 text-center text-[12px] text-ink-tertiary tabular-nums'>
                        {`≈ ${euroPrecise(amount * latestRate)} • ${t('operation.rate', { rate: rate(latestRate) })}`}
                    </p>
                )}
            </div>

            <CategoryPickerComponent categories={categories} selected={categoryId} onSelect={setCategoryId} />

            <FieldComponent label={t('operation.name')} htmlFor='recurring-name'>
                <input id='recurring-name' className='field' value={name} maxLength={Limits.name} onChange={(event) => setName(event.target.value)} placeholder={t('operation.namePlaceholder')} autoComplete='off' />
            </FieldComponent>

            <FieldComponent label={t('operation.description')} htmlFor='recurring-description'>
                <textarea id='recurring-description' className='field min-h-[76px] resize-none py-2.5 leading-snug' value={description} maxLength={Limits.description} onChange={(event) => setDescription(event.target.value)} placeholder={t('operation.descriptionPlaceholder')} rows={2} />
            </FieldComponent>

            <div className='grid grid-cols-1 gap-5 sm:grid-cols-2'>
                <FieldComponent label={t('recurring.frequency')} htmlFor='recurring-interval'>
                    <select id='recurring-interval' className='field cursor-pointer' value={intervalMonths} onChange={(event) => setIntervalMonths(Number(event.target.value))}>
                        {INTERVALS.map((interval) => (
                            <option key={interval} value={interval}>{intervalLabel(interval)}</option>
                        ))}
                    </select>
                </FieldComponent>
                <FieldComponent label={t('recurring.firstDate')} htmlFor='recurring-first'>
                    <input id='recurring-first' type='date' className='field' value={firstDate} onChange={(event) => setFirstDate(event.target.value)} />
                </FieldComponent>
            </div>
            <p className='-mt-3 text-[12px] text-ink-tertiary'>{t('recurring.firstDateNote')}</p>

            <ToggleRowComponent icon={CalendarX} title={t('recurring.ends')} hint={t('recurring.endsHint')} checked={endDate !== null} onChange={toggleEnd} />

            {endDate !== null && (
                <FieldComponent label={t('recurring.endDate')} htmlFor='recurring-end'>
                    <input id='recurring-end' type='date' className='field' value={endDate} min={firstDate} onChange={(event) => setEndDate(event.target.value)} />
                </FieldComponent>
            )}

            <ToggleRowComponent icon={Globe} title={t('operation.online')} hint={t('operation.onlineHint')} checked={isOnline} onChange={setIsOnline} />

            {!isOnline && (
                <FieldComponent label={t('operation.location')} htmlFor='recurring-location'>
                    <div className='relative'>
                        <MapPin size={16} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent' />
                        <input id='recurring-location' className='field pl-9' value={location} maxLength={Limits.location} onChange={(event) => setLocation(event.target.value)} placeholder={t('operation.locationPlaceholder')} />
                    </div>
                </FieldComponent>
            )}

            {existing !== null && (
                <>
                    <ToggleRowComponent icon={Pause} title={t('recurring.paused')} hint={t('recurring.pausedHint')} checked={isPaused} onChange={setIsPaused} />
                    <p className='text-[12px] text-ink-tertiary'>{t('recurring.editNote')}</p>
                    <button type='button' onClick={props.onDelete} className='w-full py-2 text-[15px] font-medium text-negative-text transition hover:opacity-70'>
                        {t('recurring.delete')}
                    </button>
                </>
            )}
        </form>
    );
}

/**
 * @interface BudgetRecurringComponentProps
 * @description Properties of the recurring operation sheet
 */
interface BudgetRecurringComponentProps {
    route: Maybe<RecurringEditorRoute>; /*!< What the sheet is open on, none while closed */
    onSaved: (recurring: RecurringOperation) => void; /*!< Called with the stored recurring operation, the sheet then closing */
    onDeleted: (id: string) => void; /*!< Called with the id of the deleted one, the sheet then closing */
    onClose: () => void; /*!< Called when it is dismissed */
}

/**
 * @function BudgetRecurringComponent
 * @description The New and Edit recurring operation sheet, with its delete confirmation.
 *
 * @param {BudgetRecurringComponentProps} props The properties of the component
 */
function BudgetRecurringComponent(props: BudgetRecurringComponentProps): JSX.Element {
    const route = props.route;
    const { store } = useBudgetContext();
    const { showToast }: ToastContextProps = useToastContext();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [canSave, setCanSave] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const isEdit = route?.kind === 'edit';

    /**
     * @function confirmDelete
     * @description Deletes the recurring operation once confirmed.
     */
    const confirmDelete = async (): Promise<void> => {
        setIsConfirmingDelete(false);

        if (route?.kind !== 'edit') {
            return;
        }

        try {
            await budgetService.deleteRecurring(route.recurring.id);
            await store.refresh();
            props.onDeleted(route.recurring.id);
        } catch (error: unknown) {
            showToast(messageOf(error));
        }
    };

    /**
     * @function startDelete
     * @description Asks before deleting the recurring operation
     */
    const startDelete = (): void => {
        setIsConfirmingDelete(true);
    };

    /**
     * @function runDelete
     * @description Deletes the recurring operation, from the confirmation
     */
    const runDelete = (): void => {
        void confirmDelete();
    };

    /**
     * @constant footer
     * @description The button saving the recurring operation, pinned under the form
     */
    const footer = (
        <button type='submit' form={FORM_ID} disabled={!canSave || isSaving} className='button-primary'>
            {isEdit ? t('operation.saveChanges') : t('recurring.save')}
        </button>
    );

    return (
        <>
            <SheetComponent open={route !== null} title={isEdit ? t('recurring.edit') : t('recurring.new')} onClose={props.onClose} isFull footer={footer}>
                {route !== null && <RecurringFormComponent key={route.kind === 'edit' ? route.recurring.id : 'new'} route={route} onSaved={props.onSaved} onDelete={startDelete} onValidityChange={setCanSave} onSavingChange={setIsSaving} />}
            </SheetComponent>
            <AlertComponent open={isConfirmingDelete} title={t('recurring.confirmDelete')} message={t('recurring.deleteMessage')} action={t('recurring.deleteAction')} onConfirm={runDelete} onCancel={() => setIsConfirmingDelete(false)} />
        </>
    );
}

export default BudgetRecurringComponent;
