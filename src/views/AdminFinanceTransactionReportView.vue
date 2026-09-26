<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Download } from 'lucide-vue-next';
import { PRODUCT_CATEGORY, PRODUCT_LABELS, type ProductCategory, type ProductType } from '../lib/product-catalog';

const emit = defineEmits<{ exit: [] }>();

interface TransactionRow {
  transactionDate: string;
  productType: ProductType;
  amountCents: number;
  feeCents: number;
  totalCents: number;
  streetAddress: string;
  primaryResidentName: string;
  householdCompositeId: string;
  incomeAccount: string;
  transactionId: string | null;
  payoutId: string | null;
  status: 'succeeded' | 'refunded' | 'partially_refunded' | 'disputed';
  paymentMethod: 'card' | 'us_bank_account' | 'check' | 'cash' | null;
  periodStart: string | null;
  periodEnd: string | null;
}

const CATEGORY_LABELS: Record<ProductCategory, string> = { dues: 'Dues', security: 'Security' };
const PAYMENT_METHOD_LABELS: Record<NonNullable<TransactionRow['paymentMethod']>, string> = {
  card: 'Card',
  us_bank_account: 'ACH',
  check: 'Check',
  cash: 'Cash',
};
const STATUS_LABELS: Record<TransactionRow['status'], string> = {
  succeeded: 'Succeeded',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
  disputed: 'Disputed',
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const today = new Date();
const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

const startDate = ref(isoDate(ninetyDaysAgo));
const endDate = ref(isoDate(today));
const category = ref<'all' | ProductCategory>('all');

const rows = ref<TransactionRow[]>([]);
const isLoading = ref(true);
const error = ref('');

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

const totals = computed(() => rows.value.reduce((acc, row) => ({
  amountCents: acc.amountCents + row.amountCents,
  feeCents: acc.feeCents + row.feeCents,
  totalCents: acc.totalCents + row.totalCents,
}), { amountCents: 0, feeCents: 0, totalCents: 0 }));

function setMonthRange() {
  const now = new Date();
  startDate.value = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  endDate.value = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function setQuarterRange() {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  startDate.value = isoDate(new Date(now.getFullYear(), quarterStartMonth, 1));
  endDate.value = isoDate(new Date(now.getFullYear(), quarterStartMonth + 3, 0));
}

function setYearRange() {
  const now = new Date();
  startDate.value = isoDate(new Date(now.getFullYear(), 0, 1));
  endDate.value = isoDate(new Date(now.getFullYear(), 11, 31));
}

async function loadRows() {
  isLoading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({ start: startDate.value, end: endDate.value });
    if (category.value !== 'all') params.set('category', category.value);
    const response = await fetch(`/api/admin/finance/transactions?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to load transactions.');
    rows.value = await response.json();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load transactions.';
  } finally {
    isLoading.value = false;
  }
}

function isoDateOnly(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function downloadCsv() {
  const header = [
    'Transaction_ID', 'Date', 'Customer_Name', 'Household_ID', 'Address', 'Income_Account',
    'Product_Category', 'Product_Description', 'Gross_Amount', 'Fee_Amount', 'Net_Amount',
    'Payment_Method', 'Payout_ID', 'Transaction Status', 'Coverage_Period',
  ];
  const lines = rows.value.map((row) => {
    const coveragePeriod = row.periodStart && row.periodEnd
      ? `${isoDateOnly(row.periodStart)} to ${isoDateOnly(row.periodEnd)}`
      : '';
    return [
      row.transactionId ?? '',
      isoDateOnly(row.transactionDate),
      row.primaryResidentName,
      row.householdCompositeId,
      row.streetAddress,
      row.incomeAccount,
      CATEGORY_LABELS[PRODUCT_CATEGORY[row.productType]],
      PRODUCT_LABELS[row.productType],
      (row.amountCents / 100).toFixed(2),
      (row.feeCents / 100).toFixed(2),
      (row.totalCents / 100).toFixed(2),
      row.paymentMethod ? PAYMENT_METHOD_LABELS[row.paymentMethod] : '',
      row.payoutId ?? '',
      STATUS_LABELS[row.status],
      coveragePeriod,
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',');
  });
  const csv = [header.join(','), ...lines].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transaction-report-${startDate.value}-to-${endDate.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

watch([startDate, endDate, category], loadRows);
onMounted(loadRows);
</script>

<template>
  <section class="space-y-6">
    <button
      type="button"
      class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
      @click="emit('exit')"
    >
      ← Admin menu
    </button>

    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Transaction Report</h2>
      <p class="mt-2 text-content-muted">Review dues and security payment transactions by date range and category.</p>
    </div>

    <div class="flex flex-wrap items-end gap-4 rounded-3xl border border-theme-border bg-surface p-6 shadow-sm">
      <div>
        <label class="mb-1 block text-sm font-medium text-content">Start date</label>
        <input v-model="startDate" type="date" class="h-10 rounded-xl border border-theme-border bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-content">End date</label>
        <input v-model="endDate" type="date" class="h-10 rounded-xl border border-theme-border bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
      <div class="flex h-10 items-center gap-2">
        <button type="button" class="rounded-full border border-theme-border px-3 text-xs font-medium text-content-muted transition-colors hover:bg-app-bg h-full" @click="setMonthRange">Month</button>
        <button type="button" class="rounded-full border border-theme-border px-3 text-xs font-medium text-content-muted transition-colors hover:bg-app-bg h-full" @click="setQuarterRange">Quarter</button>
        <button type="button" class="rounded-full border border-theme-border px-3 text-xs font-medium text-content-muted transition-colors hover:bg-app-bg h-full" @click="setYearRange">Year</button>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-content">Category</label>
        <select v-model="category" class="h-10 rounded-xl border border-theme-border bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30">
          <option value="all">All</option>
          <option value="dues">Dues</option>
          <option value="security">Security</option>
        </select>
      </div>
      <button type="button" :disabled="!rows.length" class="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60" @click="downloadCsv">
        <Download class="h-4 w-4" /> Download CSV
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="isLoading" class="text-content-muted">Loading...</p>
    <p v-else-if="!rows.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No transactions in this range.</p>

    <div v-else class="overflow-x-auto rounded-3xl border border-theme-border bg-surface shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-theme-border text-xs font-medium uppercase tracking-wide text-content-muted">
          <tr>
            <th class="px-4 py-3">Date</th>
            <th class="px-4 py-3">Category</th>
            <th class="px-4 py-3">Product</th>
            <th class="px-4 py-3">Amount Paid</th>
            <th class="px-4 py-3">Fees Paid</th>
            <th class="px-4 py-3">Net</th>
            <th class="px-4 py-3">Household Address</th>
            <th class="px-4 py-3">Primary Resident</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index" class="border-b border-theme-border last:border-0">
            <td class="px-4 py-3">{{ formatDate(row.transactionDate) }}</td>
            <td class="px-4 py-3">{{ CATEGORY_LABELS[PRODUCT_CATEGORY[row.productType]] }}</td>
            <td class="px-4 py-3">{{ PRODUCT_LABELS[row.productType] }}</td>
            <td class="px-4 py-3">{{ formatCents(row.amountCents) }}</td>
            <td class="px-4 py-3">{{ formatCents(row.feeCents) }}</td>
            <td class="px-4 py-3">{{ formatCents(row.totalCents) }}</td>
            <td class="px-4 py-3">{{ row.streetAddress }}</td>
            <td class="px-4 py-3">{{ row.primaryResidentName }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-theme-border font-semibold">
            <td colspan="3" class="px-4 py-3 text-right">Totals</td>
            <td class="px-4 py-3">{{ formatCents(totals.amountCents) }}</td>
            <td class="px-4 py-3">{{ formatCents(totals.feeCents) }}</td>
            <td class="px-4 py-3">{{ formatCents(totals.totalCents) }}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>
