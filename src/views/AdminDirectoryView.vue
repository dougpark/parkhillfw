<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, Search } from 'lucide-vue-next';
import DirectoryEditView from './DirectoryEditView.vue';
import AdminArchiveAddressView from './AdminArchiveAddressView.vue';
import AdminHouseholdResetView from './AdminHouseholdResetView.vue';

interface HouseholdResult {
  id: number;
  streetAddress: string;
  status: 'active' | 'vacant' | 'archived';
  residents: Array<{ firstName: string; lastName: string; email: string | null }>;
}

const query = ref('');
const results = ref<HouseholdResult[]>([]);
const selectedId = ref<number | null>(null);
const isSearching = ref(false);
const error = ref('');
const address = ref('');
const addressNotice = ref('');
const isCreatingAddress = ref(false);
const showAdvanced = ref(false);

async function searchHouseholds() {
  isSearching.value = true;
  error.value = '';
  try {
    const response = await fetch(`/api/admin/households?q=${encodeURIComponent(query.value.trim())}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to search households.');
    results.value = data;
    selectedId.value = null;
  } catch (searchError) {
    error.value = searchError instanceof Error ? searchError.message : 'Unable to search households.';
  } finally {
    isSearching.value = false;
  }
}

async function createAddress() {
  isCreatingAddress.value = true;
  error.value = '';
  addressNotice.value = '';
  try {
    const response = await fetch('/api/admin/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streetAddress: address.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to create address.');
    addressNotice.value = `${data.household.streetAddress} was created as vacant.`;
    address.value = '';
    results.value = [];
    selectedId.value = null;
    query.value = '';
  } catch (createError) {
    error.value = createError instanceof Error ? createError.message : 'Unable to create address.';
  } finally {
    isCreatingAddress.value = false;
  }
}

</script>

<template>
  <section class="space-y-6">

    <!-- Directory Editing -->
    <div>
      <p class="text-sm font-medium uppercase tracking-wide text-accent">Directory editing</p>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Edit Household Directory</h2>
      <p class="mt-2 text-content-muted">Search by resident name or address, then edit the household, residents, and children.</p>
    </div>

    <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="searchHouseholds">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
        <input v-model="query" required class="w-full rounded-xl border border-theme-border bg-surface py-3 pl-10 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Search resident name or street address" />
      </div>
      <button type="submit" :disabled="isSearching" class="rounded-full bg-accent px-5 py-3 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">{{ isSearching ? 'Searching...' : 'Search' }}</button>
    </form>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>


    <div v-if="results.length && !selectedId" class="space-y-2">
      <button v-for="household in results" :key="household.id" type="button" class="w-full rounded-2xl border p-4 text-left transition-colors" :class="selectedId === household.id ? 'border-accent bg-accent/10' : 'border-theme-border bg-surface hover:border-accent'" @click="selectedId = household.id">
        <span class="flex items-center justify-between gap-3">
          <span class="font-medium">{{ household.streetAddress }}</span>
          <span class="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide" :class="household.status === 'active' ? 'bg-success-subtle text-success' : household.status === 'vacant' ? 'bg-warning-subtle text-warning' : 'bg-app-bg text-content-muted'">{{ household.status }}</span>
        </span>
        <span class="mt-1 block text-sm text-content-muted">{{ household.residents.map((resident) => `${resident.firstName} ${resident.lastName}`).join(', ') || 'No residents' }}</span>
      </button>
    </div>


    <DirectoryEditView v-if="selectedId" :key="selectedId" :admin-household-id="selectedId" />
<div class="mt-10 border-t border-theme-border pt-10">
          <AdminHouseholdResetView />
        </div>
    </section>

    <!-- Hidden Show Advanced Section -->
    <section class="border-t border-theme-border pt-8">
      <button type="button" class="inline-flex items-center gap-2 text-sm font-medium text-accent transition hover:text-accent" @click="showAdvanced = !showAdvanced">
        <span>{{ showAdvanced ? 'Hide advanced' : 'Show advanced' }}</span>
        <ChevronDown class="h-4 w-4 transition-transform" :class="showAdvanced ? 'rotate-180' : ''" />
      </button>

      <div v-if="showAdvanced" class="mt-6 space-y-8">

        <!-- Create new vacant property -->
        <section>
          <p class="text-sm font-medium uppercase tracking-wide text-accent">Property records</p>
          <h3 class="mt-1 text-xl font-semibold">Address Management</h3>
          <p class="mt-1 text-sm text-content-muted">Create a new vacant property. Use this action when a portion of an existing residential property has been sold off to create a new addressable lot.</p>
          <form class="mt-4 flex flex-col gap-3 sm:flex-row" @submit.prevent="createAddress">
            <label class="flex-1 text-sm font-medium">New address
              <input v-model="address" required class="mt-1 w-full rounded-xl border border-theme-border px-3 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" placeholder="Enter a new street address" />
            </label>
            <button type="submit" :disabled="isCreatingAddress" class="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">{{ isCreatingAddress ? 'Creating...' : 'Create vacant address' }}</button>
          </form>
          <p v-if="addressNotice" class="mt-4 rounded-xl bg-success-subtle p-3 text-sm text-success">{{ addressNotice }}</p>
        </section>

        <!-- Archive Address -->
        <div class="border-t border-theme-border pt-8">
          <AdminArchiveAddressView />
        </div>
      </div>
    </section>
  
</template>
