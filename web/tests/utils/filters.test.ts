import { describe, expect, it } from 'vitest';
import { readList, toggled, writeList } from 'utils/filters';

describe('filters in the address', () => {
    it('reads the values of a filter, none when it is absent or empty', () => {
        expect(readList(new URLSearchParams('year=2025&kind=tv&year=2024'), 'year')).toEqual(['2025', '2024']);
        expect(readList(new URLSearchParams('year='), 'year')).toEqual([]);
        expect(readList(new URLSearchParams(''), 'year')).toEqual([]);
    });

    it('writes the values of a filter, and takes it out when it has none', () => {
        const params = new URLSearchParams('q=dune&year=2025');

        expect(writeList(params, 'year', ['2025', '2024']).toString()).toBe('q=dune&year=2025&year=2024');
        expect(writeList(params, 'year', []).toString()).toBe('q=dune');
        expect(params.toString()).toBe('q=dune&year=2025');
    });

    it('picks a value, or puts it back when it already was', () => {
        expect(toggled(['tv'], '2025')).toEqual(['tv', '2025']);
        expect(toggled(['tv', '2025'], 'tv')).toEqual(['2025']);
    });
});
