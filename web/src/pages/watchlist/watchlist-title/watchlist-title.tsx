import AlertComponent from 'components/alert/alert';
import PosterComponent from 'components/poster/poster';
import RatingComponent from 'components/rating/rating';
import SheetFooterComponent from 'components/sheet/sheet-footer';
import SpinnerComponent from 'components/spinner/spinner';
import { Bookmark, Check, ChevronLeft, CircleCheckBig, CirclePlay, ExternalLink, Plus, SquarePen, Trash2 } from 'lucide-react';
import type { Maybe } from 'models';
import type { MessageKey } from 'modules/language/language-en';
import { t } from 'modules/language/language-service';
import { useToastContext } from 'modules/toast/toast-hooks';
import type { ToastContextProps } from 'modules/toast/toast-models';
import { dayText, imageUrl, ratingText, releaseYear, titleFacts } from 'modules/watchlist/watchlist-formatting';
import { useWatchlist, useWatchlistContext } from 'modules/watchlist/watchlist-hooks';
import type { CatalogTitle, Collection, Entry, EntryStatus, Offers, Provider, TitleDetails, TitleReference } from 'modules/watchlist/watchlist-models';
import watchlistService from 'modules/watchlist/watchlist-service';
import { statusOf } from 'modules/watchlist/watchlist-shelves';
import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { messageOf } from 'utils/errors';

/**
 * @constant OFFER_KINDS
 * @description The kinds of offer, in the order they show, and what each is called
 */
const OFFER_KINDS: readonly { kind: Exclude<keyof Offers, 'link'>; name: MessageKey }[] = [
    { kind: 'subscription', name: 'watchlist.subscription' },
    { kind: 'free', name: 'watchlist.free' },
    { kind: 'rent', name: 'watchlist.rent' },
    { kind: 'buy', name: 'watchlist.buy' }
];

/**
 * @constant STATUSES
 * @description The three places a title can stand, in order, and what each is called
 */
const STATUSES: readonly { status: EntryStatus; name: MessageKey }[] = [
    { status: 'toWatch', name: 'watchlist.statusToWatch' },
    { status: 'watching', name: 'watchlist.statusWatching' },
    { status: 'watched', name: 'watchlist.statusWatched' }
];

/**
 * @interface StatusControlComponentProps
 * @description Where a title stands, and what picking another place does
 */
interface StatusControlComponentProps {
    status: EntryStatus; /*!< Where it stands, or where it is going while its review is written */
    disabled: boolean; /*!< Whether a change is on its way */
    onChange: (status: EntryStatus) => void; /*!< Called with the place picked */
}

/**
 * @interface WatchlistTitleComponentProps
 * @description Which title the sheet shows, and where it can go from there
 */
interface WatchlistTitleComponentProps {
    title: TitleReference; /*!< The title */
    onBack?: () => void; /*!< Goes back to the search the title was found with, if it was */
    onOpen: (title: TitleReference) => void; /*!< Shows another title, such as another film of the saga */
}

/**
 * @interface ReviewFormComponentProps
 * @description What the review form starts from, and what it does
 */
interface ReviewFormComponentProps {
    entry: Maybe<Entry>; /*!< The title's entry, or null when it isn't on the watchlist yet */
    title: TitleReference; /*!< The title */
    onDone: () => void; /*!< Called once saved or cancelled */
}

/**
 * @interface ProviderComponentProps
 * @description A service offering a title
 */
interface ProviderComponentProps {
    provider: Provider; /*!< The service */
}

/**
 * @interface OffersComponentProps
 * @description Where a title can be watched
 */
interface OffersComponentProps {
    offers: Offers; /*!< The offers in France */
}

/**
 * @interface SagaComponentProps
 * @description The saga a film belongs to
 */
interface SagaComponentProps {
    collectionId: number; /*!< The saga's identifier in the catalog */
    current: TitleReference; /*!< The film shown */
    onOpen: (title: TitleReference) => void; /*!< Shows another film of the saga */
}

/**
 * @function dayInput
 * @description A day as a date field holds it, in local time
 *
 * @param {Date} date The day
 * @returns {string} The day, as `YYYY-MM-DD`
 */
