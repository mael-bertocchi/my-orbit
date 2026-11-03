import { chooseLanguage } from 'modules/language/language-service';
import { imageUrl, ratingText, releaseYear, runtimeText, titleFacts, titlesText, watchedText } from 'modules/watchlist/watchlist-formatting';
import { describe, expect, it } from 'vitest';

describe('watchlist formatting', () => {
    it('builds the address of a catalog image', () => {
        expect(imageUrl('/fellowship.jpg', 'w342')).toBe('https://image.tmdb.org/t/p/w342/fellowship.jpg');
    });

    it('reads the year a title came out, if known', () => {
        expect(releaseYear('2001-12-18')).toBe('2001');
        expect(releaseYear(null)).toBeNull();
    });

    it('writes a length in hours and minutes', () => {
        expect(runtimeText(179)).toBe('2h 59m');
        expect(runtimeText(125)).toBe('2h 05m');
        expect(runtimeText(45)).toBe('45 min');
        chooseLanguage('fr');
        expect(runtimeText(179)).toBe('2 h 59');
    });

    it('puts a title’s facts on one line, leaving out what is unknown', () => {
        expect(titleFacts({ releaseDate: '2001-12-18', mediaType: 'movie', runtime: 179 })).toBe('2001 • Film • 2h 59m');
        expect(titleFacts({ releaseDate: '2011-04-17', mediaType: 'tv', seasons: 8 })).toBe('2011 • Series • 8 seasons');
        expect(titleFacts({ releaseDate: null, mediaType: 'tv', seasons: 1 })).toBe('Series • 1 season');
    });

    it('counts titles with each language’s singular, which takes 0 in French', () => {
        expect([0, 1, 2].map(titlesText)).toEqual(['0 titles', '1 title', '2 titles']);
        expect(watchedText(1)).toBe('1 title watched');
        chooseLanguage('fr');
        expect([0, 1, 2].map(titlesText)).toEqual(['0 titre', '1 titre', '2 titres']);
        expect([0, 3].map(watchedText)).toEqual(['0 titre vu', '3 titres vus']);
    });

    it('writes a rating in stars, with the page’s decimal separator', () => {
        expect(ratingText(9)).toBe('4.5 out of 5 stars');
        expect(ratingText(null)).toBe('Not rated');
        chooseLanguage('fr');
        expect(ratingText(7)).toBe('3,5 étoiles sur 5');
    });
});
