import { Clapperboard } from 'lucide-react';
import type { Maybe } from 'models';
import type { PosterWidth } from 'modules/watchlist/watchlist-formatting';
import { imageUrl } from 'modules/watchlist/watchlist-formatting';
import { useState, type JSX } from 'react';

/**
 * @interface PosterComponentProps
 * @description What a poster shows
 */
interface PosterComponentProps {
    path: Maybe<string>; /*!< The poster's path in the catalog, or null when there is none */
    title: string; /*!< The title it is the poster of, for those who can't see it */
    width?: PosterWidth; /*!< The width to load, matching how large it shows */
    className?: string; /*!< Its size and corners */
}

/**
 * @function PosterComponent
 * @description A film's or a series' poster, at the 2:3 ratio of a poster. It is a block whatever holds it, so its width,
 * its ratio and its rounded corners hold even inside a button or a link. Without one, or while it can't load, a
 * clapperboard on a grey card stands in.
 *
 * @param {PosterComponentProps} props The properties of the component
 */
function PosterComponent(props: PosterComponentProps): JSX.Element {
    const [hasFailed, setHasFailed] = useState(false);
    const className = `relative block aspect-[2/3] shrink-0 overflow-hidden bg-fill-strong ${props.className ?? 'w-full rounded-xl'}`;

    if (props.path === null || hasFailed) {
        return (
            <span className={`${className} flex items-center justify-center text-ink-quaternary`} role='img' aria-label={props.title}>
                <Clapperboard size='38%' strokeWidth={1.6} />
            </span>
        );
    }

    return (
        <span className={className}>
            <img src={imageUrl(props.path, props.width ?? 'w342')} alt={props.title} loading='lazy' onError={() => setHasFailed(true)} className='h-full w-full object-cover' />
            <span className='pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.1)]' />
        </span>
    );
}

export default PosterComponent;
