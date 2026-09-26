import { describe, expect, test } from 'bun:test';
import { INCOME_ACCOUNT_BY_CATEGORY, PRODUCT_CATEGORY, PRODUCT_LABELS, type ProductType } from './product-catalog';

const ALL_PRODUCT_TYPES: ProductType[] = ['regular_annual', 'pacesetter_annual', 'security_annual', 'security_quarterly'];

describe('product catalog completeness', () => {
    test('every product type has a category', () => {
        for (const type of ALL_PRODUCT_TYPES) expect(PRODUCT_CATEGORY[type]).toBeDefined();
    });

    test('every product type has a display label', () => {
        for (const type of ALL_PRODUCT_TYPES) expect(PRODUCT_LABELS[type]).toBeTruthy();
    });

    test('every category referenced by a product type has a QuickBooks GL income account', () => {
        for (const type of ALL_PRODUCT_TYPES) expect(INCOME_ACCOUNT_BY_CATEGORY[PRODUCT_CATEGORY[type]]).toBeTruthy();
    });

    test('dues and security products map to distinct categories', () => {
        expect(PRODUCT_CATEGORY.regular_annual).toBe('dues');
        expect(PRODUCT_CATEGORY.pacesetter_annual).toBe('dues');
        expect(PRODUCT_CATEGORY.security_annual).toBe('security');
        expect(PRODUCT_CATEGORY.security_quarterly).toBe('security');
    });
});
