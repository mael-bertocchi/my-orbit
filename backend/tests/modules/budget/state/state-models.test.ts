import { CategorySchema, OperationSchema, StateSchema } from 'src/modules/budget/state/state-models';
import { describe, expect, it } from 'vitest';

/**
 * @constant validCategory
 * @description A category as the client sends it
 */
const validCategory = {
    id: 'groceries',
    name: 'Groceries',
    symbol: 'cart',
    colorHex: 0x3ecf8e,
    monthlyLimit: 400
};

/**
 * @constant validOperation
 * @description An operation as the client sends it
 */
const validOperation = {
    id: '5f1b2c3d-4e5f-4a1b-8c2d-3e4f5a6b7c8d',
    date: '2026-07-24T18:00:00.000Z',
    name: 'Whole Foods',
    categoryId: 'groceries',
    location: 'Berlin Mitte',
    amount: 54.2,
    currencyCode: 'USD',
    rateToEuro: 0.9207,
    isOnline: false
};

describe('CategorySchema', () => {
    it('accepts a valid category', () => {
        expect(CategorySchema.safeParse(validCategory).success).toBe(true);
    });

    it('rejects a colour outside the 0xRRGGBB range', () => {
        expect(CategorySchema.safeParse({ ...validCategory, colorHex: 0x1000000 }).success).toBe(false);
    });
});

describe('OperationSchema', () => {
    it('accepts an operation and coerces its date', () => {
        const parsed = OperationSchema.safeParse(validOperation);

        expect(parsed.success).toBe(true);
        expect(parsed.data?.date).toBeInstanceOf(Date);
    });

    it('accepts a null location', () => {
        expect(OperationSchema.safeParse({ ...validOperation, location: null }).success).toBe(true);
    });

    it('accepts an operation with or without a description', () => {
        expect(OperationSchema.safeParse({ ...validOperation, description: 'Weekly groceries' }).success).toBe(true);
        expect(OperationSchema.safeParse({ ...validOperation, description: null }).success).toBe(true);
        expect(OperationSchema.safeParse(validOperation).success).toBe(true);
    });

    it('rejects a description longer than 500 characters', () => {
        expect(OperationSchema.safeParse({ ...validOperation, description: 'x'.repeat(501) }).success).toBe(false);
    });

    it('defaults isOnline when an older client omits it', () => {
        const { isOnline: _isOnline, ...withoutFlag } = validOperation;
        const parsed = OperationSchema.safeParse(withoutFlag);

        expect(parsed.success).toBe(true);
        expect(parsed.data?.isOnline).toBe(false);
    });

    it('rejects a negative amount', () => {
        expect(OperationSchema.safeParse({ ...validOperation, amount: -1 }).success).toBe(false);
    });
});

describe('StateSchema', () => {
    it('accepts a complete budget document', () => {
        const state = {
            categories: [validCategory],
            operations: [validOperation],
            budget: { monthlyLimit: 3000 },
            budgetHistory: {
                '2026-07': { monthlyLimit: 2800, categoryLimits: { groceries: 380 } }
            }
        };

        expect(StateSchema.safeParse(state).success).toBe(true);
    });

    it('rejects a document with a missing collection', () => {
        const state = {
            categories: [validCategory],
            budget: { monthlyLimit: 3000 },
            budgetHistory: {}
        };

        expect(StateSchema.safeParse(state).success).toBe(false);
    });
});
