import FrameActionComponent from 'components/frame-action/frame-action';
import type { FrameTab } from 'components/frame/frame';
import FrameComponent from 'components/frame/frame';
import LoadingScreenComponent from 'components/loading-screen/loading-screen';
import SheetComponent from 'components/sheet/sheet';
import { Bookmark, CircleCheckBig, CirclePlay } from 'lucide-react';
import { t } from 'modules/language/language-service';
import { useCatchUp, useWatchlist, useWatchlistContext, useWatchlistSheetContext } from 'modules/watchlist/watchlist-hooks';
import { watchlist } from 'modules/watchlist/watchlist-manifest';
import type { WatchlistSheetContextProps } from 'modules/watchlist/watchlist-models';
import { WatchlistProvider, WatchlistSheetProvider } from 'modules/watchlist/watchlist-provider';
import WatchlistQueueComponent from 'pages/watchlist/watchlist-queue/watchlist-queue';
import WatchlistSearchComponent from 'pages/watchlist/watchlist-search/watchlist-search';
import WatchlistTitleComponent from 'pages/watchlist/watchlist-title/watchlist-title';
import WatchlistWatchedComponent from 'pages/watchlist/watchlist-watched/watchlist-watched';
import WatchlistWatchingComponent from 'pages/watchlist/watchlist-watching/watchlist-watching';
import { useState, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

/**
 * @constant TABS
 * @description To watch, being watched, and watched
 */
const TABS: readonly FrameTab[] = [
    { to: '/watchlist', label: 'watchlist.toWatch', icon: Bookmark, end: true },
    { to: '/watchlist/watching', label: 'watchlist.watching', icon: CirclePlay },
    { to: '/watchlist/watched', label: 'watchlist.watched', icon: CircleCheckBig }
];

/**
 * @function AddButtonComponent
 * @description The watchlist's main action in the portal's bar: finding a title to add
 *
 * @returns {JSX.Element} The add button
 */
function AddButtonComponent(): JSX.Element {
    const { openSearch }: WatchlistSheetContextProps = useWatchlistSheetContext();

    return (
        <FrameActionComponent label={t('watchlist.add')} onClick={openSearch} />
    );
}

/**
 * @function WatchlistSheetComponent
 * @description The watchlist's one sheet: the search, or a title. The search keeps its query while a title found with it
 * is open, so going back shows the same results.
 *
 * @returns {JSX.Element} The sheet
 */
function WatchlistSheetComponent(): JSX.Element {
    const { route, openSearch, openTitle, close }: WatchlistSheetContextProps = useWatchlistSheetContext();
    const [query, setQuery] = useState('');

    let title = t('watchlist.searchTitle');

    if (route.kind === 'title') {
        title = route.title.mediaType !== 'movie' ? t('watchlist.series') : t('watchlist.movie');
    }

    /**
     * @function closeSheet
     * @description Closes the sheet and forgets the search, so the next one starts empty
     */
    const closeSheet = (): void => {
        close();
        setQuery('');
    };

    return (
        <SheetComponent open={route.kind !== 'closed'} title={title} isFull onClose={closeSheet}>
            {route.kind === 'search' && (
                <WatchlistSearchComponent query={query} onQueryChange={setQuery} onOpen={(found) => openTitle(found, true)} />
            )}
            {route.kind === 'title' && (
                <WatchlistTitleComponent key={`${route.title.mediaType}:${route.title.tmdbId}`} title={route.title} onBack={route.fromSearch ? openSearch : undefined} onOpen={(other) => openTitle(other, route.fromSearch)} />
            )}
        </SheetComponent>
    );
}

/**
 * @function WatchlistCreditsComponent
 * @description Where the films and series come from, as the catalog asks to be credited: its own logo, as TMDB supplies
 * it, at the height of the text so it stays quieter than the portal's, and its notice
 *
 * @returns {JSX.Element} The credits
 */
function WatchlistCreditsComponent(): JSX.Element {
    return (
        <footer className='mx-auto mt-16 max-w-xl text-center text-[12px] leading-relaxed text-ink-quaternary'>
            <p>
                {t('watchlist.creditsSource')}{' '}
                <a href='https://www.themoviedb.org' target='_blank' rel='noreferrer' className='inline-block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40'>
                    <img src='/tmdb.svg' alt='TMDB' width={69} height={9} className='inline-block h-[9px] w-auto' />
                </a>
                .
            </p>
        </footer>
    );
}

/**
 * @function WatchlistShellComponent
 * @description Keeps the watchlist in step with the server, waits for its first read, then shows the tabs in the
 * portal's frame
 *
 * @returns {JSX.Element} The watchlist, or what stands in for it while it loads
 */
function WatchlistShellComponent(): JSX.Element {
    const store = useWatchlistContext();
    const { entries, status, error } = useWatchlist();

    useCatchUp(store);

    if (entries === null) {
        if (status === 'loading') {
            return <LoadingScreenComponent />;
        }

        return (
            <main className='flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center'>
                <p className='text-[17px] font-semibold'>{t('watchlist.loadFailed')}</p>
                <p className='text-[15px] text-ink-secondary'>{error}</p>
                <button type='button' onClick={() => void store.refresh()} className='mt-2 rounded-full bg-accent px-5 py-2 text-[15px] font-semibold text-white'>
                    {t('watchlist.tryAgain')}
                </button>
            </main>
        );
    }

    return (
        <WatchlistSheetProvider>
            <FrameComponent app={watchlist} tabs={TABS} action={<AddButtonComponent />}>
                <Routes>
                    <Route index element={<WatchlistQueueComponent />} />
                    <Route path='watching' element={<WatchlistWatchingComponent />} />
                    <Route path='watched' element={<WatchlistWatchedComponent />} />
                    <Route path='*' element={<Navigate to='/watchlist' replace />} />
                </Routes>
                <WatchlistCreditsComponent />
            </FrameComponent>
            <WatchlistSheetComponent />
        </WatchlistSheetProvider>
    );
}

/**
 * @function WatchlistPage
 * @description The watchlist, as the portal loads it under `/watchlist`. It shares one watchlist with its tile on the
 * home page.
 *
 * @returns {JSX.Element} The watchlist page
 */
function WatchlistPage(): JSX.Element {
    return (
        <WatchlistProvider>
            <WatchlistShellComponent />
        </WatchlistProvider>
    );
}

export default WatchlistPage;
