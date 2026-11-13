import PageHeaderComponent from 'components/page-header/page-header';
import { t } from 'modules/language/language-service';
import { titlesText } from 'modules/watchlist/watchlist-formatting';
import { useWatchlist, useWatchlistSheetContext } from 'modules/watchlist/watchlist-hooks';
import type { WatchlistSheetContextProps } from 'modules/watchlist/watchlist-models';
import { watching } from 'modules/watchlist/watchlist-shelves';
import PosterCardComponent from 'pages/watchlist/watchlist-poster-card/watchlist-poster-card';
import { useMemo, type JSX } from 'react';

/**
 * @function WatchlistWatchingComponent
 * @description The "Watching" tab: the titles started and not finished, the latest started first, on a wall of posters like To watch
 *
 * @returns {JSX.Element} The titles being watched
 */
function WatchlistWatchingComponent(): JSX.Element {
    const { entries } = useWatchlist();
    const { openTitle }: WatchlistSheetContextProps = useWatchlistSheetContext();
    const current = useMemo(() => watching(entries ?? []), [entries]);

    return (
        <div className='animate-rise'>
            <PageHeaderComponent>
                <p className='eyebrow'>{t('watchlist.eyebrow')}</p>
                <h1 className='mt-1 text-[34px] font-semibold leading-tight tracking-tight'>{t('watchlist.watchingTitle')}</h1>
                <p className='mt-1 text-[15px] text-ink-secondary'>
                    {titlesText(current.length)}
                </p>
            </PageHeaderComponent>

            {current.length !== 0 ? (
                <div className='mt-6 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-5 xl:grid-cols-6 wide:grid-cols-8'>
                    {current.map((entry) => (
                        <PosterCardComponent key={entry.id} entry={entry} onOpen={() => openTitle({ mediaType: entry.mediaType, tmdbId: entry.tmdbId })} />
                    ))}
                </div>
            ) : (
                <div className='mt-8 rounded-2xl bg-fill px-6 py-10 text-center'>
                    <p className='text-[15px] text-ink-secondary'>{t('watchlist.emptyWatching')}</p>
                </div>
            )}
        </div>
    );
}

export default WatchlistWatchingComponent;
