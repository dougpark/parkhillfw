import { describe, expect, test } from 'bun:test';
import type Stripe from 'stripe';
import type { AppBindings } from '../middleware/auth';
import {
    buildSubscriptionUpsertValues,
    chargeIdFromDispute,
    chargeIdsFromBalanceTransactions,
    disputeCloseStatus,
    extractChargeDetails,
    mapStripeSubscriptionStatus,
    refundStatusForCharge,
} from './stripe-webhooks';

const TEST_ENV = {
    STRIPE_PRICE_REGULAR_ANNUAL: 'price_regular',
    STRIPE_PRICE_PACESETTER_ANNUAL: 'price_pacesetter',
    STRIPE_PRICE_SECURITY_ANNUAL: 'price_security_annual',
    STRIPE_PRICE_SECURITY_QUARTERLY: 'price_security_quarterly',
} as unknown as AppBindings;

function fakeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
    return {
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { household_id: '95', product_type: 'regular_annual' },
        items: { data: [{ price: { id: 'price_regular' }, current_period_end: 1893456000 }] },
        ...overrides,
    } as unknown as Stripe.Subscription;
}

function fakeCharge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
    return {
        id: 'ch_123',
        amount: 15000,
        amount_refunded: 0,
        payment_method_details: { type: 'card' },
        balance_transaction: { fee: 465 },
        ...overrides,
    } as unknown as Stripe.Charge;
}

describe('mapStripeSubscriptionStatus', () => {
    test('maps active and trialing to active', () => {
        expect(mapStripeSubscriptionStatus('active')).toBe('active');
        expect(mapStripeSubscriptionStatus('trialing')).toBe('active');
    });
    test('maps past_due to past_due', () => {
        expect(mapStripeSubscriptionStatus('past_due')).toBe('past_due');
    });
    test('maps incomplete and incomplete_expired to incomplete', () => {
        expect(mapStripeSubscriptionStatus('incomplete')).toBe('incomplete');
        expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe('incomplete');
    });
    test('maps everything else (canceled, unpaid, paused) to canceled', () => {
        expect(mapStripeSubscriptionStatus('canceled')).toBe('canceled');
        expect(mapStripeSubscriptionStatus('unpaid')).toBe('canceled');
        expect(mapStripeSubscriptionStatus('paused')).toBe('canceled');
    });
});

describe('buildSubscriptionUpsertValues', () => {
    test('builds values from metadata.product_type when present', () => {
        const values = buildSubscriptionUpsertValues(fakeSubscription(), TEST_ENV);
        expect(values).toEqual({
            householdId: 95,
            productType: 'regular_annual',
            stripePriceId: 'price_regular',
            status: 'active',
            currentPeriodEnd: new Date(1893456000 * 1000),
            cancelAtPeriodEnd: false,
        });
    });

    test('falls back to price-id lookup when metadata.product_type is missing', () => {
        const subscription = fakeSubscription({
            metadata: { household_id: '95' },
            items: { data: [{ price: { id: 'price_security_quarterly' }, current_period_end: null }] },
        } as unknown as Partial<Stripe.Subscription>);
        const values = buildSubscriptionUpsertValues(subscription, TEST_ENV);
        expect(values?.productType).toBe('security_quarterly');
        expect(values?.currentPeriodEnd).toBeNull();
    });

    test('returns null when household_id metadata is missing or not an integer', () => {
        const subscription = fakeSubscription({ metadata: { product_type: 'regular_annual' } } as unknown as Partial<Stripe.Subscription>);
        expect(buildSubscriptionUpsertValues(subscription, TEST_ENV)).toBeNull();
    });

    test('returns null when there is no price on the subscription item', () => {
        const subscription = fakeSubscription({ items: { data: [{ price: null, current_period_end: null }] } } as unknown as Partial<Stripe.Subscription>);
        expect(buildSubscriptionUpsertValues(subscription, TEST_ENV)).toBeNull();
    });

    test('returns null when the price id does not match any known product and metadata is absent', () => {
        const subscription = fakeSubscription({
            metadata: { household_id: '95' },
            items: { data: [{ price: { id: 'price_unknown' }, current_period_end: null }] },
        } as unknown as Partial<Stripe.Subscription>);
        expect(buildSubscriptionUpsertValues(subscription, TEST_ENV)).toBeNull();
    });

    test('coerces cancel_at_period_end to a boolean', () => {
        const subscription = fakeSubscription({ cancel_at_period_end: true });
        expect(buildSubscriptionUpsertValues(subscription, TEST_ENV)?.cancelAtPeriodEnd).toBe(true);
    });
});

