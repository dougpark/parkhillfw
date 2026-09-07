<script setup lang="ts">
import { ref } from 'vue';
import { Search } from 'lucide-vue-next';
import DirectoryEditView from './DirectoryEditView.vue';

interface HouseholdResult {
  id: number;
  streetAddress: string;
  residents: Array<{ firstName: string; lastName: string; email: string | null }>;
}

const query = ref('');
const results = ref<HouseholdResult[]>([]);
const selectedId = ref<number | null>(null);
const isSearching = ref(false);
const error = ref('');

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
</script>

<template>
  <section class="space-y-6">
    <div>
      <p class="text-sm font-medium uppercase tracking-wide text-[#1a73e8]">Directory editing</p>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Edit household directory entry</h2>
      <p class="mt-2 text-[#444746]">Search by resident name or address, then edit the household, residents, and children.</p>
    </div>

    <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="searchHouseholds">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#444746]" />
        <input v-model="query" required class="w-full rounded-xl border border-[#e1e3e1] bg-white py-3 pl-10 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30" placeholder="Search resident name or street address" />
      </div>
      <button type="submit" :disabled="isSearching" class="rounded-full bg-[#1a73e8] px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{{ isSearching ? 'Searching...' : 'Search' }}</button>
    </form>

    <p v-if="error" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <div v-if="results.length" class="space-y-2">
      <button v-for="household in results" :key="household.id" type="button" class="w-full rounded-2xl border p-4 text-left transition-colors" :class="selectedId === household.id ? 'border-[#1a73e8] bg-[#e8f0fe]' : 'border-[#e1e3e1] bg-white hover:border-[#1a73e8]'" @click="selectedId = household.id">
        <span class="block font-medium">{{ household.streetAddress }}</span>
        <span class="mt-1 block text-sm text-[#444746]">{{ household.residents.map((resident) => `${resident.firstName} ${resident.lastName}`).join(', ') || 'No residents' }}</span>
      </button>
    </div>

    <DirectoryEditView v-if="selectedId" :key="selectedId" :admin-household-id="selectedId" />
  </section>
</template>
