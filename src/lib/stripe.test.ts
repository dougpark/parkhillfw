import { describe, expect, test } from 'bun:test';
import type { AppBindings } from '../middleware/auth';
import { priceIdForProduct, productTypeForPriceId, type ProductType } from './stripe';

const TEST_ENV = {
    STRIPE_PRICE_REGULAR_ANNUAL: 'price_regular',
    STRIPE_PRICE_PACESETTER_ANNUAL: 'price_pacesetter',
    STRIPE_PRICE_SECURITY_ANNUAL: 'price_security_annual',
    STRIPE_PRICE_SECURITY_QUARTERLY: 'price_security_quarterly',
} as unknown as AppBindings;

const ALL_PRODUCT_TYPES: ProductType[] = ['regular_annual', 'pacesetter_annual', 'security_annual', 'security_quarterly'];

describe('priceIdForProduct + productTypeForPriceId', () => {
    test('round-trips every product type through its price id', () => {
        for (const productType of ALL_PRODUCT_TYPES) {
            const priceId = priceIdForProduct(TEST_ENV, productType);
            expect(productTypeForPriceId(TEST_ENV, priceId)).toBe(productType);
        }
    });

    test('returns null for an unknown price id instead of throwing', () => {
        expect(productTypeForPriceId(TEST_ENV, 'price_does_not_exist')).toBeNull();
    });
});
