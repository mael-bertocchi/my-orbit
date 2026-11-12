import PosterComponent from 'components/poster/poster';
import { t } from 'modules/language/language-service';
import { dayText, localized, titleFacts, titlesText } from 'modules/watchlist/watchlist-formatting';
import { useWatchlist, useWatchlistSheetContext } from 'modules/watchlist/watchlist-hooks';
import type { Entry, WatchlistSheetContextProps } from 'modules/watchlist/watchlist-models';
import { watching } from 'modules/watchlist/watchlist-shelves';
import { useMemo, type JSX } from 'react';

/**
 * @interface WatchingCardComponentProps
 * @description Properties of one title being watched
 */
interface WatchingCardComponentProps {
    entry: Entry; /*!< The title */
    onOpen: () => void; /*!< Called when it is tapped */
}

/**
 * @function WatchingCardComponent
 * @description One title being watched: its poster, its name, its year and kind, and since when. The whole card opens
 * the title, where it is marked watched.
 *
 * @param {WatchingCardComponentProps} props The properties of the component
 */
function WatchingCardComponent(props: WatchingCardComponentProps): JSX.Element {
    return (
        <li>
            <button type='button' onClick={props.onOpen} className='card flex w-full gap-4 p-3.5 text-left transition hover:bg-fill'>
                <PosterComponent path={props.entry.posterPath} title={localized(props.entry.title)} width='w185' className='w-20 rounded-lg shadow-control' />
                <span className='flex min-w-0 flex-1 flex-col self-stretch'>
                    <span className='line-clamp-2 text-[17px] font-semibold leading-snug tracking-tight'>{localized(props.entry.title)}</span>
                    <span className='mt-0.5 block truncate text-[13px] text-ink-tertiary'>{titleFacts(props.entry)}</span>
                    {props.entry.startedAt !== null && <span className='mt-auto block truncate text-[13px] text-ink-secondary'>{t('watchlist.startedOn', { date: dayText(props.entry.startedAt) })}</span>}
                </span>
            </button>
        </li>
    );
}

/**
 * @function WatchlistWatchingComponent
 * @description The "Watching" tab: the titles started and not finished, the latest started first, each on a card
 *
 * @returns {JSX.Element} The titles being watched
 */
function WatchlistWatchingComponent(): JSX.Element {
    const { entries } = useWatchlist();
    const { openTitle }: WatchlistSheetContextProps = useWatchlistSheetContext();
    const current = useMemo(() => watching(entries ?? []), [entries]);

    return (
        <div className='animate-rise'>
            <p className='eyebrow'>{t('watchlist.eyebrow')}</p>
            <h1 className='mt-1 text-[34px] font-semibold leading-tight tracking-tight'>{t('watchlist.watchingTitle')}</h1>
            <p className='mt-1 text-[15px] text-ink-secondary'>
                {titlesText(current.length)}
            </p>

            {current.length !== 0 ? (
                <ul className='mt-6 grid gap-3 md:grid-cols-2'>
                    {current.map((entry) => (
                        <WatchingCardComponent key={entry.id} entry={entry} onOpen={() => openTitle({ mediaType: entry.mediaType, tmdbId: entry.tmdbId })} />
                    ))}
                </ul>
            ) : (
                <div className='mt-8 rounded-2xl bg-fill px-6 py-10 text-center'>
                    <p className='text-[15px] text-ink-secondary'>{t('watchlist.emptyWatching')}</p>
                </div>
            )}
        </div>
    );
}

export default WatchlistWatchingComponent;