function dayInput(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * @function watchedInstant
 * @description When a title was watched, from the day picked: now when it is today, the middle of that day otherwise
 *
 * @param {string} day The day picked, as `YYYY-MM-DD`
 * @returns {Date} The instant to store
 */
function watchedInstant(day: string): Date {
    const now = new Date();

    return day === dayInput(now) ? now : new Date(`${day}T12:00:00`);
}

/**
 * @function ReviewFormComponent
 * @description Marks a title watched on a day, with a rating in half stars and a comment. A title not on the watchlist
 * yet is put there first.
 *
 * @param {ReviewFormComponentProps} props The properties of the component
 */
function ReviewFormComponent(props: ReviewFormComponentProps): JSX.Element {
    const store = useWatchlistContext();
    const { showToast }: ToastContextProps = useToastContext();
    const [rating, setRating] = useState<Maybe<number>>(props.entry?.rating ?? null);
    const [comment, setComment] = useState(props.entry?.comment ?? '');
    const [day, setDay] = useState(dayInput(props.entry?.watchedAt ?? new Date()));
    const [isSaving, setIsSaving] = useState(false);

    /**
     * @function save
     * @description Stores the review, adding the title first when needed
     */
    const save = async (): Promise<void> => {
        setIsSaving(true);

        try {
            const entry = props.entry ?? (await store.add(props.title));
            const previous = props.entry?.watchedAt ?? null;
            const watchedAt = previous !== null && dayInput(previous) === day ? previous : watchedInstant(day);

            await store.update(entry.id, { watchedAt, rating, comment: comment.trim() === '' ? null : comment.trim() });
            props.onDone();
        } catch (failure: unknown) {
            showToast(messageOf(failure));
            setIsSaving(false);
        }
    };

    /**
     * @function submit
     * @description Saves the review instead of sending the form
     */
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        void save();
    };

    return (
        <form className='mt-5 rounded-2xl bg-fill p-4' onSubmit={submit}>
            <p className='field-label'>{t('watchlist.yourRating')}</p>
            <div className='flex items-center gap-3'>
                <RatingComponent value={rating} label={t('watchlist.yourRating')} onChange={setRating} size={30} />
                {rating !== null && (
                    <button type='button' onClick={() => setRating(null)} className='text-[13px] font-medium text-ink-tertiary hover:text-ink'>
                        {t('watchlist.clearRating')}
                    </button>
                )}
            </div>
            <label htmlFor='watchlist-comment' className='field-label mt-4'>{t('watchlist.comment')}</label>
            <textarea id='watchlist-comment' value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={3} placeholder={t('watchlist.commentPlaceholder')} className='w-full resize-y rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-quaternary focus:ring-2 focus:ring-accent/40' />
            <label htmlFor='watchlist-day' className='field-label mt-4'>{t('watchlist.watchedDay')}</label>
            <input id='watchlist-day' type='date' value={day} max={dayInput(new Date())} required onChange={(event) => setDay(event.target.value)} className='field bg-white' />
            <div className='mt-5 flex gap-3'>
                <button type='button' onClick={props.onDone} className='h-11 flex-1 rounded-2xl bg-white text-[15px] font-semibold text-ink shadow-control transition hover:bg-fill-strong'>
                    {t('common.cancel')}
                </button>
                <button type='submit' disabled={isSaving} className='flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60'>
                    {isSaving && <SpinnerComponent size={16} />}
                    {t('watchlist.save')}
                </button>
            </div>
        </form>
    );
}

/**
 * @function StatusControlComponent
 * @description A segmented control moving a title between to watch, being watched and watched
 *
 * @param {StatusControlComponentProps} props The properties of the component
 */
function StatusControlComponent(props: StatusControlComponentProps): JSX.Element {
    return (
        <div className='mt-5 flex rounded-full bg-fill-strong/80 p-1' role='group' aria-label={t('watchlist.status')}>
            {STATUSES.map((option) => (
                <button key={option.status} type='button' disabled={props.disabled} aria-pressed={option.status === props.status} onClick={() => props.onChange(option.status)} className={`flex-1 rounded-full px-3 py-1.5 text-[14px] font-medium transition disabled:opacity-60 ${option.status === props.status ? 'bg-white text-accent-strong shadow-control' : 'text-ink-secondary hover:text-ink'}`}>
                    {t(option.name)}
                </button>
            ))}
        </div>
    );
}

/**
 * @function ProviderComponent
 * @description A service offering a title: its logo and name
 *
 * @param {ProviderComponentProps} props The properties of the component
 */
function ProviderComponent(props: ProviderComponentProps): JSX.Element {
    return (
        <li className='flex items-center gap-2 rounded-xl bg-fill py-1.5 pl-1.5 pr-3'>
            {props.provider.logoPath === null ? (
                <span className='h-7 w-7 rounded-lg bg-fill-strong' />
            ) : (
                <img src={imageUrl(props.provider.logoPath, 'w92')} alt='' loading='lazy' className='h-7 w-7 rounded-lg object-cover' />
            )}
            <span className='text-[13px] font-medium'>{props.provider.name}</span>
        </li>
    );
}

