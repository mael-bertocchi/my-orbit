import PosterComponent from 'components/poster/poster';
import { t } from 'modules/language/language-service';
import { localized, releaseYear } from 'modules/watchlist/watchlist-formatting';
import type { Entry } from 'modules/watchlist/watchlist-models';
import type { JSX } from 'react';

/**
 * @interface PosterCardComponentProps
 * @description Properties of one title on a wall of posters
 */
interface PosterCardComponentProps {
    entry: Entry; /*!< The title */
    onOpen: () => void; /*!< Called when it is tapped */
}

/**
 * @function PosterCardComponent
 * @description One title on a wall of posters, as To watch and Watching show them: its poster, which darkens a little
 * on hover, its name and its year
 *
 * @param {PosterCardComponentProps} props The properties of the component
 */
function PosterCardComponent(props: PosterCardComponentProps): JSX.Element {
    const year = releaseYear(props.entry.releaseDate);

    return (
        <button type='button' onClick={props.onOpen} className='group flex flex-col text-left'>
            <PosterComponent path={props.entry.posterPath} title={localized(props.entry.title)} width='w342' className='w-full rounded-xl shadow-control transition group-hover:brightness-95' />
            <span className='mt-2 line-clamp-2 text-[14px] font-medium leading-snug'>{localized(props.entry.title)}</span>
            <span className='text-[12px] text-ink-tertiary'>
                {[year, props.entry.mediaType !== 'tv' ? null : t('watchlist.series')].filter((part) => part !== null).join(' • ')}
            </span>
        </button>
    );
}

export default PosterCardComponent;
