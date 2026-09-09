<script setup lang="ts">
import { ref } from 'vue';
import { Search, ShieldAlert, Trash2 } from 'lucide-vue-next';

interface HouseholdResult {
  id: number;
  streetAddress: string;
  residents: Array<{ id: number; firstName: string; lastName: string; email: string | null }>;
  children: Array<{ id: number; name: string }>;
}

const query = ref('');
const results = ref<HouseholdResult[]>([]);
const selected = ref<HouseholdResult | null>(null);
const confirmation = ref('');
const isSearching = ref(false);
const isClearing = ref(false);
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

function selectHousehold(household: HouseholdResult) {
  selected.value = household;
  confirmation.value = '';
  error.value = '';
  notice.value = '';
}

async function markVacant() {
  if (!selected.value || confirmation.value.trim() !== selected.value.streetAddress) return;
  isClearing.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await fetch(`/api/admin/households/${selected.value.id}/vacate`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to mark household vacant.');
    notice.value = `${data.streetAddress} is now vacant. ${data.residentsRemoved} resident records and ${data.usersReset} account associations were cleared.`;
    results.value = results.value.filter((item) => item.id !== selected.value?.id);
    selected.value = null;
    confirmation.value = '';
  } catch (clearError) {
    error.value = clearError instanceof Error ? clearError.message : 'Unable to mark household vacant.';
  } finally {
    isClearing.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <p class="text-sm font-medium uppercase tracking-wide text-[#1a73e8]">Directory maintenance</p>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Mark Household Vacant</h2>
      <p class="mt-2 text-[#444746]">Search for a property to archive departing residents, clear active contacts, and mark the household as vacant for future occupants.</p>
    </div>

    <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="searchHouseholds">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#444746]" />
        <input v-model="query" required class="w-full rounded-xl border border-[#e1e3e1] bg-white py-3 pl-10 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30" placeholder="Search resident name or street address" />
      </div>
      <button type="submit" :disabled="isSearching" class="rounded-full bg-[#1a73e8] px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{{ isSearching ? 'Searching...' : 'Search' }}</button>
    </form>

    <p v-if="error" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="notice" class="rounded-xl bg-[#e6f4ea] p-3 text-sm text-[#137333]">{{ notice }}</p>

    <div v-if="results.length" class="space-y-2">
      <button v-for="household in results" :key="household.id" type="button" class="w-full rounded-2xl border p-4 text-left transition-colors" :class="selected?.id === household.id ? 'border-[#1a73e8] bg-[#e8f0fe]' : 'border-[#e1e3e1] bg-white hover:border-[#1a73e8]'" @click="selectHousehold(household)">
        <span class="block font-medium">{{ household.streetAddress }}</span>
        <span class="mt-1 block text-sm text-[#444746]">{{ household.residents.map((resident) => `${resident.firstName} ${resident.lastName}`).join(', ') || 'No residents' }} · {{ household.children.length }} children</span>
      </button>
    </div>

    <div v-if="selected" class="rounded-3xl border border-[#f1b3b0] bg-[#fff8f7] p-5 sm:p-6">
      <div class="flex items-start gap-3">
        <ShieldAlert class="mt-0.5 h-5 w-5 shrink-0 text-[#b3261e]" />
        <div>
          <h3 class="font-semibold text-[#7f1d1d]">Clear {{ selected.streetAddress }}?</h3>
          <p class="mt-2 text-sm text-[#7f1d1d]">This will remove {{ selected.residents.length }} resident record(s), {{ selected.children.length }} child record(s), private Login Emails, active sessions, outstanding login links, favorites, pets, notes, and membership details. The household address will remain.</p>
        </div>
      </div>
      <label class="mt-5 block text-sm font-medium text-[#1f1f1f]">Type the address to confirm
        <input v-model="confirmation" class="mt-2 w-full rounded-xl border border-[#e1e3e1] bg-white px-3 py-2.5 text-sm focus:border-[#b3261e] focus:outline-none focus:ring-2 focus:ring-[#b3261e]/30" :placeholder="selected.streetAddress" />
      </label>
      <button type="button" :disabled="isClearing || confirmation.trim() !== selected.streetAddress" class="mt-4 inline-flex items-center gap-2 rounded-full bg-[#b3261e] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" @click="markVacant"><Trash2 class="h-4 w-4" />{{ isClearing ? 'Clearing...' : 'Mark household vacant' }}</button>
    </div>
  </section>
</template>
