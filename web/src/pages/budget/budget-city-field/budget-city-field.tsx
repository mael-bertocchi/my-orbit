import SpinnerComponent from 'components/spinner/spinner';
import SuggestionFieldComponent, { type Suggestion } from 'components/suggestion-field/suggestion-field';
import { LocateFixed, MapPin } from 'lucide-react';
import type { Maybe } from 'models';
import { placeName } from 'modules/budget/budget-formatting';
import { useDocument } from 'modules/budget/budget-hooks';
import type { PlaceReference } from 'modules/budget/budget-models';
import { Limits } from 'modules/budget/budget-operations';
import type { CityValue } from 'modules/budget/budget-places';
import { isCityChosen, locateCity, useCitySuggestions } from 'modules/budget/budget-places';
import { t } from 'modules/language/language-service';
import { useState, type JSX, type MouseEvent } from 'react';
import { messageOf } from 'utils/errors';

/**
 * @function keepFocus
 * @description Keeps the focus in the field as the Locate button is pressed, so the list under it doesn't fold away
 * before the press ends
 */
function keepFocus(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
}

/**
 * @interface BudgetCityFieldComponentProps
 * @description Properties of the city field
 */
interface BudgetCityFieldComponentProps {
    id: string; /*!< Its identifier, for its label */
    value: CityValue; /*!< What it holds */
    onChange: (value: CityValue) => void; /*!< Called with what it holds once changed */
    kept: Maybe<string>; /*!< The place written before cities were checked, which may stay, if any */
}

/**
 * @function BudgetCityFieldComponent
 * @description The city of an operation, or a recurring one: as it is typed, the cities of earlier operations and those
 * the server finds are offered, and one has to be picked; Locate fills in the city the device is in. A city reads in the
 * page's language.
 *
 * @param {BudgetCityFieldComponentProps} props The properties of the component
 */
function BudgetCityFieldComponent(props: BudgetCityFieldComponentProps): JSX.Element {
    const document = useDocument();
    const [isTyping, setIsTyping] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [locateError, setLocateError] = useState<Maybe<string>>(null);
    const options = useCitySuggestions(document.operations, props.value.location, isTyping);
    const suggestions = options.map((place): Suggestion => ({ id: place.id, value: placeName(place), detail: place.detail }));
    const isChosen = isCityChosen(props.value, props.kept);

    /**
     * @function type
     * @description Takes the place as it is typed, which is no city until one is picked
     */
    const type = (location: string): void => {
        props.onChange({ location, place: null });
        setIsTyping(true);
        setLocateError(null);
    };

    /**
     * @function settle
     * @description Takes a city picked or located
     */
    const settle = (place: PlaceReference): void => {
        props.onChange({ location: placeName(place), place: { id: place.id, nameEn: place.nameEn, nameFr: place.nameFr } });
        setIsTyping(false);
        setLocateError(null);
    };

    /**
     * @function pick
     * @description Takes the city a suggestion stands for
     */
    const pick = (suggestion: Suggestion): void => {
        const place = options.find((option) => option.id === suggestion.id);

        if (place !== undefined) {
            settle(place);
        }
    };

    /**
     * @function locate
     * @description Fills in the city the device is in, or says why it can't, the suggestions put away either way
     */
    const locate = async (): Promise<void> => {
        setIsLocating(true);
        setLocateError(null);

        try {
            settle(await locateCity());
        } catch (error: unknown) {
            setIsTyping(false);
            setLocateError(messageOf(error));
        } finally {
            setIsLocating(false);
        }
    };

    /**
     * @constant locateButton
     * @description The button at the end of the field, filling in the city the device is in
     */
    const locateButton = (
        <button type='button' onMouseDown={keepFocus} onClick={() => void locate()} disabled={isLocating} title={t('operation.locateHint')} className='absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-accent transition hover:bg-fill-strong disabled:opacity-60'>
            {isLocating ? <SpinnerComponent size={14} /> : <LocateFixed size={15} />}
            {t('operation.locate')}
        </button>
    );

    let notice: Maybe<JSX.Element> = null;

    if (locateError !== null) {
        notice = <p className='mt-1.5 text-[12px] text-warning-text'>{locateError}</p>;
    } else if (!isChosen) {
        notice = <p className='mt-1.5 text-[12px] text-ink-tertiary'>{t('operation.pickCity')}</p>;
    }

    return (
        <div>
            <SuggestionFieldComponent id={props.id} value={props.value.location} onType={type} onPick={pick} suggestions={suggestions} label={t('operation.suggestions')} placeholder={t('operation.locationPlaceholder')} maxLength={Limits.location} icon={MapPin} trailing={locateButton} />
            {notice}
        </div>
    );
}

export default BudgetCityFieldComponent;
