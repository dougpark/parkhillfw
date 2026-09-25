<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { DollarSign } from 'lucide-vue-next';
import ModalShell from '../components/ui/ModalShell.vue';

type ProductType = 'regular_annual' | 'pacesetter_annual' | 'security_annual' | 'security_quarterly';

interface Household {
  id: number;
  streetAddress: string;
  status: string;
}

interface Subscription {
  id: number;
  householdId: number;
  productType: ProductType;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface Payment {
  id: number;
  householdId: number;
  productType: ProductType;
  amountCents: number;
  source: 'stripe' | 'manual';
  paymentMethod: 'card' | 'check' | 'cash' | null;
  periodEnd: string | null;
  createdAt: string;
}

interface Row {
  household: Household;
  subscriptions: Subscription[];
  payments: Payment[];
}

const PRODUCT_LABELS: Record<ProductType, string> = {
  regular_annual: 'Regular Annual Dues',
  pacesetter_annual: 'Pacesetter Annual Dues',
  security_annual: 'Security Annual',
  security_quarterly: 'Security Quarterly',
};
const DUES_PRODUCTS: ProductType[] = ['regular_annual', 'pacesetter_annual'];
const SECURITY_PRODUCTS: ProductType[] = ['security_annual', 'security_quarterly'];

const rows = ref<Row[]>([]);
const isLoading = ref(true);
const error = ref('');

const manualPaymentRow = ref<Row | null>(null);
const manualForm = ref({ productType: 'regular_annual' as ProductType, amountDollars: '', paymentMethod: 'check' as 'check' | 'cash', periodStart: '', periodEnd: '', note: '' });
const isSavingManual = ref(false);
const manualError = ref('');

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function categoryStatus(row: Row, products: ProductType[]): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  const activeSub = row.subscriptions.find((sub) => products.includes(sub.productType) && sub.status === 'active');
  if (activeSub) {
    const suffix = activeSub.cancelAtPeriodEnd ? ' (canceling)' : '';
    return { label: `${PRODUCT_LABELS[activeSub.productType]} — active${suffix}${activeSub.currentPeriodEnd ? ` until ${formatDate(activeSub.currentPeriodEnd)}` : ''}`, tone: activeSub.cancelAtPeriodEnd ? 'warning' : 'success' };
  }
  const pastDueSub = row.subscriptions.find((sub) => products.includes(sub.productType) && sub.status === 'past_due');
  if (pastDueSub) return { label: `${PRODUCT_LABELS[pastDueSub.productType]} — past due`, tone: 'warning' };

  const relevantPayments = row.payments.filter((payment) => products.includes(payment.productType) && payment.periodEnd)
    .sort((left, right) => new Date(right.periodEnd!).getTime() - new Date(left.periodEnd!).getTime());
  const latestPayment = relevantPayments[0];
  if (latestPayment && new Date(latestPayment.periodEnd!).getTime() > Date.now()) {
    return { label: `${PRODUCT_LABELS[latestPayment.productType]} — paid through ${formatDate(latestPayment.periodEnd)}`, tone: 'success' };
  }
  return { label: 'Unpaid', tone: 'danger' };
}

const toneClass: Record<string, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  muted: 'bg-surface-subtle text-content-muted',
};

const sortedRows = computed(() => [...rows.value].sort((left, right) => left.household.streetAddress.localeCompare(right.household.streetAddress, undefined, { sensitivity: 'base' })));

async function loadRows() {
  isLoading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/admin/finance/dues');
    if (!response.ok) throw new Error('Unable to load dues status.');
    rows.value = await response.json();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load dues status.';
  } finally {
    isLoading.value = false;
  }
}

function openManualPayment(row: Row) {
  manualPaymentRow.value = row;
  manualForm.value = { productType: 'regular_annual', amountDollars: '', paymentMethod: 'check', periodStart: '', periodEnd: '', note: '' };
  manualError.value = '';
}

