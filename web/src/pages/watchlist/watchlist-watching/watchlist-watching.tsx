import PosterComponent from 'components/poster/poster';
import { ChevronsRight } from 'lucide-react';
import type { Maybe } from 'models';
import { t } from 'modules/language/language-service';
import { dayText, episodeText, kindName, localized, positionText, titlesText } from 'modules/watchlist/watchlist-formatting';
import { useSave, useWatchlist, useWatchlistSheetContext } from 'modules/watchlist/watchlist-hooks';
import type { Entry, WatchlistSheetContextProps } from 'modules/watchlist/watchlist-models';
import { nextEpisode, seasonShare, watching } from 'modules/watchlist/watchlist-shelves';
import { ProgressBarComponent } from 'pages/watchlist/watchlist-progress/watchlist-progress';
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
 * @function progressLine
 * @description Where a title being watched is, in a few words: the last episode seen of a series, the moment a film
 * stopped at, or nothing when none was noted
 *
 * @param {Entry} entry The title
 * @returns {string} Where it is, or an empty text
 */
function progressLine(entry: Entry): string {
    if (entry.progress !== null) {
        return episodeText(entry.progress);
    }

    return entry.position === null ? '' : t('watchlist.stoppedAt', { time: positionText(entry.position) });
}

/**
 * @function progressShare
 * @description How far into its season a series is, or into its runtime a film, or null when it can't be told
 *
 * @param {Entry} entry The title
 * @returns {Maybe<number>} The share seen, from 0 to 1
 */
function progressShare(entry: Entry): Maybe<number> {
    if (entry.mediaType === 'tv') {
        return seasonShare(entry);
    }

    if (entry.position === null || entry.runtime === null || entry.runtime === 0) {
        return null;
    }

    return Math.min(1, entry.position / (entry.runtime * 60));
}

/**
 * @function WatchingCardComponent
 * @description One title being watched: its poster, its name, since when, where it is, and for a series a button that
 * counts one more episode seen
 *
 * @param {WatchingCardComponentProps} props The properties of the component
 */
function WatchingCardComponent(props: WatchingCardComponentProps): JSX.Element {
    const { save, isSaving } = useSave(props.entry);
    const next = props.entry.mediaType === 'tv' ? nextEpisode(props.entry) : null;
    const share = progressShare(props.entry);
    const line = progressLine(props.entry);
    const facts = [kindName(props.entry.mediaType), props.entry.startedAt === null ? null : t('watchlist.startedOn', { date: dayText(props.entry.startedAt) })];

    return (
        <li className='card flex gap-4 p-3.5'>
            <button type='button' onClick={props.onOpen} className='shrink-0' aria-label={localized(props.entry.title)}>
                <PosterComponent path={props.entry.posterPath} title={localized(props.entry.title)} width='w185' className='w-20 rounded-xl shadow-control' />
            </button>
            <div className='flex min-w-0 flex-1 flex-col'>
                <button type='button' onClick={props.onOpen} className='text-left'>
                    <span className='block truncate text-[17px] font-semibold tracking-tight'>{localized(props.entry.title)}</span>
                    <span className='block text-[13px] text-ink-tertiary'>{facts.filter((fact) => fact !== null).join(' • ')}</span>
                </button>
                {line !== '' && <p className='mt-2 text-[14px] font-semibold tabular-nums'>{line}</p>}
                {share !== null && <div className='mt-1.5'><ProgressBarComponent share={share} /></div>}
                {next !== null && (
                    <div className='mt-auto pt-3'>
                        <button type='button' disabled={isSaving} onClick={() => void save({ progress: next })} className='inline-flex h-8 items-center gap-1.5 rounded-lg bg-fill px-2.5 text-[13px] font-semibold transition hover:bg-fill-strong disabled:opacity-60'>
                            <ChevronsRight size={15} />
                            {props.entry.progress === null ? t('watchlist.firstEpisode') : t('watchlist.nextEpisode')}
                        </button>
                    </div>
                )}
            </div>
        </li>
    );
}

/**
 * @function WatchlistWatchingComponent
 * @description The "Watching" tab: the titles started and not finished, the latest started first, each on a card large
 * enough to say where it is
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

            {current.length === 0 ? (
                <div className='mt-8 rounded-2xl bg-fill px-6 py-10 text-center'>
                    <p className='text-[15px] text-ink-secondary'>{t('watchlist.emptyWatching')}</p>
                </div>
            ) : (
                <ul className='mt-6 grid gap-3 md:grid-cols-2'>
                    {current.map((entry) => (
                        <WatchingCardComponent key={entry.id} entry={entry} onOpen={() => openTitle({ mediaType: entry.mediaType, tmdbId: entry.tmdbId })} />
                    ))}
                </ul>
            )}
        </div>
    );
}

export default WatchlistWatchingComponent;
