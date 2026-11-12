import PosterComponent from 'components/poster/poster';
import SearchFieldComponent from 'components/search-field/search-field';
import SpinnerComponent from 'components/spinner/spinner';
import { Check, Plus } from 'lucide-react';
import type { Maybe } from 'models';
import type { MessageKey } from 'modules/language/language-en';
import { t } from 'modules/language/language-service';
import { useToastContext } from 'modules/toast/toast-hooks';
import type { ToastContextProps } from 'modules/toast/toast-models';
import { titleFacts } from 'modules/watchlist/watchlist-formatting';
import { useWatchlist, useWatchlistContext } from 'modules/watchlist/watchlist-hooks';
import type { CatalogTitle, Entry, EntryStatus, TitleReference } from 'modules/watchlist/watchlist-models';
import watchlistService from 'modules/watchlist/watchlist-service';
import { statusOf } from 'modules/watchlist/watchlist-shelves';
import { useEffect, useState, type JSX } from 'react';
import { messageOf } from 'utils/errors';

/**
 * @constant SEARCH_DELAY
 * @description How long typing must pause before the search runs, in milliseconds
 */
const SEARCH_DELAY = 350;

/**
 * @constant SEARCH_BADGES
 * @description What a result already on the watchlist says, by where it stands
 */
const SEARCH_BADGES: Record<EntryStatus, MessageKey> = {
    toWatch: 'watchlist.onList',
    watching: 'watchlist.statusWatching',
    watched: 'watchlist.seen'
};

/**
 * @constant MIN_QUERY
 * @description How many characters a query needs before it is searched
 */
const MIN_QUERY = 2;

/**
 * @interface WatchlistSearchComponentProps
 * @description What the search shows and does
 */
interface WatchlistSearchComponentProps {
    query: string; /*!< What is searched, kept by the sheet so going back keeps it */
    onQueryChange: (query: string) => void; /*!< Called as the query is typed */
    onOpen: (title: TitleReference) => void; /*!< Called with a title to show */
}

/**
 * @interface SearchState
 * @description Where a search stands
 */
interface SearchState {
    query: string; /*!< The query it answers */
    results: Maybe<CatalogTitle[]>; /*!< The titles found, once found */
    error: Maybe<string>; /*!< Why it failed */
}

/**
 * @interface ResultRowComponentProps
 * @description Properties of one title found
 */
interface ResultRowComponentProps {
    result: CatalogTitle; /*!< The title */
    entry: Maybe<Entry>; /*!< Its entry, when it is already on the watchlist */
    onOpen: () => void; /*!< Called when it is tapped */
}

/**
 * @function ResultRowComponent
 * @description One title found: its poster, its name and facts, and whether it is on the watchlist, or a button to put
 * it there
 *
 * @param {ResultRowComponentProps} props The properties of the component
 */
function ResultRowComponent(props: ResultRowComponentProps): JSX.Element {
    const store = useWatchlistContext();
    const { showToast }: ToastContextProps = useToastContext();
    const [isAdding, setIsAdding] = useState(false);
    const hasOriginal = props.result.originalTitle !== props.result.title;

    /**
     * @function add
     * @description Puts the title on the watchlist, to watch
     */
    const add = async (): Promise<void> => {
        setIsAdding(true);

        try {
            await store.add({ mediaType: props.result.mediaType, tmdbId: props.result.tmdbId });
            showToast(t('watchlist.added', { title: props.result.title }));
        } catch (failure: unknown) {
            showToast(messageOf(failure));
        } finally {
            setIsAdding(false);
        }
    };

    let status: JSX.Element;

    if (props.entry !== null) {
        status = (
            <span className='flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent'>
                <Check size={13} strokeWidth={3} />
                {t(SEARCH_BADGES[statusOf(props.entry)])}
            </span>
        );
    } else {
        status = (
            <button type='button' onClick={() => void add()} disabled={isAdding} aria-label={t('watchlist.addTitle', { title: props.result.title })} className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent transition hover:bg-accent hover:text-white disabled:opacity-60'>
                {isAdding ? <SpinnerComponent size={16} /> : <Plus size={19} strokeWidth={2.6} />}
            </button>
        );
    }

    return (
        <li className='flex items-center gap-3 py-2.5'>
            <button type='button' onClick={props.onOpen} className='flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left'>
                <PosterComponent path={props.result.posterPath} title={props.result.title} width='w92' className='w-11 rounded-md' />
                <span className='min-w-0'>
                    <span className='block truncate text-[15px] font-semibold'>{props.result.title}</span>
                    {hasOriginal && <span className='block truncate text-[13px] text-ink-secondary'>{props.result.originalTitle}</span>}
                    <span className='block text-[12px] text-ink-tertiary'>{titleFacts(props.result)}</span>
                </span>
            </button>
            {status}
        </li>
    );
}

/**
 * @function WatchlistSearchComponent
 * @description Finds films and series in the catalog as the query is typed, shows which are already on the watchlist,
 * and puts one there in a tap. Tapping a title shows it in full.
 *
 * @param {WatchlistSearchComponentProps} props The properties of the component
 */
function WatchlistSearchComponent(props: WatchlistSearchComponentProps): JSX.Element {
    const { entries } = useWatchlist();
    const store = useWatchlistContext();
    const [search, setSearch] = useState<SearchState>({ query: '', results: null, error: null });
    const query = props.query.trim();
    const isSearching = query.length >= MIN_QUERY && search.query !== query;

    useEffect(() => {
        if (query.length < MIN_QUERY) {
            return;
        }

        let isCurrent = true;
        const timer = window.setTimeout(() => {
            watchlistService.searchTitles(query)
                .then((results: CatalogTitle[]) => {
                    if (isCurrent) {
                        setSearch({ query, results, error: null });
                    }
                })
                .catch((failure: unknown) => {
                    if (isCurrent) {
                        setSearch({ query, results: null, error: messageOf(failure) });
                    }
                });
        }, SEARCH_DELAY);

        return () => {
            isCurrent = false;
            window.clearTimeout(timer);
        };
    }, [query]);

    let body: JSX.Element;

    if (query.length < MIN_QUERY) {
        body = <p className='px-1 py-8 text-center text-[15px] text-ink-secondary'>{t('watchlist.searchPrompt')}</p>;
    } else if (isSearching) {
        body = <div className='flex justify-center py-10'><SpinnerComponent /></div>;
    } else if (search.error !== null) {
        body = <p className='px-1 py-8 text-center text-[15px] text-negative-text'>{search.error}</p>;
    } else if (search.results !== null && search.results.length !== 0) {
        body = (
            <ul className='divide-y divide-hairline'>
                {search.results.map((result) => (
                    <ResultRowComponent key={`${result.mediaType}:${result.tmdbId}`} result={result} entry={entries !== null ? store.find(result) : null} onOpen={() => props.onOpen({ mediaType: result.mediaType, tmdbId: result.tmdbId })} />
                ))}
            </ul>
        );
    } else {
        body = <p className='px-1 py-8 text-center text-[15px] text-ink-secondary'>{t('watchlist.noResults')}</p>;
    }

    return (
        <div>
            <SearchFieldComponent value={props.query} onChange={props.onQueryChange} placeholder={t('watchlist.searchPlaceholder')} label={t('watchlist.searchTitle')} clearLabel={t('watchlist.clearSearch')} hasFocus />
            <div className='mt-2'>{body}</div>
        </div>
    );
}

export default WatchlistSearchComponent;
