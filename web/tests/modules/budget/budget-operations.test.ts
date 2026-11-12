import { amountInputOf, deleteOperation, groupAmountInput, parseAmountInput, sanitizeAmountInput, toOperation, upsertOperation } from 'modules/budget/budget-operations';
import { chooseLanguage } from 'modules/language/language-service';
import { describe, expect, it } from 'vitest';

import { document, NOW, operation } from '../../support/fixtures';

describe('amount field', () => {
    it('keeps digits, one separator and two decimals', () => {
        expect(sanitizeAmountInput('12.345')).toBe('12.34');
        expect(sanitizeAmountInput('1.2.3')).toBe('1.23');
        expect(sanitizeAmountInput('abc4')).toBe('4');
        expect(sanitizeAmountInput('007')).toBe('7');
        expect(sanitizeAmountInput('.5')).toBe('0.5');
    });

    it('reads a comma followed by up to two digits as the decimal separator', () => {
        expect(sanitizeAmountInput('12,')).toBe('12.');
        expect(sanitizeAmountInput('12,50')).toBe('12.50');
        expect(sanitizeAmountInput('1,234')).toBe('1234');
    });

    it('stops at eight digits', () => {
        expect(sanitizeAmountInput('1234567890')).toBe('12345678');
    });

    it('groups thousands while typing', () => {
        expect(groupAmountInput('1234567.5')).toBe('1,234,567.5');
        expect(groupAmountInput(sanitizeAmountInput('1,234,567'))).toBe('1,234,567');
    });

    it('reads the field, refusing zero', () => {
        expect(parseAmountInput('1,234.50')).toBe(1234.5);
        expect(parseAmountInput('0')).toBeNull();
        expect(parseAmountInput('')).toBeNull();
    });

    it('prefills an amount', () => {
        expect(amountInputOf(1200)).toBe('1,200');
        expect(amountInputOf(12.5)).toBe('12.50');
    });
});

describe('amount field in French', () => {
    it('reads a comma or a dot as the decimal separator and ignores the spaced thousands', () => {
        chooseLanguage('fr');

        expect(sanitizeAmountInput('12,')).toBe('12.');
        expect(sanitizeAmountInput('12,5')).toBe('12.5');
        expect(sanitizeAmountInput('12.5')).toBe('12.5');
        expect(sanitizeAmountInput('1\u00a0234,567')).toBe('1234.56');
        expect(parseAmountInput('1\u00a0234,50')).toBe(1234.5);
    });

    it('groups and prefills the French way', () => {
        chooseLanguage('fr');

        expect(groupAmountInput('1234567.5')).toBe('1\u00a0234\u00a0567,5');
        expect(groupAmountInput(sanitizeAmountInput('1234,')).toString()).toBe('1\u00a0234,');
        expect(amountInputOf(12.5)).toBe('12,50');
        expect(amountInputOf(1200)).toBe('1\u00a0200');
    });
});

describe('operations', () => {
    const draft = { name: ' Lidl ', description: ' ', amount: 12, currencyCode: 'EUR', categoryId: 'groceries', date: new Date(2026, 8, 27, 15, 30, 12, 345), location: 'Berlin', place: { id: 'R62422', nameEn: 'Berlin', nameFr: 'Berlin' }, isOnline: true };

    it('builds an operation the way the app stores one', () => {
        const built = toOperation(draft, 0.5);

        expect(built.id).toMatch(/^[0-9A-F-]{36}$/);
        expect(built.name).toBe('Lidl');
        expect(built.description).toBeNull();
        expect(built.location).toBeNull();
        expect(built.placeId).toBeNull();
        expect(built.rateToEuro).toBe(1);
        expect(built.date.getMilliseconds()).toBe(0);
    });

    it('adds, replaces and removes operations', () => {
        const existing = operation({ id: 'A', date: NOW, amount: 5 });
        const budget = document([existing]);

        expect(upsertOperation(budget, { ...existing, amount: 7 }).operations).toEqual([{ ...existing, amount: 7 }]);
        expect(upsertOperation(budget, operation({ id: 'B', date: NOW })).operations).toHaveLength(2);
        expect(deleteOperation(budget, 'A').operations).toHaveLength(0);
    });
});
