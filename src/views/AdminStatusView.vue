<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Baby, CheckCircle2, Home, Inbox, MailPlus, Users } from 'lucide-vue-next';

interface AdminStatus {
  households: number;
  verifiedHouseholds: number;
  adultResidents: number;
  children: number;
  loginAccounts: number;
  aliasLogins: number;
  openAccessRequests: number;
}

const status = ref<AdminStatus | null>(null);
const isLoading = ref(true);
const error = ref('');

const rows = computed(() => [
  { label: 'Open Access Requests', value: status.value?.openAccessRequests ?? 0, icon: Inbox },
  { label: 'Households', value: status.value?.households ?? 0, icon: Home },
  { label: 'Verified Households (6 mo)', value: status.value?.verifiedHouseholds ?? 0, icon: CheckCircle2 },
  { label: 'Adult residents', value: status.value?.adultResidents ?? 0, icon: Users },
  { label: 'Children', value: status.value?.children ?? 0, icon: Baby },
  { label: 'Login accounts', value: status.value?.loginAccounts ?? 0, icon: Users },
  { label: 'Alias alternate logins', value: status.value?.aliasLogins ?? 0, icon: MailPlus },
]);

async function loadStatus() {
  isLoading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/admin/status');
    if (!response.ok) throw new Error('Unable to load admin status.');
    status.value = await response.json();
  } catch (statusError) {
    error.value = statusError instanceof Error ? statusError.message : 'Unable to load admin status.';
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadStatus);
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-medium uppercase tracking-wide text-accent">Admin overview</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Status</h2>
        <p class="mt-2 text-content-muted">Current database counts for directory, login, and request activity.</p>
      </div>
      <button
        type="button"
        class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:border-accent hover:text-accent"
        :disabled="isLoading"
        @click="loadStatus"
      >
        Refresh
      </button>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="isLoading" class="py-10 text-center text-content-muted">Loading status...</p>

    <div v-else class="overflow-hidden rounded-3xl border border-theme-border bg-surface shadow-sm">
      <div
        v-for="row in rows"
        :key="row.label"
        class="flex items-center justify-between gap-4 border-b border-theme-border px-5 py-4 last:border-b-0 sm:px-6"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <component :is="row.icon" class="h-5 w-5" />
          </span>
          <span class="min-w-0 text-sm font-medium text-content sm:text-base">{{ row.label }}</span>
        </div>
        <strong class="text-2xl font-semibold tabular-nums text-content">{{ row.value.toLocaleString() }}</strong>
      </div>
    </div>
  </section>
</template>