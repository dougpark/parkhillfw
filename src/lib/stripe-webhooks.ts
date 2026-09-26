import type Stripe from 'stripe';
import { productTypeForPriceId } from './stripe';
import { PRODUCT_CATEGORY, type ProductType } from './product-catalog';
import type { AppBindings } from '../middleware/auth';

// Pure decision logic extracted from the /api/webhooks/stripe handler so it can be unit
// tested without mocking the Stripe SDK or D1 — the route in src/index.ts wires these back
// to actual DB reads/writes.

export type LocalSubscriptionStatus = 'active' | 'past_due' | 'incomplete' | 'canceled';

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): LocalSubscriptionStatus {
    if (status === 'active' || status === 'trialing') return 'active';
    if (status === 'past_due') return 'past_due';
    if (status === 'incomplete' || status === 'incomplete_expired') return 'incomplete';
    return 'canceled';
}

export interface SubscriptionUpsertValues {
    householdId: number;
    productType: ProductType;
    stripePriceId: string;
    status: LocalSubscriptionStatus;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
}

// Returns null when required metadata/price info is missing, so the caller can skip the
// upsert instead of writing a half-populated row.
export function buildSubscriptionUpsertValues(subscription: Stripe.Subscription, env: AppBindings): SubscriptionUpsertValues | null {
    const item = subscription.items.data[0];
    const priceId = item?.price?.id;
    const metadataProductType = subscription.metadata?.product_type as ProductType | undefined;
    const productType = (metadataProductType && metadataProductType in PRODUCT_CATEGORY)
        ? metadataProductType
        : (priceId ? productTypeForPriceId(env, priceId) : null);
    const householdId = Number(subscription.metadata?.household_id);
    if (!productType || !priceId || !Number.isInteger(householdId)) return null;

    return {
        householdId,
        productType,
        stripePriceId: priceId,
        status: mapStripeSubscriptionStatus(subscription.status),
        currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    };
}

export interface ChargeDetails {
    feeCents: number | null;
    chargeId: string | null;
    paymentMethodType: string | null;
}

// Pulls fee/charge id/payment method off an already-resolved Charge (post balance_transaction expand).
export function extractChargeDetails(charge: Stripe.Charge | null | undefined): ChargeDetails {
    if (!charge) return { feeCents: null, chargeId: null, paymentMethodType: null };
    const balanceTransaction = charge.balance_transaction;
    const feeCents = balanceTransaction && typeof balanceTransaction !== 'string' ? balanceTransaction.fee : null;
    return { feeCents, chargeId: charge.id, paymentMethodType: charge.payment_method_details?.type ?? null };
}

// Only match balance transactions whose source is a Charge (ch_...) — a payout can also
// include refund/adjustment lines that aren't a charge we recorded a payment for.
export function chargeIdsFromBalanceTransactions(transactions: Stripe.BalanceTransaction[]): string[] {
    return transactions
        .map((transaction) => (typeof transaction.source === 'string' ? transaction.source : transaction.source?.id))
        .filter((id): id is string => Boolean(id?.startsWith('ch_')));
}

export function refundStatusForCharge(charge: Stripe.Charge): 'refunded' | 'partially_refunded' {
    return charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded';
}

export function chargeIdFromDispute(dispute: Stripe.Dispute): string {
    return typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
}

// Only a "won" dispute reverts the payment back to succeeded; lost/other outcomes stay disputed.
export function disputeCloseStatus(dispute: Stripe.Dispute): 'succeeded' | null {
    return dispute.status === 'won' ? 'succeeded' : null;
}
