import EmptyStateComponent from 'components/empty-state/empty-state';
import PosterComponent from 'components/poster/poster';
import SearchFieldComponent from 'components/search-field/search-field';
import { Star } from 'lucide-react';
import type { Maybe } from 'models';
import type { MessageKey } from 'modules/language/language-en';
import { t } from 'modules/language/language-service';
import { localized, ratingText, starsText, watchedText } from 'modules/watchlist/watchlist-formatting';
import { useProgressive, useWatchlist, useWatchlistSheetContext } from 'modules/watchlist/watchlist-hooks';
import type { Entry, WatchlistSheetContextProps } from 'modules/watchlist/watchlist-models';
import type { KindFilter, WatchedOrder } from 'modules/watchlist/watchlist-shelves';
import { isKindFilter, isWatchedOrder, KIND_FILTERS, matches, ofKind, watchedEntries, watchedIn, watchedShelves, watchedYears } from 'modules/watchlist/watchlist-shelves';
import { useMemo, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * @constant ORDERS
 * @description Every way to list the watched titles, and what it is called
 */
const ORDERS: readonly { order: WatchedOrder; name: MessageKey }[] = [
    { order: 'recent', name: 'watchlist.latestWatched' },
    { order: 'best', name: 'watchlist.bestRated' }
];

/**
 * @constant KIND_NAMES
 * @description What each kind filter is called
 */
const KIND_NAMES: Record<KindFilter, MessageKey> = {
    all: 'watchlist.all',
    movie: 'watchlist.movies',
    tv: 'watchlist.seriesPlural'
};

/**
 * @constant BATCH
 * @description How many posters the wall draws at a time: the next batch comes as the page scrolls down
 */
const BATCH = 48;

/**
 * @interface WatchedPosterComponentProps
 * @description Properties of one watched title on the wall
 */
interface WatchedPosterComponentProps {
    entry: Entry; /*!< The title */
    onOpen: () => void; /*!< Called when it is tapped */
}

/**
 * @function ratingShelfTitle
 * @description What the shelf of a rating is called, such as 4.5 ★
 *
 * @param {number} rating The rating in half stars
 * @returns {string} The shelf's title
 */
function ratingShelfTitle(rating: number): string {
    return t('watchlist.ratingShelf', { stars: starsText(rating) });
}

/**
 * @function yearChip
 * @description How a year's button looks: filled when it is the year shown
 *
 * @param {boolean} isCurrent Whether it is the year shown
 * @returns {string} Its classes
 */
function yearChip(isCurrent: boolean): string {
    return `h-8 shrink-0 rounded-full px-3.5 text-[14px] font-medium tabular-nums transition ${isCurrent ? 'bg-accent text-white' : 'bg-white text-ink shadow-control hover:bg-fill'}`;
}

/**
 * @function WatchedPosterComponent
 * @description One watched title on the wall: its poster with its rating in a corner, and its name below
 *
 * @param {WatchedPosterComponentProps} props The properties of the component
 */
function WatchedPosterComponent(props: WatchedPosterComponentProps): JSX.Element {
    const title = localized(props.entry.title);

    return (
        <button type='button' onClick={props.onOpen} title={title} aria-label={`${title}, ${ratingText(props.entry.rating)}`} className='group relative flex flex-col text-left'>
            <PosterComponent path={props.entry.posterPath} title={title} width='w185' className='w-full rounded-lg shadow-control transition group-hover:-translate-y-0.5 group-hover:shadow-card' />
            {props.entry.rating !== null && (
                <span className='absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm tabular-nums'>
                    <Star size={10} fill='#FF9F0A' stroke='#FF9F0A' />
                    {starsText(props.entry.rating)}
                </span>
            )}
            <span className='mt-1.5 line-clamp-1 text-[12px] font-medium leading-snug text-ink-secondary'>{title}</span>
        </button>
    );
}

/**
 * @function WatchlistWatchedComponent
 * @description The "Watched" tab, as a wall of posters: shelved by the year they were watched, the latest first, or by
 * rating, the best first, filtered by the year they were watched in, by kind and by a search through their titles, sagas
 * and comments. The wall draws a batch of posters at a time as the page scrolls, so it stays quick with hundreds of
 * titles. The order, the year, the filter and the search live in the address; a year no title was watched in shows
 * every year.
 *
 * @returns {JSX.Element} The watched titles
 */
function WatchlistWatchedComponent(): JSX.Element {
    const { entries } = useWatchlist();
    const { openTitle }: WatchlistSheetContextProps = useWatchlistSheetContext();
    const [params, setParams] = useSearchParams();
    const orderParam = params.get('by');
    const kindParam = params.get('kind');
    const order: WatchedOrder = isWatchedOrder(orderParam) ? orderParam : 'recent';
    const kind: KindFilter = isKindFilter(kindParam) ? kindParam : 'all';
    const query = params.get('q') ?? '';
    const watched = useMemo(() => watchedEntries(entries ?? [], order), [entries, order]);
    const years = useMemo(() => watchedYears(watched), [watched]);
    const yearParam = Number(params.get('year'));
    const year: Maybe<number> = years.includes(yearParam) ? yearParam : null;
    const shown = useMemo(() => ofKind(watchedIn(watched, year), kind).filter((entry) => matches(entry, query)), [watched, year, kind, query]);
    const { shown: count, sentinel } = useProgressive(BATCH, `${order}|${year ?? ''}|${kind}|${query}`);
    const shelves = useMemo(() => watchedShelves(shown.slice(0, count), order, ratingShelfTitle), [shown, count, order]);
    const totals = useMemo(() => new Map(watchedShelves(shown, order, ratingShelfTitle).map((shelf) => [shelf.key, shelf.entries.length])), [shown, order]);

    /**
     * @function update
     * @description Changes the order, the filter or the search in the address, dropping the defaults
     */
    const update = (key: 'by' | 'year' | 'kind' | 'q', value: string, fallback: string): void => {
        const next = new URLSearchParams(params);

        if (value === fallback) {
            next.delete(key);
        } else {
            next.set(key, value);
        }

        setParams(next, { replace: true });
    };

    return (
        <div className='animate-rise'>
            <p className='eyebrow'>{t('watchlist.eyebrow')}</p>
            <h1 className='mt-1 text-[34px] font-semibold leading-tight tracking-tight'>{t('watchlist.watchedTitle')}</h1>
            <p className='mt-1 text-[15px] text-ink-secondary'>
                {watchedText(watched.length)}
            </p>

            <SearchFieldComponent value={query} onChange={(next) => update('q', next, '')} placeholder={t('watchlist.filter')} clearLabel={t('watchlist.clearSearch')} className='mt-6' />

            <div className='mt-4 flex flex-wrap items-center gap-3'>
                <div className='flex rounded-full bg-fill-strong/80 p-1' role='group' aria-label={t('watchlist.order')}>
                    {ORDERS.map((option) => (
                        <button key={option.order} type='button' aria-pressed={option.order === order} onClick={() => update('by', option.order, 'recent')} className={`rounded-full px-3.5 py-1.5 text-[14px] font-medium transition ${option.order === order ? 'bg-white text-ink shadow-control' : 'text-ink-secondary hover:text-ink'}`}>
                            {t(option.name)}
                        </button>
                    ))}
                </div>
                <div className='flex gap-2' role='group' aria-label={t('watchlist.kind')}>
                    {KIND_FILTERS.map((option) => (
                        <button key={option} type='button' aria-pressed={option === kind} onClick={() => update('kind', option, 'all')} className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition ${option === kind ? 'bg-ink text-white' : 'bg-white text-ink shadow-control hover:bg-fill'}`}>
                            {t(KIND_NAMES[option])}
                        </button>
                    ))}
                </div>
            </div>

            {years.length > 1 && (
                <div className='-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0' role='group' aria-label={t('watchlist.year')}>
                    <button type='button' aria-pressed={year === null} onClick={() => update('year', '', '')} className={yearChip(year === null)}>
                        {t('watchlist.allYears')}
                    </button>
                    {years.map((option) => (
                        <button key={option} type='button' aria-pressed={option === year} onClick={() => update('year', String(option), '')} className={yearChip(option === year)}>
                            {option}
                        </button>
                    ))}
                </div>
            )}

            {shelves.length === 0 ? (
                <div className='mt-6'>
                    <EmptyStateComponent message={watched.length === 0 ? t('watchlist.noneWatched') : t('watchlist.noMatch')} />
                </div>
            ) : shelves.map((shelf) => (
                <section key={shelf.key} className='mt-8'>
                    <h2 className='sticky top-[calc(3.5rem_+_env(safe-area-inset-top))] z-[1] -mx-1 mb-3 flex items-baseline gap-2 bg-canvas/90 px-1 py-1.5 text-[17px] font-semibold tracking-tight backdrop-blur'>
                        {shelf.title}
                        <span className='text-[13px] font-medium text-ink-quaternary'>{totals.get(shelf.key) ?? shelf.entries.length}</span>
                    </h2>
                    <div className='grid grid-cols-4 gap-x-2.5 gap-y-4 sm:grid-cols-6 sm:gap-x-3 lg:grid-cols-8'>
                        {shelf.entries.map((entry) => (
                            <WatchedPosterComponent key={entry.id} entry={entry} onOpen={() => openTitle({ mediaType: entry.mediaType, tmdbId: entry.tmdbId })} />
                        ))}
                    </div>
                </section>
            ))}
            {count < shown.length && <div key={count} ref={sentinel} className='h-px' aria-hidden='true' />}
        </div>
    );
}

export default WatchlistWatchedComponent;
