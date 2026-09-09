<script setup lang="ts">
import { ref } from 'vue';
import { Search, ShieldAlert } from 'lucide-vue-next';

interface HouseholdResult {
  id: number;
  streetAddress: string;
  status: 'active' | 'vacant' | 'archived';
  residents: Array<{ firstName: string; lastName: string; email: string | null }>;
}

const query = ref('');
const results = ref<HouseholdResult[]>([]);
const selected = ref<HouseholdResult | null>(null);
const confirmation = ref('');
const reason = ref('');
const isSearching = ref(false);
const isArchiving = ref(false);
const error = ref('');
const notice = ref('');

async function searchHouseholds() {
  isSearching.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await fetch(`/api/admin/households?q=${encodeURIComponent(query.value.trim())}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to search households.');
    results.value = data;
    selected.value = null;
    confirmation.value = '';
  } catch (searchError) {
    error.value = searchError instanceof Error ? searchError.message : 'Unable to search households.';
  } finally {
    isSearching.value = false;
  }
}

async function archiveSelected() {
  if (!selected.value || selected.value.status !== 'vacant') return;
  isArchiving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await fetch(`/api/admin/households/${selected.value.id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: confirmation.value, reason: reason.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to archive address.');
    notice.value = `${data.streetAddress} was archived.`;
    results.value = results.value.filter((item) => item.id !== selected.value?.id);
    selected.value = null;
    confirmation.value = '';
    reason.value = '';
  } catch (archiveError) {
    error.value = archiveError instanceof Error ? archiveError.message : 'Unable to archive address.';
  } finally {
    isArchiving.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <p class="text-sm font-medium uppercase tracking-wide text-accent">Property records</p>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Archive an Address</h2>
      <p class="mt-2 text-content-muted">Search for an address to confirm the household is vacant, then archive the entry to preserve historical records. Use this option when a residential structure has been removed or consolidated into an adjacent property.</p>
    </div>

    <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="searchHouseholds">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
        <input v-model="query" required class="w-full rounded-xl border border-theme-border bg-surface py-3 pl-10 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Search street address" />
      </div>
      <button type="submit" :disabled="isSearching" class="rounded-full bg-accent px-5 py-3 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">{{ isSearching ? 'Searching...' : 'Search addresses' }}</button>
    </form>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="notice" class="rounded-xl bg-success-subtle p-3 text-sm text-success">{{ notice }}</p>

    <div v-if="results.length" class="space-y-2">
      <button v-for="household in results" :key="household.id" type="button" class="w-full rounded-2xl border p-4 text-left transition-colors" :class="selected?.id === household.id ? 'border-accent bg-accent/10' : 'border-theme-border bg-surface hover:border-accent'" @click="selected = household; confirmation = ''; reason = ''">
        <span class="flex items-center justify-between gap-3">
          <span class="font-medium">{{ household.streetAddress }}</span>
          <span class="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide" :class="household.status === 'vacant' ? 'bg-warning-subtle text-warning' : household.status === 'active' ? 'bg-success-subtle text-success' : 'bg-app-bg text-content-muted'">{{ household.status }}</span>
        </span>
        <span class="mt-1 block text-sm text-content-muted">{{ household.residents.map((resident) => `${resident.firstName} ${resident.lastName}`).join(', ') || 'No residents' }}</span>
      </button>
    </div>

    <section v-if="selected" class="rounded-3xl border border-danger-border bg-danger-subtle p-5 sm:p-6">
      <div class="flex items-start gap-3">
        <ShieldAlert class="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div>
          <h3 class="font-semibold text-danger">Archive {{ selected.streetAddress }}?</h3>
          <p v-if="selected.status !== 'vacant'" class="mt-2 text-sm text-danger">This address is currently {{ selected.status }}. Mark it vacant before archiving.</p>
          <template v-else>
            <p class="mt-2 text-sm text-danger">The address will leave the normal directory but remain available for historical records.</p>
            <input v-model="reason" class="mt-4 w-full rounded-xl border border-theme-border bg-surface px-3 py-2.5 text-sm" placeholder="Archive reason (optional)" />
            <label class="mt-3 block text-sm font-medium text-content">Confirmation address
              <input v-model="confirmation" class="mt-1 w-full rounded-xl border border-theme-border bg-surface px-3 py-2.5 text-sm focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30" placeholder="Type the selected address to confirm" />
            </label>
            <button type="button" :disabled="isArchiving || confirmation.trim() !== selected.streetAddress" class="mt-4 rounded-full bg-danger px-5 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" @click="archiveSelected">{{ isArchiving ? 'Archiving...' : 'Archive address' }}</button>
          </template>
        </div>
      </div>
    </section>
  </section>
</template>
