import AlertComponent from 'components/alert/alert';
import CategoryIconComponent from 'components/category-icon/category-icon';
import SheetComponent from 'components/sheet/sheet';
import SpinnerComponent from 'components/spinner/spinner';
import SuggestionFieldComponent, { type Suggestion } from 'components/suggestion-field/suggestion-field';
import SwitchComponent from 'components/switch/switch';
import { Globe, LocateFixed, MapPin, Repeat, type LucideIcon } from 'lucide-react';
import type { Maybe } from 'models';
import { categoriesOf, categoryName } from 'modules/budget/budget-categories';
import { CURRENCIES, EURO } from 'modules/budget/budget-currencies';
import { atTime, dayKey, isFutureDay, parseDay, timeKey, withTimeOf } from 'modules/budget/budget-dates';
import { euroPrecise, fieldDate, rate } from 'modules/budget/budget-formatting';
import { useBudgetContext, useDocument, useRates } from 'modules/budget/budget-hooks';
import { latestLocation, nameSuggestions } from 'modules/budget/budget-math';
import type { BudgetEditorRoute, Category, Operation } from 'modules/budget/budget-models';
import { locateCity, useCitySuggestions } from 'modules/budget/budget-places';
import { amountInputOf, deleteOperation, groupAmountInput, Limits, parseAmountInput, sanitizeAmountInput, toOperation, upsertOperation } from 'modules/budget/budget-operations';
import { defaultCurrency, rememberCurrency } from 'modules/budget/budget-preferences';
import { t } from 'modules/language/language-service';
import { useEffect, useMemo, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { messageOf, UserError } from 'utils/errors';

/**
 * @constant FORM_ID
 * @description Ties the sheet's pinned Save button to its form.
 */
const FORM_ID = 'operation-form';

/**
 * @interface ToggleRowComponentProps
 * @description Properties of a row with a switch
 */
export interface ToggleRowComponentProps {
    icon: LucideIcon; /*!< Its icon */
    title: string; /*!< What it toggles */
    hint: string; /*!< A word on what it means */
    checked: boolean; /*!< Whether it is on */
    onChange: (checked: boolean) => void; /*!< Called with the new state */
}

/**
 * @function ToggleRowComponent
 * @description A setting with an icon, a title, a hint and a switch.
 *
 * @param {ToggleRowComponentProps} props The properties of the component
 */
export function ToggleRowComponent(props: ToggleRowComponentProps): JSX.Element {
    const Icon = props.icon;

    return (
        <div className='flex items-center gap-3 rounded-2xl bg-fill px-4 py-3'>
            <Icon size={19} className='shrink-0 text-accent' />
            <span className='flex-1'>
                <span className='block text-[15px]'>{props.title}</span>
                <span className='block text-[12px] text-ink-secondary'>{props.hint}</span>
            </span>
            <SwitchComponent checked={props.checked} onChange={props.onChange} label={props.title} />
        </div>
    );
}

/**
 * @interface FieldComponentProps
 * @description Properties of a labelled field
 */
export interface FieldComponentProps {
    label: string; /*!< Its label */
    htmlFor: string; /*!< The field it labels */
    aside?: string; /*!< A word on its right */
    children: ReactNode; /*!< The field */
}

/**
 * @function FieldComponent
 * @description A labelled field.
 *
 * @param {FieldComponentProps} props The properties of the component
 */
export function FieldComponent(props: FieldComponentProps): JSX.Element {
    return (
        <div>
            <div className='flex items-baseline justify-between'>
                <label className='field-label' htmlFor={props.htmlFor}>{props.label}</label>
                {props.aside !== undefined && <span className='text-[13px] text-ink-tertiary'>{props.aside}</span>}
            </div>
            {props.children}
        </div>
    );
}

/**
 * @interface CategoryPickerComponentProps
 * @description Properties of the category picker
 */
export interface CategoryPickerComponentProps {
    categories: readonly Category[]; /*!< The categories to pick from */
    selected: string; /*!< The id of the one picked */
    onSelect: (id: string) => void; /*!< Called with the id of the one picked */
}

/**
 * @function CategoryPickerComponent
 * @description The grid of categories, the one picked ringed.
 *
 * @param {CategoryPickerComponentProps} props The properties of the component
 */
export function CategoryPickerComponent(props: CategoryPickerComponentProps): JSX.Element {
    return (
        <div className='border-t border-hairline pt-5'>
            <p className='field-label'>{t('operation.category')}</p>
            <div className='grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5'>
                {props.categories.map((category) => {
                    const isSelected = category.id === props.selected;

                    return (
                        <button key={category.id} type='button' aria-pressed={isSelected} onClick={() => props.onSelect(category.id)} className='group flex flex-col items-center gap-1.5 rounded-2xl py-1 focus-visible:outline-none'>
                            <span className={`rounded-[16px] p-[3px] ring-2 transition ${isSelected ? 'ring-accent' : 'ring-transparent group-hover:ring-fill-strong group-focus-visible:ring-accent/50'}`}>
                                <CategoryIconComponent category={category} size={44} />
                            </span>
                            <span className={`w-full truncate text-center text-[12px] transition ${isSelected ? 'font-semibold text-accent' : 'font-medium text-ink-secondary'}`}>
                                {categoryName(category)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * @interface OperationFormComponentProps
 * @description Properties of the operation form
 */
interface OperationFormComponentProps {
    existing: Maybe<Operation>; /*!< The operation edited, none for a new one */
    onDone: () => void; /*!< Called once saved */
    onDelete: () => void; /*!< Called to delete it */
    onValidityChange: (isValid: boolean) => void; /*!< Called whenever the form becomes valid or not */
}

/**
 * @function OperationFormComponent
 * @description The editor, mounted fresh each time the sheet opens. A foreign amount is priced at the rate of its own
 * day, markup included, and can't be saved until that rate is known: a guessed rate never passes for a published one.
 *
 * @param {OperationFormComponentProps} props The properties of the component
 */
function OperationFormComponent(props: OperationFormComponentProps): JSX.Element {
    const existing = props.existing;
    const onValidityChange = props.onValidityChange;

    const document = useDocument();
    const rates = useRates();
    const { store } = useBudgetContext();
    const categories = categoriesOf(document.categories);
    const now = new Date();

    const [amountText, setAmountText] = useState(existing === null ? '' : amountInputOf(existing.amount));
    const [currencyCode, setCurrencyCode] = useState(existing?.currencyCode ?? defaultCurrency());
    const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id ?? '');
    const [name, setName] = useState(existing?.name ?? '');
    const [description, setDescription] = useState(existing?.description ?? '');
    const [location, setLocation] = useState(existing === null ? latestLocation(document.operations) ?? '' : existing.location ?? '');
    const [date, setDate] = useState(existing?.date ?? now);
    const [isOnline, setIsOnline] = useState(existing?.isOnline ?? false);
    const [isTypingLocation, setIsTypingLocation] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [locateError, setLocateError] = useState<Maybe<string>>(null);

    const names = useMemo(() => nameSuggestions(document.operations, name), [document.operations, name]);
    const nameOptions = names.map((value): Suggestion => ({ value }));
    const cityOptions = useCitySuggestions(document.operations, location, isTypingLocation);

    const day = dayKey(date);
    const isForeign = currencyCode !== EURO.code;
    const amount = parseAmountInput(amountText);
    const storedRate = existing !== null && existing.currencyCode === currencyCode && dayKey(existing.date) === day ? existing.rateToEuro : null;
    const appliedRate = rates.rate(currencyCode, day) ?? storedRate;
    const isValid = amount !== null && name.trim() !== '' && categoryId !== '' && appliedRate !== null;

    useEffect(() => {
        if (isForeign) {
            void rates.load(day);
        }
    }, [rates, day, isForeign]);

    useEffect(() => {
        onValidityChange(isValid);
    }, [isValid, onValidityChange]);

    /**
     * @function typeLocation
     * @description Takes the place as it is typed, which brings the cities matching it
     */
    const typeLocation = (value: string): void => {
        setLocation(value);
        setIsTypingLocation(true);
        setLocateError(null);
    };

    /**
     * @function pickLocation
     * @description Takes a city suggested or located, which needs no more suggestions
     */
    const pickLocation = (value: string): void => {
        setLocation(value);
        setIsTypingLocation(false);
        setLocateError(null);
    };

    /**
     * @function locate
     * @description Fills in the city the device is in, or says why it can't, the suggestions put away either way
     */
    const locate = async (): Promise<void> => {
        setIsLocating(true);
        setLocateError(null);

        try {
            pickLocation(await locateCity());
        } catch (error: unknown) {
            setIsTypingLocation(false);
            setLocateError(messageOf(error));
        } finally {
            setIsLocating(false);
        }
    };

    /**
     * @constant locateButton
     * @description The button at the end of the place, filling in the city the device is in
     */
    const locateButton = (
        <button type='button' onMouseDown={(event) => event.preventDefault()} onClick={() => void locate()} disabled={isLocating} title={t('operation.locateHint')} className='absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-accent transition hover:bg-fill-strong disabled:opacity-60'>
            {isLocating ? <SpinnerComponent size={14} /> : <LocateFixed size={15} />}
            {t('operation.locate')}
        </button>
    );

    /**
     * @function settle
     * @description Dates the operation, at the latest now: like the app's picker, the future is out of reach.
     */
    const settle = (picked: Date): void => {
        setDate(picked.getTime() > now.getTime() ? now : picked);
    };

    /**
     * @function pickDay
     * @description Moves the operation to another day, at the time of day it already holds.
     */
    const pickDay = (value: string): void => {
        const picked = parseDay(value, now);

        if (picked !== null && !isFutureDay(picked, now)) {
            settle(withTimeOf(picked, date));
        }
    };

    /**
     * @function pickTime
     * @description Moves the operation to another time of day, on its day.
     */
    const pickTime = (value: string): void => {
        const picked = atTime(date, value);

        if (picked !== null) {
            settle(picked);
        }
    };

    /**
     * @function save
     * @description Stores the operation. An edit to one deleted on the phone in the meantime is dropped, with a notice.
     */
    const save = (): void => {
        if (!isValid || amount === null || appliedRate === null) {
            return;
        }

        const draft = { name, description, amount, currencyCode, categoryId, date, location, isOnline };
        const operation = { ...toOperation(draft, appliedRate, existing?.id), recurringId: existing?.recurringId ?? null };

        store.apply((current) => {
            if (existing !== null && !current.operations.some((candidate) => candidate.id === existing.id)) {
                throw new UserError(t('operation.deletedElsewhere'));
            }

            return upsertOperation(current, operation);
        });
        rememberCurrency(currencyCode);
        props.onDone();
    };

    let rateLine = rates.failure(day) ?? t('operation.loadingRate');

    if (appliedRate !== null) {
        rateLine = t('operation.rate', { rate: rate(appliedRate) });
    }

    /**
     * @function submit
     * @description Saves the operation instead of sending the form
     */
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        save();
    };

    return (
        <form id={FORM_ID} onSubmit={submit} className='space-y-5'>
            {(existing?.recurringId ?? null) !== null && (
                <p className='flex items-center gap-2 rounded-2xl bg-fill px-4 py-3 text-[13px] text-ink-secondary'>
                    <Repeat size={16} className='shrink-0 text-accent' />
                    {t('operation.occurrence')}
                </p>
            )}
            <div className='flex flex-col items-center pb-2 pt-1'>
                <label htmlFor='amount' className='eyebrow'>{t('operation.amount')}</label>
                <div className='mt-2 flex items-center gap-2'>
                    <input id='amount' inputMode='decimal' autoComplete='off' placeholder={groupAmountInput('0.00')} value={amountText} onChange={(event) => setAmountText(groupAmountInput(sanitizeAmountInput(event.target.value)))} style={{ width: `${Math.max(4, amountText.length) * 0.6 + 0.3}em` }} className='bg-transparent text-right text-[46px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-ink-quaternary' />
                    <select aria-label={t('operation.currency')} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} className='h-9 cursor-pointer rounded-xl bg-fill px-2.5 text-[15px] font-semibold outline-none transition hover:bg-fill-strong focus:ring-2 focus:ring-accent/40'>
                        {CURRENCIES.map((currency) => (
                            <option key={currency.code} value={currency.code}>{currency.code}</option>
                        ))}
                    </select>
                </div>
                {isForeign && (
                    <div className='mt-1 text-center'>
                        {appliedRate !== null && amount !== null && (
                            <p className='text-[15px] font-medium text-accent tabular-nums'>
                                {euroPrecise(amount * appliedRate)}
                            </p>
                        )}
                        <p className={`text-[12px] ${appliedRate === null ? 'text-warning-text' : 'text-ink-tertiary'}`}>
                            {rateLine}
                        </p>
                    </div>
                )}
            </div>

            <CategoryPickerComponent categories={categories} selected={categoryId} onSelect={setCategoryId} />

            <FieldComponent label={t('operation.name')} htmlFor='name'>
                <SuggestionFieldComponent id='name' value={name} onType={setName} onPick={setName} suggestions={nameOptions} label={t('operation.suggestions')} placeholder={t('operation.namePlaceholder')} maxLength={Limits.name} />
            </FieldComponent>

            <FieldComponent label={t('operation.description')} htmlFor='description'>
                <textarea id='description' className='field min-h-[76px] resize-none py-2.5 leading-snug' value={description} maxLength={Limits.description} onChange={(event) => setDescription(event.target.value)} placeholder={t('operation.descriptionPlaceholder')} rows={2} />
            </FieldComponent>

            <FieldComponent label={t('operation.date')} htmlFor='date' aside={fieldDate(date, now)}>
                <div className='flex gap-2'>
                    <input id='date' type='date' className='field min-w-0 flex-1' value={day} max={dayKey(now)} onChange={(event) => pickDay(event.target.value)} />
                    <input type='time' aria-label={t('operation.time')} className='field w-28 shrink-0' value={timeKey(date)} onChange={(event) => pickTime(event.target.value)} />
                </div>
            </FieldComponent>

            <ToggleRowComponent icon={Globe} title={t('operation.online')} hint={t('operation.onlineHint')} checked={isOnline} onChange={setIsOnline} />

            {!isOnline && (
                <FieldComponent label={t('operation.location')} htmlFor='location'>
                    <SuggestionFieldComponent id='location' value={location} onType={typeLocation} onPick={pickLocation} suggestions={cityOptions} label={t('operation.suggestions')} placeholder={t('operation.locationPlaceholder')} maxLength={Limits.location} icon={MapPin} trailing={locateButton} />
                    {locateError !== null && <p className='mt-1.5 text-[12px] text-warning-text'>{locateError}</p>}
                </FieldComponent>
            )}

            {existing !== null && (
                <button type='button' onClick={props.onDelete} className='w-full py-2 text-[15px] font-medium text-negative-text transition hover:opacity-70'>
                    {t('operation.delete')}
                </button>
            )}
        </form>
    );
}

/**
 * @interface BudgetOperationComponentProps
 * @description Properties of the operation sheet
 */
interface BudgetOperationComponentProps {
    route: Maybe<BudgetEditorRoute>; /*!< What the sheet is open on, none while closed */
    onClose: () => void; /*!< Called when it is dismissed */
}

/**
 * @function BudgetOperationComponent
 * @description The New operation and Edit operation sheet, with its delete confirmation.
 *
 * @param {BudgetOperationComponentProps} props The properties of the component
 */
function BudgetOperationComponent(props: BudgetOperationComponentProps): JSX.Element {
    const route = props.route;

    const document = useDocument();
    const { store } = useBudgetContext();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [canSave, setCanSave] = useState(false);
    const existing = route?.kind === 'edit' ? document.operations.find((operation) => operation.id === route.id) ?? null : null;
    const isMissing = route?.kind === 'edit' && existing === null;

    /**
     * @function confirmDelete
     * @description Deletes the operation once confirmed.
     */
    const confirmDelete = (): void => {
        if (existing !== null) {
            store.apply((current) => deleteOperation(current, existing.id));
        }

        setIsConfirmingDelete(false);
        props.onClose();
    };

    /**
     * @constant footer
     * @description The button saving the operation, pinned under the form, unless the operation is gone
     */
    const footer = isMissing ? undefined : (
        <button type='submit' form={FORM_ID} disabled={!canSave} className='button-primary'>
            {route?.kind === 'edit' ? t('operation.saveChanges') : t('operation.save')}
        </button>
    );

    return (
        <>
            <SheetComponent open={route !== null} title={route?.kind === 'edit' ? t('operation.edit') : t('operation.new')} onClose={props.onClose} isFull footer={footer}>
                {isMissing
                    ? <p className='py-10 text-center text-[15px] text-ink-secondary'>{t('operation.missing')}</p>
                    : (
                        <OperationFormComponent key={route?.kind === 'edit' ? route.id : 'new'} existing={existing} onDone={props.onClose} onDelete={() => setIsConfirmingDelete(true)} onValidityChange={setCanSave} />
                    )}
            </SheetComponent>
            <AlertComponent open={isConfirmingDelete} title={t('operation.confirmDelete')} message={t('common.irreversible')} action={t('operation.deleteAction')} onConfirm={confirmDelete} onCancel={() => setIsConfirmingDelete(false)} />
        </>
    );
}

export default BudgetOperationComponent;
