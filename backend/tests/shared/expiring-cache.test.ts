import { ExpiringCache } from 'src/shared/expiring-cache';
import { describe, expect, it } from 'vitest';

describe('ExpiringCache', () => {
    it('hands a value back as often as asked until it lapses', () => {
        const cache = new ExpiringCache<string>(1000);

        cache.set('movie:120', 'The Fellowship of the Ring', 0);

        expect(cache.get('movie:120', 10)).toBe('The Fellowship of the Ring');
        expect(cache.get('movie:120', 999)).toBe('The Fellowship of the Ring');
        expect(cache.get('movie:120', 1000)).toBeUndefined();
    });

    it('drops the oldest value past its capacity', () => {
        const cache = new ExpiringCache<number>(1000, 2);

        cache.set('first', 1, 0);
        cache.set('second', 2, 1);
        cache.set('third', 3, 2);

        expect(cache.get('first', 3)).toBeUndefined();
        expect(cache.get('second', 3)).toBe(2);
        expect(cache.get('third', 3)).toBe(3);
    });

    it('forgets everything when cleared', () => {
        const cache = new ExpiringCache<number>(1000);

        cache.set('first', 1, 0);
        cache.clear();

        expect(cache.get('first', 1)).toBeUndefined();
    });

    it('hands a value taken back once, and not once it lapsed', () => {
        const cache = new ExpiringCache<string>(1000);

        cache.set('challenge', 'authentication', 0);
        cache.set('code', 'S256', 0);

        expect(cache.take('challenge', 10)).toBe('authentication');
        expect(cache.take('challenge', 10)).toBeUndefined();
        expect(cache.take('code', 1000)).toBeUndefined();
        expect(cache.take('unknown', 10)).toBeUndefined();
    });
});