function closeManualPayment() {
  manualPaymentRow.value = null;
}

async function submitManualPayment() {
  if (!manualPaymentRow.value) return;
  const amountCents = Math.round(Number(manualForm.value.amountDollars) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    manualError.value = 'Enter a valid payment amount.';
    return;
  }
  isSavingManual.value = true;
  manualError.value = '';
  try {
    const response = await fetch('/api/admin/finance/dues/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdId: manualPaymentRow.value.household.id,
        productType: manualForm.value.productType,
        amountCents,
        paymentMethod: manualForm.value.paymentMethod,
        periodStart: manualForm.value.periodStart || undefined,
        periodEnd: manualForm.value.periodEnd || undefined,
        note: manualForm.value.note || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to record payment.');
    closeManualPayment();
    await loadRows();
  } catch (submitError) {
    manualError.value = submitError instanceof Error ? submitError.message : 'Unable to record payment.';
  } finally {
    isSavingManual.value = false;
  }
}

onMounted(loadRows);
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Dues &amp; Subscriptions</h2>
      <p class="mt-2 text-content-muted">Review household dues and security subscription status, and record manual (check/cash) payments.</p>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="isLoading" class="text-content-muted">Loading...</p>
    <p v-else-if="!sortedRows.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No households with billing activity yet.</p>

    <div v-for="row in sortedRows" :key="row.household.id" class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <h3 class="font-semibold text-content">{{ row.household.streetAddress }}</h3>
        <button type="button" class="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90" @click="openManualPayment(row)">
          <DollarSign class="h-4 w-4" /> Record Manual Payment
        </button>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-content-muted">Dues</p>
          <span class="mt-1 inline-flex rounded-full px-3 py-1 text-xs font-medium" :class="toneClass[categoryStatus(row, DUES_PRODUCTS).tone]">{{ categoryStatus(row, DUES_PRODUCTS).label }}</span>
        </div>
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-content-muted">Security</p>
          <span class="mt-1 inline-flex rounded-full px-3 py-1 text-xs font-medium" :class="toneClass[categoryStatus(row, SECURITY_PRODUCTS).tone]">{{ categoryStatus(row, SECURITY_PRODUCTS).label }}</span>
        </div>
      </div>
    </div>

    <ModalShell v-if="manualPaymentRow" title="Record Manual Payment" @close="closeManualPayment">
      <form class="space-y-4" @submit.prevent="submitManualPayment">
        <p class="text-sm text-content-muted">{{ manualPaymentRow.household.streetAddress }}</p>
        <p v-if="manualError" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ manualError }}</p>
        <div>
          <label class="mb-1 block text-sm font-medium text-content">Product</label>
          <select v-model="manualForm.productType" class="w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30">
            <option v-for="type in [...DUES_PRODUCTS, ...SECURITY_PRODUCTS]" :key="type" :value="type">{{ PRODUCT_LABELS[type] }}</option>
          </select>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-sm font-medium text-content">Amount ($)</label>
            <input v-model="manualForm.amountDollars" type="number" min="0" step="0.01" required class="w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-content">Method</label>
            <select v-model="manualForm.paymentMethod" class="w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="check">Check</option>
              <option value="cash">Cash</option>
            </select>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-sm font-medium text-content">Period start</label>
            <input v-model="manualForm.periodStart" type="date" class="w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-content">Period end</label>
            <input v-model="manualForm.periodEnd" type="date" class="w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-content">Note</label>
          <textarea v-model="manualForm.note" rows="2" class="w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"></textarea>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" class="rounded-full px-5 py-2.5 text-sm font-medium text-content-muted hover:bg-app-bg" @click="closeManualPayment">Cancel</button>
          <button type="submit" :disabled="isSavingManual" class="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">{{ isSavingManual ? 'Saving...' : 'Save Payment' }}</button>
        </div>
      </form>
    </ModalShell>
  </section>
</template>
