import AlertComponent from 'components/alert/alert';
import IconTileComponent from 'components/icon-tile/icon-tile';
import ListGroupComponent from 'components/list-group/list-group';
import ListRowComponent from 'components/list-row/list-row';
import PageHeaderComponent from 'components/page-header/page-header';
import SyncBadgeComponent from 'components/sync-badge/sync-badge';
import { ArchiveRestore, ChevronRight, Euro, LayoutGrid, List, RefreshCw, Target, Trash2 } from 'lucide-react';
import { categoriesOf, DEFAULT_CATEGORIES } from 'modules/budget/budget-categories';
import { BANK_MARKUP, bankRate, CURRENCIES, currencyName, EURO } from 'modules/budget/budget-currencies';
import { monthStart } from 'modules/budget/budget-dates';
import { euro, percent, rate } from 'modules/budget/budget-formatting';
import { useBudget, useDocument, useRates } from 'modules/budget/budget-hooks';
import { useBudgetContext } from 'modules/budget/budget-hooks';
import { defaultCurrency, rememberCurrency } from 'modules/budget/budget-preferences';
import { t } from 'modules/language/language-service';
import BudgetLimitsComponent from 'pages/budget/budget-limits/budget-limits';
import BudgetTrashComponent from 'pages/budget/budget-trash/budget-trash';
import { useState, type ChangeEvent, type JSX } from 'react';

/**
 * @constant ACCENT
 * @description The colour of the plain setting tiles.
 */
const ACCENT = '#56616F';

/**
 * @constant NEGATIVE
 * @description The colour of the destructive setting tiles.
 */
const NEGATIVE = '#FF3B30';

/**
 * @function BudgetSettingsComponent
 * @description The Settings tab: the sync state, the budget and limits, the default currency, the exchange rates and
 * what the budget holds. The language and signing out live in the portal's account settings, as they span every app.
 * On a desktop, its lists keep the width of a settings column, centred, rather than stretching across the screen.
 */
function BudgetSettingsComponent(): JSX.Element {
    const document = useDocument();
    const { status } = useBudget();
    const rates = useRates();
    const { store } = useBudgetContext();
    const [showLimits, setShowLimits] = useState(false);
    const [currency, setCurrency] = useState(defaultCurrency);
    const [isConfirmingReset, setIsConfirmingReset] = useState(false);
    const [showTrash, setShowTrash] = useState(false);
    const latest = rates.latest;
    const currentMonth = monthStart(new Date());

    /**
     * @function reset
     * @description Deletes every operation and puts the budget back to its defaults, as the app's Reset does.
     */
    const reset = (): void => {
        store.apply(() => ({
            categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
            operations: [],
            budget: { monthlyLimit: 3000 },
            budgetHistory: {}
        }));
        setIsConfirmingReset(false);
    };

    /**
     * @function pickCurrency
     * @description Remembers the currency new operations start in
     */
    const pickCurrency = (event: ChangeEvent<HTMLSelectElement>): void => {
        setCurrency(event.target.value);
        rememberCurrency(event.target.value);
    };

    return (
        <div className='animate-rise lg:mx-auto lg:max-w-3xl'>
            <PageHeaderComponent className='mb-8'>
                <p className='eyebrow'>{t('settings.eyebrow')}</p>
                <h1 className='mt-1 text-[34px] font-semibold leading-tight tracking-tight'>{t('settings.title')}</h1>
            </PageHeaderComponent>

            <ListGroupComponent title={t('settings.budget')}>
                <ListRowComponent icon={<IconTileComponent icon={RefreshCw} color={ACCENT} size={30} />} title={t('settings.sync')}>
                    <SyncBadgeComponent status={status} />
                </ListRowComponent>
                <ListRowComponent icon={<IconTileComponent icon={Target} color={ACCENT} size={30} />} title={t('settings.budgetAndLimits')} onClick={() => setShowLimits(true)}>
                    <span className='text-[15px] text-ink-secondary tabular-nums'>
                        {euro(document.budget.monthlyLimit)}
                    </span>
                    <ChevronRight size={17} className='text-ink-quaternary' />
                </ListRowComponent>
            </ListGroupComponent>

            <ListGroupComponent title={t('settings.entry')}>
                <ListRowComponent icon={<IconTileComponent icon={Euro} color={ACCENT} size={30} />} title={<label htmlFor='default-currency'>{t('settings.defaultCurrency')}</label>}>
                    <select id='default-currency' value={currency} onChange={pickCurrency} className='cursor-pointer rounded-lg bg-transparent py-1 text-right text-[15px] text-ink-secondary outline-none focus:ring-2 focus:ring-accent/40'>
                        {CURRENCIES.map((option) => (
                            <option key={option.code} value={option.code}>{option.code}</option>
                        ))}
                    </select>
                </ListRowComponent>
            </ListGroupComponent>

            <ListGroupComponent title={t('settings.exchangeRates')} note={t('settings.markup', { markup: percent(BANK_MARKUP) })}>
                {CURRENCIES.filter((option) => option.code !== EURO.code).map((option) => {
                    const reference = latest?.rates[option.code];

                    /**
                     * @constant title
                     * @description The currency's code and name
                     */
                    const title = (
                        <span>
                            <span className='font-mono text-[14px] font-medium'>{option.code}</span>{' '}
                            <span className='ml-1.5 text-ink-secondary'>{currencyName(option)}</span>
                        </span>
                    );

                    return (
                        <ListRowComponent key={option.code} title={title}>
                            <span className='text-[14px] text-ink-secondary tabular-nums'>
                                {reference !== undefined ? `1 ${option.code} = ${rate(bankRate(reference, option.code))} €` : '•'}
                            </span>
                        </ListRowComponent>
                    );
                })}
            </ListGroupComponent>

            <ListGroupComponent title={t('settings.data')}>
                <ListRowComponent icon={<IconTileComponent icon={List} color={ACCENT} size={30} />} title={t('settings.operations')}>
                    <span className='text-[15px] text-ink-secondary tabular-nums'>{document.operations.length}</span>
                </ListRowComponent>
                <ListRowComponent icon={<IconTileComponent icon={LayoutGrid} color={ACCENT} size={30} />} title={t('settings.categories')}>
                    <span className='text-[15px] text-ink-secondary tabular-nums'>{categoriesOf(document.categories).length}</span>
                </ListRowComponent>
                <ListRowComponent icon={<IconTileComponent icon={ArchiveRestore} color={ACCENT} size={30} />} title={t('trash.title')} onClick={() => setShowTrash(true)}>
                    <ChevronRight size={17} className='text-ink-quaternary' />
                </ListRowComponent>
                <ListRowComponent icon={<IconTileComponent icon={Trash2} color={NEGATIVE} size={30} />} title={t('settings.reset')} destructive onClick={() => setIsConfirmingReset(true)} />
            </ListGroupComponent>

            <BudgetLimitsComponent month={currentMonth} open={showLimits} onClose={() => setShowLimits(false)} />
            <BudgetTrashComponent open={showTrash} onClose={() => setShowTrash(false)} />
            <AlertComponent open={isConfirmingReset} title={t('settings.confirmReset')} message={t('settings.resetMessage')} action={t('settings.resetAction')} onConfirm={reset} onCancel={() => setIsConfirmingReset(false)} />
        </div>
    );
}

export default BudgetSettingsComponent;
