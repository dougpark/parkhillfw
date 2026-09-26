<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CheckCircle2, ExternalLink, Shield, ShieldAlert } from 'lucide-vue-next';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';

type ProductType = 'regular_annual' | 'pacesetter_annual' | 'security_annual' | 'security_quarterly';

interface Subscription {
  id: number;
  productType: ProductType;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface Payment {
  id: number;
  productType: ProductType;
  amountCents: number;
  periodEnd: string | null;
  createdAt: string;
}

interface Plan {
  productType: ProductType;
  label: string;
  priceLabel: string;
}

const DUES_PLANS: Plan[] = [
  { productType: 'regular_annual', label: 'Regular Annual Dues', priceLabel: '$150 / year' },
  { productType: 'pacesetter_annual', label: 'Pacesetter Annual Dues', priceLabel: '$500 / year' },
];
const SECURITY_PLANS: Plan[] = [
  { productType: 'security_annual', label: 'Security — Annual', priceLabel: '$1,000 / year' },
  { productType: 'security_quarterly', label: 'Security — Quarterly', priceLabel: '$250 / quarter' },
];

const hasBillingAccount = ref(false);
const subscriptions = ref<Subscription[]>([]);
const payments = ref<Payment[]>([]);
const isLoading = ref(true);
const error = ref('');
const notice = ref('');
const pendingProductType = ref<ProductType | null>(null);
const isOpeningPortal = ref(false);

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function activeSubscriptionFor(products: ProductType[]) {
  return subscriptions.value.find((sub) => products.includes(sub.productType) && (sub.status === 'active' || sub.status === 'past_due')) ?? null;
}

function categoryHasActive(products: ProductType[]) {
  return Boolean(activeSubscriptionFor(products));
}

const duesHasActive = computed(() => categoryHasActive(DUES_PLANS.map((plan) => plan.productType)));
const securityHasActive = computed(() => categoryHasActive(SECURITY_PLANS.map((plan) => plan.productType)));

async function loadStatus() {
  isLoading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/dues/status');
    if (!response.ok) throw new Error('Unable to load dues status.');
    const data = await response.json();
    hasBillingAccount.value = data.hasBillingAccount;
    subscriptions.value = data.subscriptions;
    payments.value = data.payments;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load dues status.';
  } finally {
    isLoading.value = false;
  }
}

async function subscribe(productType: ProductType) {
  pendingProductType.value = productType;
  error.value = '';
  try {
    const response = await fetch('/api/dues/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productType }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to start checkout.');
    window.location.href = data.url;
  } catch (subscribeError) {
    error.value = subscribeError instanceof Error ? subscribeError.message : 'Unable to start checkout.';
    pendingProductType.value = null;
  }
}

async function openBillingPortal() {
  isOpeningPortal.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/dues/portal', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to open billing portal.');
    window.location.href = data.url;
  } catch (portalError) {
    error.value = portalError instanceof Error ? portalError.message : 'Unable to open billing portal.';
    isOpeningPortal.value = false;
  }
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') notice.value = 'Thanks! Your payment is being processed and this page will update shortly.';
  else if (params.get('checkout') === 'canceled') notice.value = 'Checkout was canceled.';
  await loadStatus();
});
</script>

<template>
  <section class="mx-auto max-w-3xl space-y-8">
    <BreadcrumbNav current="Pay Dues" />

    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Pay Dues</h2>
      <p class="mt-2 text-content-muted">Subscribe to annual dues and neighborhood security, or manage your existing billing.</p>
    </div>

    <p v-if="notice" class="rounded-xl bg-success-subtle p-3 text-sm text-success">{{ notice }}</p>
    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="isLoading" class="text-content-muted">Loading...</p>

    <template v-else>
      <div class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm">
        <div class="flex items-center gap-3">
          <CheckCircle2 class="h-6 w-6 text-accent" />
          <h3 class="text-lg font-semibold text-content">Dues</h3>
        </div>
        <p v-if="duesHasActive" class="mt-3 text-sm text-content-muted">
          Active: {{ activeSubscriptionFor(DUES_PLANS.map((plan) => plan.productType))?.currentPeriodEnd ? `renews ${formatDate(activeSubscriptionFor(DUES_PLANS.map((plan) => plan.productType))!.currentPeriodEnd)}` : 'subscription active' }}
        </p>
        <p v-else class="mt-3 text-sm text-content-muted">No active dues subscription.</p>
        <div v-if="!duesHasActive" class="mt-4 grid gap-3 sm:grid-cols-2">
          <div v-for="plan in DUES_PLANS" :key="plan.productType" class="rounded-2xl border border-theme-border p-4">
            <p class="font-medium text-content">{{ plan.label }}</p>
            <p class="text-sm text-content-muted">{{ plan.priceLabel }}</p>
            <button
              type="button"
              :disabled="pendingProductType === plan.productType"
              class="mt-3 w-full rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60"
              @click="subscribe(plan.productType)"
            >
              {{ pendingProductType === plan.productType ? 'Starting checkout...' : 'Subscribe' }}
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm">
        <div class="flex items-center gap-3">
          <Shield class="h-6 w-6 text-accent" />
          <h3 class="text-lg font-semibold text-content">Security</h3>
        </div>
        <p v-if="securityHasActive" class="mt-3 text-sm text-content-muted">
          Active: {{ activeSubscriptionFor(SECURITY_PLANS.map((plan) => plan.productType))?.currentPeriodEnd ? `renews ${formatDate(activeSubscriptionFor(SECURITY_PLANS.map((plan) => plan.productType))!.currentPeriodEnd)}` : 'subscription active' }}
        </p>
        <p v-else class="mt-3 flex items-center gap-2 text-sm text-content-muted"><ShieldAlert class="h-4 w-4" /> No active security subscription.</p>
        <div v-if="!securityHasActive" class="mt-4 grid gap-3 sm:grid-cols-2">
          <div v-for="plan in SECURITY_PLANS" :key="plan.productType" class="rounded-2xl border border-theme-border p-4">
            <p class="font-medium text-content">{{ plan.label }}</p>
            <p class="text-sm text-content-muted">{{ plan.priceLabel }}</p>
            <button
              type="button"
              :disabled="pendingProductType === plan.productType"
              class="mt-3 w-full rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60"
              @click="subscribe(plan.productType)"
            >
              {{ pendingProductType === plan.productType ? 'Starting checkout...' : 'Subscribe' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="hasBillingAccount" class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-content">Manage Billing</h3>
        <p class="mt-2 text-sm text-content-muted">Update your payment method, view invoices, or cancel a subscription via Stripe's secure billing portal.</p>
        <button
          type="button"
          :disabled="isOpeningPortal"
          class="mt-4 inline-flex items-center gap-2 rounded-full border border-accent px-5 py-2.5 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-60"
          @click="openBillingPortal"
        >
          <ExternalLink class="h-4 w-4" /> {{ isOpeningPortal ? 'Opening...' : 'Manage Billing' }}
        </button>
      </div>

      <div v-if="payments.length" class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-content">Payment History</h3>
        <ul class="mt-3 divide-y divide-theme-border">
          <li v-for="payment in payments" :key="payment.id" class="flex items-center justify-between py-2 text-sm">
            <span class="text-content">{{ formatDate(payment.createdAt) }} — {{ payment.productType.replaceAll('_', ' ') }}</span>
            <span class="font-medium text-content">${{ (payment.amountCents / 100).toFixed(2) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
