import SpinnerComponent from 'components/spinner/spinner';
import { Check, ChevronsRight, SquarePen } from 'lucide-react';
import { t } from 'modules/language/language-service';
import { dayText, episodeText } from 'modules/watchlist/watchlist-formatting';
import { useSave } from 'modules/watchlist/watchlist-hooks';
import type { Entry, EntryChanges } from 'modules/watchlist/watchlist-models';
import { nextEpisode, seasonShare } from 'modules/watchlist/watchlist-shelves';
import { useState, type FormEvent, type JSX } from 'react';

/**
 * @interface ProgressBarComponentProps
 * @description How far a bar is filled
 */
interface ProgressBarComponentProps {
    share: number; /*!< The share filled, from 0 to 1 */
}

/**
 * @interface ProgressPanelComponentProps
 * @description The title being watched, and what finishing it does
 */
interface ProgressPanelComponentProps {
    entry: Entry; /*!< The title being watched */
    onFinish: () => void; /*!< Called to mark it watched, which asks for a review */
}

/**
 * @interface ProgressFieldsProps
 * @description The title being watched, and how to change it
 */
interface ProgressFieldsProps {
    entry: Entry; /*!< The title being watched */
    save: (changes: EntryChanges) => Promise<boolean>; /*!< Stores a change, telling whether it went through */
}

/**
 * @function ProgressBarComponent
 * @description A thin bar showing how far into a season the owner is
 *
 * @param {ProgressBarComponentProps} props The properties of the component
 */
export function ProgressBarComponent(props: ProgressBarComponentProps): JSX.Element {
    return (
        <div className='h-1 overflow-hidden rounded-full bg-fill-strong'>
            <div className='h-full rounded-full bg-accent transition-[width]' style={{ width: `${Math.round(props.share * 100)}%` }} />
        </div>
    );
}

/**
 * @function EpisodeFieldsComponent
 * @description Where a series is: its last episode seen against the season's length, a button to count one more
 * episode, and a form to say which episode it is at
 *
 * @param {ProgressFieldsProps} props The properties of the component
 */
function EpisodeFieldsComponent(props: ProgressFieldsProps): JSX.Element {
    const [isEditing, setIsEditing] = useState(false);
    const [season, setSeason] = useState(String(props.entry.progress?.season ?? 1));
    const [episode, setEpisode] = useState(String(props.entry.progress?.episode ?? 1));
    const next = nextEpisode(props.entry);
    const share = seasonShare(props.entry);
    const progress = props.entry.progress;
    const seasonLength = progress === null ? undefined : props.entry.episodeCounts.at(progress.season - 1);

    /**
     * @function openEditor
     * @description Shows the form, starting from the last episode seen
     */
    const openEditor = (): void => {
        setSeason(String(progress?.season ?? 1));
        setEpisode(String(progress?.episode ?? 1));
        setIsEditing(true);
    };

    /**
     * @function submit
     * @description Stores the episode typed instead of sending the form
     */
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        void props.save({ progress: { season: Number(season), episode: Number(episode) } }).then((isSaved) => setIsEditing(!isSaved));
    };

    if (isEditing) {
        return (
            <form onSubmit={submit} className='mt-3'>
                <div className='grid grid-cols-2 gap-3'>
                    <label className='block'>
                        <span className='field-label'>{t('watchlist.season')}</span>
                        <input type='number' inputMode='numeric' min={1} max={props.entry.episodeCounts.length === 0 ? undefined : props.entry.episodeCounts.length} required value={season} onChange={(event) => setSeason(event.target.value)} className='field bg-white' />
                    </label>
                    <label className='block'>
                        <span className='field-label'>{t('watchlist.episodeNumber')}</span>
                        <input type='number' inputMode='numeric' min={1} required value={episode} onChange={(event) => setEpisode(event.target.value)} className='field bg-white' />
                    </label>
                </div>
                <div className='mt-3 flex gap-2'>
                    <button type='button' onClick={() => setIsEditing(false)} className='h-9 flex-1 rounded-xl bg-white text-[14px] font-semibold shadow-control transition hover:bg-fill-strong'>
                        {t('common.cancel')}
                    </button>
                    <button type='submit' className='h-9 flex-1 rounded-xl bg-accent text-[14px] font-semibold text-white transition hover:bg-accent-strong'>
                        {t('watchlist.save')}
                    </button>
                </div>
            </form>
        );
    }

    return (
        <div className='mt-3'>
            <div className='flex items-baseline justify-between gap-3'>
                <span className='text-[15px] font-semibold tabular-nums'>
                    {progress === null ? t('watchlist.noEpisode') : episodeText(progress)}
                    {seasonLength !== undefined && seasonLength > 0 && <span className='font-normal text-ink-tertiary'> / {seasonLength}</span>}
                </span>
                {next === null && <span className='text-[12px] text-ink-tertiary'>{t('watchlist.seriesOver')}</span>}
            </div>
            {share !== null && <div className='mt-2'><ProgressBarComponent share={share} /></div>}
            <div className='mt-3 flex flex-wrap gap-2'>
                {next !== null && (
                    <button type='button' onClick={() => void props.save({ progress: next })} className='inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-[14px] font-semibold shadow-control transition hover:bg-fill-strong'>
                        <ChevronsRight size={16} />
                        {t('watchlist.nextEpisode')}
                    </button>
                )}
                <button type='button' onClick={openEditor} className='inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-[14px] font-semibold shadow-control transition hover:bg-fill-strong'>
                    <SquarePen size={15} />
                    {t('watchlist.changeEpisode')}
                </button>
            </div>
        </div>
    );
}

/**
 * @function ProgressPanelComponent
 * @description A title being watched, in its sheet: when it was started, which episode a series is at, and the button
 * that marks it watched
 *
 * @param {ProgressPanelComponentProps} props The properties of the component
 */
function ProgressPanelComponent(props: ProgressPanelComponentProps): JSX.Element {
    const { save, isSaving } = useSave(props.entry);

    return (
        <div className='mt-3 rounded-2xl bg-fill p-4'>
            <div className='flex items-center justify-between gap-2'>
                <span className='text-[13px] text-ink-tertiary'>{props.entry.startedAt === null ? '' : t('watchlist.startedOn', { date: dayText(props.entry.startedAt) })}</span>
                {isSaving && <SpinnerComponent size={14} />}
            </div>
            {props.entry.mediaType === 'tv' && <EpisodeFieldsComponent entry={props.entry} save={save} />}
            <button type='button' onClick={props.onFinish} className='mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-[15px] font-semibold text-white transition hover:bg-accent-strong'>
                <Check size={18} strokeWidth={2.6} />
                {t('watchlist.finished')}
            </button>
        </div>
    );
}

export default ProgressPanelComponent;
