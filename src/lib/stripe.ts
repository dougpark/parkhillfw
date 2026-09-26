import Stripe from 'stripe';
import type { AppBindings } from '../middleware/auth';

export type { ProductType, ProductCategory } from './product-catalog';
export { PRODUCT_CATEGORY, PRODUCT_LABELS, INCOME_ACCOUNT_BY_CATEGORY } from './product-catalog';
import type { ProductType } from './product-catalog';

export function priceIdForProduct(env: AppBindings, productType: ProductType): string {
    switch (productType) {
        case 'regular_annual': return env.STRIPE_PRICE_REGULAR_ANNUAL;
        case 'pacesetter_annual': return env.STRIPE_PRICE_PACESETTER_ANNUAL;
        case 'security_annual': return env.STRIPE_PRICE_SECURITY_ANNUAL;
        case 'security_quarterly': return env.STRIPE_PRICE_SECURITY_QUARTERLY;
    }
}

export function productTypeForPriceId(env: AppBindings, priceId: string): ProductType | null {
    const entries: [ProductType, string][] = [
        ['regular_annual', env.STRIPE_PRICE_REGULAR_ANNUAL],
        ['pacesetter_annual', env.STRIPE_PRICE_PACESETTER_ANNUAL],
        ['security_annual', env.STRIPE_PRICE_SECURITY_ANNUAL],
        ['security_quarterly', env.STRIPE_PRICE_SECURITY_QUARTERLY],
    ];
    return entries.find(([, id]) => id === priceId)?.[0] ?? null;
}

// Fetch-based HTTP client keeps this Workers-compatible (no Node APIs); API version is
// pinned explicitly per Stripe's integration best practices rather than floating.
export function getStripe(env: AppBindings): Stripe {
    return new Stripe(env.STRIPE_SECRET_KEY, {
        httpClient: Stripe.createFetchHttpClient(),
        apiVersion: '2026-08-26.dahlia',
    });
}