/**
 * @function OffersComponent
 * @description Where a title can be watched in France: with a subscription, for free, to rent or to buy, credited to
 * JustWatch as it asks
 *
 * @param {OffersComponentProps} props The properties of the component
 */
function OffersComponent(props: OffersComponentProps): JSX.Element {
    const kinds = OFFER_KINDS.filter(({ kind }) => props.offers[kind].length > 0);

    return (
        <section className='mt-7'>
            <h3 className='eyebrow mb-3'>{t('watchlist.whereToWatch')}</h3>
            {kinds.length === 0 ? (
                <p className='text-[15px] text-ink-secondary'>{t('watchlist.notAvailable')}</p>
            ) : kinds.map(({ kind, name }) => (
                <div key={kind} className='mt-3 first:mt-0'>
                    <p className='mb-1.5 text-[13px] font-medium text-ink-secondary'>{t(name)}</p>
                    <ul className='flex flex-wrap gap-2'>
                        {props.offers[kind].map((provider) => <ProviderComponent key={provider.id} provider={provider} />)}
                    </ul>
                </div>
            ))}
            <p className='mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-quaternary'>
                <span>{t('watchlist.offersSource')}</span>
                {props.offers.link !== null && (
                    <a href={props.offers.link} target='_blank' rel='noreferrer' className='inline-flex items-center gap-1 font-medium text-accent hover:underline'>
                        {t('watchlist.allOffers')}
                        <ExternalLink size={12} />
                    </a>
                )}
            </p>
        </section>
    );
}

/**
 * @function SagaComponent
 * @description The saga a film belongs to, its films in the order they came out, each marked watched, to watch, or
 * ready to add
 *
 * @param {SagaComponentProps} props The properties of the component
 */
