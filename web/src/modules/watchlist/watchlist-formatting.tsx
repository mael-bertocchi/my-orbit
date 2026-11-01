import type { Maybe } from 'models';
import { currentLanguage, t } from 'modules/language/language-service';
import type { LocalizedText, MediaType, Progress } from 'modules/watchlist/watchlist-models';

/**
 * @constant IMAGE_BASE_URL
 * @description Where the catalog (TMDB) serves its images, by width
 */
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

/**
 * @type PosterWidth
 * @description The image widths the catalog serves that the page uses
 */
export type PosterWidth = 'w92' | 'w185' | 'w342';

/**
 * @function imageUrl
 * @description Where the catalog serves an image at a given width
 *
 * @param {string} path The image's path in the catalog
 * @param {PosterWidth} width The width
 * @returns {string} Its address
 */
export function imageUrl(path: string, width: PosterWidth): string {
    return `${IMAGE_BASE_URL}/${width}${path}`;
}

/**
 * @function localized
 * @description A text in the page's language
 *
 * @param {LocalizedText} text The text, in each language
 * @returns {string} The text, in the page's language
 */
export function localized(text: LocalizedText): string {
    return text[currentLanguage()];
}

/**
 * @function releaseYear
 * @description The year a title came out
 *
 * @param {Maybe<string>} releaseDate The day it came out, as `YYYY-MM-DD`
 * @returns {Maybe<string>} Its year, or null when it is unknown
 */
export function releaseYear(releaseDate: Maybe<string>): Maybe<string> {
    return releaseDate === null ? null : releaseDate.slice(0, 4);
}

/**
 * @function kindName
 * @description What a title is, in a word
 *
 * @param {MediaType} mediaType A film or a series
 * @returns {string} "Film" or "Series", in the page's language
 */
export function kindName(mediaType: MediaType): string {
    return mediaType === 'movie' ? t('watchlist.movie') : t('watchlist.series');
}

/**
 * @function runtimeText
 * @description How long a film lasts, in hours and minutes
 *
 * @param {number} minutes Its length, in minutes
 * @returns {string} Its length, written out
 */
export function runtimeText(minutes: number): string {
    if (minutes < 60) {
        return t('watchlist.minutes', { minutes });
    }

    return t('watchlist.hours', { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') });
}

/**
 * @function isSingular
 * @description Whether a count takes the singular in the page's language: 1 in English, 0 and 1 in French
 *
 * @param {number} count The count
 * @returns {boolean} Whether it takes the singular
 */
function isSingular(count: number): boolean {
    return new Intl.PluralRules(currentLanguage()).select(count) === 'one';
}

/**
 * @function titlesText
 * @description How many titles there are to watch
 *
 * @param {number} count The number of titles
 * @returns {string} The number of titles, written out
 */
export function titlesText(count: number): string {
    return isSingular(count) ? t('watchlist.countOne', { count }) : t('watchlist.countMany', { count });
}

/**
 * @function watchedText
 * @description How many titles were watched
 *
 * @param {number} count The number of titles
 * @returns {string} The number of titles, written out
 */
export function watchedText(count: number): string {
    return isSingular(count) ? t('watchlist.watchedOne', { count }) : t('watchlist.watchedMany', { count });
}

/**
 * @function seasonsText
 * @description How many seasons a series has
 *
 * @param {number} seasons The number of seasons
 * @returns {string} The number of seasons, written out
 */
export function seasonsText(seasons: number): string {
    return isSingular(seasons) ? t('watchlist.oneSeason', { count: seasons }) : t('watchlist.seasons', { count: seasons });
}

/**
 * @interface TitleFactsSource
 * @description What a title's facts are read from: an entry, a title found, or a title's details
 */
export interface TitleFactsSource {
    releaseDate: Maybe<string>; /*!< When it came out */
    mediaType: MediaType; /*!< A film or a series */
    runtime?: Maybe<number>; /*!< How long a film lasts, in minutes */
    seasons?: Maybe<number>; /*!< How many seasons a series has */
}

/**
 * @function titleFacts
 * @description A title's year and kind, then its length or its seasons when known, as one line
 *
 * @param {TitleFactsSource} title The title
 * @returns {string} Its facts, separated by bullets
 */
export function titleFacts(title: TitleFactsSource): string {
    const facts = [releaseYear(title.releaseDate), kindName(title.mediaType)];

    if (title.runtime !== undefined && title.runtime !== null && title.runtime > 0) {
        facts.push(runtimeText(title.runtime));
    }

    if (title.seasons !== undefined && title.seasons !== null && title.seasons > 0) {
        facts.push(seasonsText(title.seasons));
    }

    return facts.filter((fact) => fact !== null).join(' • ');
}

/**
 * @function ratingText
 * @description A rating, written out for those who can't see the stars
 *
 * @param {Maybe<number>} rating The rating in half stars, or null
 * @returns {string} The rating, written out
 */
export function ratingText(rating: Maybe<number>): string {
    if (rating === null) {
        return t('watchlist.notRated');
    }

    return t('watchlist.stars', { stars: starsText(rating) });
}

/**
 * @function starsText
 * @description A rating as a number of stars, such as 4.5, written in the page's language
 *
 * @param {number} rating The rating in half stars
 * @returns {string} The number of stars
 */
export function starsText(rating: number): string {
    return new Intl.NumberFormat(currentLanguage(), { maximumFractionDigits: 1 }).format(rating / 2);
}

/**
 * @function episodeText
 * @description An episode of a series, such as S3 · E4
 *
 * @param {Progress} progress The episode
 * @returns {string} The episode, written out
 */
export function episodeText(progress: Progress): string {
    return t('watchlist.episode', { season: progress.season, episode: progress.episode });
}

/**
 * @function dayText
 * @description A day, written in the page's language
 *
 * @param {Date} date The day
 * @returns {string} The day, written out
 */
export function dayText(date: Date): string {
    return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium' }).format(date);
}