describe('extractChargeDetails', () => {
    test('returns all nulls for a missing charge', () => {
        expect(extractChargeDetails(null)).toEqual({ feeCents: null, chargeId: null, paymentMethodType: null });
        expect(extractChargeDetails(undefined)).toEqual({ feeCents: null, chargeId: null, paymentMethodType: null });
    });

    test('extracts fee, charge id, and payment method type from an expanded charge', () => {
        expect(extractChargeDetails(fakeCharge())).toEqual({ feeCents: 465, chargeId: 'ch_123', paymentMethodType: 'card' });
    });

    test('returns null fee when balance_transaction was not expanded (still a string id)', () => {
        const charge = fakeCharge({ balance_transaction: 'txn_123' } as unknown as Partial<Stripe.Charge>);
        expect(extractChargeDetails(charge)).toEqual({ feeCents: null, chargeId: 'ch_123', paymentMethodType: 'card' });
    });

    test('returns null payment method type when payment_method_details is absent', () => {
        const charge = fakeCharge({ payment_method_details: undefined } as unknown as Partial<Stripe.Charge>);
        expect(extractChargeDetails(charge).paymentMethodType).toBeNull();
    });
});

describe('chargeIdsFromBalanceTransactions', () => {
    test('keeps only charge sources (ch_...)', () => {
        const transactions = [
            { source: 'ch_1' },
            { source: 'txn_refund_adjustment' },
            { source: { id: 'ch_2' } },
            { source: null },
        ] as unknown as Stripe.BalanceTransaction[];
        expect(chargeIdsFromBalanceTransactions(transactions)).toEqual(['ch_1', 'ch_2']);
    });

    test('returns an empty array when there are no charge sources', () => {
        const transactions = [{ source: 'txn_1' }] as unknown as Stripe.BalanceTransaction[];
        expect(chargeIdsFromBalanceTransactions(transactions)).toEqual([]);
    });
});

describe('refundStatusForCharge', () => {
    test('returns refunded when the full amount was refunded', () => {
        expect(refundStatusForCharge(fakeCharge({ amount: 100, amount_refunded: 100 }))).toBe('refunded');
    });
    test('returns partially_refunded when only part of the amount was refunded', () => {
        expect(refundStatusForCharge(fakeCharge({ amount: 100, amount_refunded: 40 }))).toBe('partially_refunded');
    });
});

describe('chargeIdFromDispute + disputeCloseStatus', () => {
    test('chargeIdFromDispute reads a string charge reference', () => {
        const dispute = { charge: 'ch_123' } as unknown as Stripe.Dispute;
        expect(chargeIdFromDispute(dispute)).toBe('ch_123');
    });
    test('chargeIdFromDispute reads an expanded charge object reference', () => {
        const dispute = { charge: { id: 'ch_456' } } as unknown as Stripe.Dispute;
        expect(chargeIdFromDispute(dispute)).toBe('ch_456');
    });
    test('disputeCloseStatus reverts to succeeded only when the dispute was won', () => {
        expect(disputeCloseStatus({ status: 'won' } as unknown as Stripe.Dispute)).toBe('succeeded');
        expect(disputeCloseStatus({ status: 'lost' } as unknown as Stripe.Dispute)).toBeNull();
        expect(disputeCloseStatus({ status: 'warning_closed' } as unknown as Stripe.Dispute)).toBeNull();
    });
});