function SagaComponent(props: SagaComponentProps): JSX.Element {
    const store = useWatchlistContext();
    const { entries } = useWatchlist();
    const { showToast }: ToastContextProps = useToastContext();
    const [saga, setSaga] = useState<Maybe<Collection>>(null);
    const [error, setError] = useState<Maybe<string>>(null);

    useEffect(() => {
        let isCurrent = true;

        watchlistService.getCollection(props.collectionId)
            .then((found: Collection) => {
                if (isCurrent) {
                    setSaga(found);
                }
            })
            .catch((failure: unknown) => {
                if (isCurrent) {
                    setError(messageOf(failure));
                }
            });

        return () => {
            isCurrent = false;
        };
    }, [props.collectionId]);

    /**
     * @function addPart
     * @description Puts one of the saga's films on the watchlist, to watch
     *
     * @param {CatalogTitle} part The film
     */
    const addPart = (part: CatalogTitle): void => {
        store.add({ mediaType: part.mediaType, tmdbId: part.tmdbId })
            .then(() => showToast(t('watchlist.added', { title: part.title })))
            .catch((failure: unknown) => showToast(messageOf(failure)));
    };

    if (saga === null) {
        return (
            <section className='mt-7'>
                <h3 className='eyebrow mb-3'>{t('watchlist.saga')}</h3>
                {error === null ? <SpinnerComponent size={18} /> : <p className='text-[14px] text-ink-secondary'>{error}</p>}
            </section>
        );
    }

    return (
        <section className='mt-7'>
            <h3 className='eyebrow mb-1'>{t('watchlist.saga')}</h3>
            <p className='mb-3 text-[15px] font-semibold'>{saga.name}</p>
            <ol className='divide-y divide-hairline rounded-2xl bg-fill'>
                {saga.parts.map((part, index) => {
                    const entry = entries === null ? null : store.find(part);
                    const isCurrent = part.tmdbId === props.current.tmdbId;
                    let mark: JSX.Element;

                    if (isCurrent) {
                        mark = <span className='text-[12px] font-semibold text-ink-tertiary'>{t('watchlist.thisFilm')}</span>;
                    } else if (entry !== null && statusOf(entry) === 'watched') {
                        mark = <CircleCheckBig size={18} className='text-positive' aria-label={t('watchlist.seen')} />;
                    } else if (entry !== null && statusOf(entry) === 'watching') {
                        mark = <CirclePlay size={18} className='text-accent' aria-label={t('watchlist.statusWatching')} />;
                    } else if (entry !== null) {
                        mark = <Bookmark size={18} className='text-accent' aria-label={t('watchlist.onList')} />;
                    } else {
                        mark = (
                            <button type='button' aria-label={t('watchlist.addTitle', { title: part.title })} onClick={() => addPart(part)} className='flex h-7 w-7 items-center justify-center rounded-full bg-white text-accent shadow-control transition hover:bg-accent hover:text-white'>
                                <Plus size={16} strokeWidth={2.6} />
                            </button>
                        );
                    }

                    return (
                        <li key={part.tmdbId} className='flex items-center gap-3 px-3 py-2'>
                            <span className='w-5 text-center text-[13px] font-semibold tabular-nums text-ink-tertiary'>{index + 1}</span>
                            <button type='button' disabled={isCurrent} onClick={() => props.onOpen({ mediaType: part.mediaType, tmdbId: part.tmdbId })} className='flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default'>
                                <PosterComponent path={part.posterPath} title={part.title} width='w92' className='w-8 rounded' />
                                <span className='min-w-0'>
                                    <span className={`block truncate text-[14px] ${isCurrent ? 'font-semibold' : 'font-medium'}`}>{part.title}</span>
                                    <span className='block text-[12px] text-ink-tertiary'>{releaseYear(part.releaseDate) ?? t('watchlist.unreleased')}</span>
                                </span>
                            </button>
                            {mark}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

/**
 * @function WatchlistTitleComponent
 * @description One film or series in full: what it is, where it stands on the watchlist and what can be done with it
 * (add it, mark it watched with a rating and a comment, watch it again, take it off), where to watch it in France, and
 * for a film, its saga
 *
 * @param {WatchlistTitleComponentProps} props The properties of the component
 */
function WatchlistTitleComponent(props: WatchlistTitleComponentProps): JSX.Element {
    const store = useWatchlistContext();
    const { entries } = useWatchlist();
    const { showToast }: ToastContextProps = useToastContext();
    const [details, setDetails] = useState<Maybe<TitleDetails>>(null);
    const [error, setError] = useState<Maybe<string>>(null);
    const [attempt, setAttempt] = useState(0);
    const [isReviewing, setIsReviewing] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
    const entry = entries === null ? null : store.find(props.title);

    useEffect(() => {
        let isCurrent = true;

        watchlistService.getTitle(props.title)
            .then((found: TitleDetails) => {
                if (isCurrent) {
                    setDetails(found);
                    setError(null);
                }
            })
            .catch((failure: unknown) => {
                if (isCurrent) {
                    setError(messageOf(failure));
                }
            });

        return () => {
            isCurrent = false;
        };
    }, [props.title, attempt]);

    /**
     * @function run
     * @description Runs a change, showing why it failed if it did
     */
    const run = async (change: () => Promise<unknown>, done?: string): Promise<void> => {
        setIsBusy(true);

        try {
            await change();

            if (done !== undefined) {
                showToast(done);
            }
        } catch (failure: unknown) {
            showToast(messageOf(failure));
        } finally {
            setIsBusy(false);
        }
    };

    const back = props.onBack !== undefined && (
        <button type='button' onClick={props.onBack} className='-ml-1 mb-3 inline-flex items-center gap-0.5 text-[15px] font-medium text-accent'>
            <ChevronLeft size={19} strokeWidth={2.4} />
            {t('watchlist.backToResults')}
        </button>
    );

    if (details === null) {
        return (
            <div>
                {back}
                {error === null ? (
                    <div className='flex justify-center py-16'><SpinnerComponent /></div>
                ) : (
                    <div className='py-12 text-center'>
                        <p className='text-[15px] text-ink-secondary'>{error}</p>
                        <button type='button' onClick={() => setAttempt((current) => current + 1)} className='mt-4 rounded-full bg-accent px-5 py-2 text-[15px] font-semibold text-white'>
                            {t('watchlist.tryAgain')}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    /**
     * @function confirmRemoval
     * @description Takes the title off the watchlist, once confirmed
     */
    const confirmRemoval = (): void => {
        setIsConfirmingRemoval(false);

        if (entry !== null) {
            void run(() => store.remove(entry.id), t('watchlist.removed', { title: details.title }));
        }
    };

    /**
     * @function changeStatus
     * @description Moves the title to the place picked. Watched asks for a review first; being watched starts it now;
     * to watch forgets its start and its review.
     *
     * @param {Entry} current The title's entry
     * @param {EntryStatus} next The place picked
     */
    const changeStatus = (current: Entry, next: EntryStatus): void => {
        if (next === statusOf(current)) {
            setIsReviewing(false);

            return;
        }

        if (next === 'watched') {
            setIsReviewing(true);

            return;
        }

        setIsReviewing(false);

        if (next === 'watching') {
            void run(() => store.update(current.id, { startedAt: new Date(), watchedAt: null }), t('watchlist.started', { title: details.title }));

            return;
        }

        void run(() => store.update(current.id, { startedAt: null, watchedAt: null }), t('watchlist.backOnList', { title: details.title }));
    };

    const secondary = 'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-fill px-4 text-[15px] font-semibold text-ink transition hover:bg-fill-strong disabled:opacity-60';
    const primary = 'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-accent px-4 text-[15px] font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60';
    let actions: JSX.Element;

    if (entry === null) {
        actions = (
            <div className='mt-5 grid grid-cols-[1fr_auto] gap-3'>
                <button type='button' disabled={isBusy} onClick={() => void run(() => store.add(props.title), t('watchlist.added', { title: details.title }))} className={primary}>
                    <Plus size={18} strokeWidth={2.6} />
                    {t('watchlist.addToWatch')}
                </button>
                <button type='button' onClick={() => setIsReviewing(true)} className={secondary}>
                    <Check size={18} strokeWidth={2.6} />
                    {t('watchlist.alreadySeen')}
                </button>
            </div>
        );
    } else {
        const removeButton = (
            <button type='button' disabled={isBusy} onClick={() => setIsConfirmingRemoval(true)} className={`${secondary} w-full text-negative-text`}>
                <Trash2 size={17} />
                {t('watchlist.remove')}
            </button>
        );
        let body: Maybe<JSX.Element> = null;
        let footer: JSX.Element = removeButton;

        if (isReviewing) {
            body = <ReviewFormComponent entry={entry} title={props.title} onDone={() => setIsReviewing(false)} />;
        } else if (statusOf(entry) === 'watching' && entry.startedAt !== null) {
            body = <p className='mt-3 text-[13px] text-ink-tertiary'>{t('watchlist.startedOn', { date: dayText(entry.startedAt) })}</p>;
        } else if (statusOf(entry) === 'watched') {
            body = (
                <div className='mt-3 rounded-2xl bg-fill p-4'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                        <RatingComponent value={entry.rating} label={ratingText(entry.rating)} size={22} />
                        {entry.watchedAt !== null && <span className='text-[13px] text-ink-tertiary'>{t('watchlist.watchedOn', { date: dayText(entry.watchedAt) })}</span>}
                    </div>
                    {entry.comment !== null && <p className='mt-3 whitespace-pre-line text-[15px] leading-relaxed'>{entry.comment}</p>}
                </div>
            );
            footer = (
                <div className='grid grid-cols-2 gap-3'>
                    <button type='button' onClick={() => setIsReviewing(true)} className={secondary}>
                        <SquarePen size={17} />
                        {t('watchlist.editReview')}
                    </button>
                    {removeButton}
                </div>
            );
        }

        actions = (
            <>
                <StatusControlComponent status={isReviewing ? 'watched' : statusOf(entry)} disabled={isBusy} onChange={(next) => changeStatus(entry, next)} />
                {body}
                {!isReviewing && <SheetFooterComponent>{footer}</SheetFooterComponent>}
            </>
        );
    }

    return (
        <div>
            {back}
            <div className='flex gap-4'>
                <PosterComponent path={details.posterPath} title={details.title} width='w185' className='w-28 rounded-xl shadow-control' />
                <div className='min-w-0 flex-1'>
                    <h3 className='text-[22px] font-semibold leading-tight tracking-tight'>{details.title}</h3>
                    {details.originalTitle !== details.title && (
                        <p className='mt-0.5 text-[14px] text-ink-secondary'>{details.originalTitle}</p>
                    )}
                    <p className='mt-1.5 text-[13px] text-ink-tertiary'>{titleFacts(details)}</p>
                    {details.genres.length > 0 && (
                        <ul className='mt-2.5 flex flex-wrap gap-1.5'>
                            {details.genres.map((genre) => (
                                <li key={genre.id} className='rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-medium text-ink-secondary'>
                                    {genre.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {entry === null && isReviewing ? <ReviewFormComponent entry={entry} title={props.title} onDone={() => setIsReviewing(false)} /> : actions}

            {details.overview !== '' && <p className='mt-6 text-[15px] leading-relaxed text-ink'>{details.overview}</p>}

            <OffersComponent offers={details.offers} />

            {details.collection !== null && (
                <SagaComponent collectionId={details.collection.id} current={props.title} onOpen={props.onOpen} />
            )}

            <AlertComponent open={isConfirmingRemoval} title={t('watchlist.confirmRemove')} message={entry?.watchedAt === null ? undefined : t('watchlist.removeMessage')} action={t('watchlist.remove')} onConfirm={confirmRemoval} onCancel={() => setIsConfirmingRemoval(false)} />
        </div>
    );
}

export default WatchlistTitleComponent;
