// Shared dues/security product catalog — used by both the Worker backend and the
// Vue admin frontend, so it must not import the 'stripe' package (keeps it light
// enough to bundle into the client).
export type ProductType = 'regular_annual' | 'pacesetter_annual' | 'security_annual' | 'security_quarterly';
export type ProductCategory = 'dues' | 'security';

// Which category each product belongs to — a household may hold at most one active
// subscription per category (see the checkout route's mutual-exclusivity check).
export const PRODUCT_CATEGORY: Record<ProductType, ProductCategory> = {
    regular_annual: 'dues',
    pacesetter_annual: 'dues',
    security_annual: 'security',
    security_quarterly: 'security',
};

export const PRODUCT_LABELS: Record<ProductType, string> = {
    regular_annual: 'Regular Annual Dues',
    pacesetter_annual: 'Pacesetter Annual Dues',
    security_annual: 'Security Annual',
    security_quarterly: 'Security Quarterly',
};

// QuickBooks GL income account code per category, for accounting export line-item labeling.
export const INCOME_ACCOUNT_BY_CATEGORY: Record<ProductCategory, string> = {
    dues: '4000 - Annual Dues Revenue',
    security: '4100 - Security Patrol Dues',
};
