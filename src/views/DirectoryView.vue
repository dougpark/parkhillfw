<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import FilterChip from '@/components/ui/FilterChip.vue';
import HouseholdCard from '@/components/directory/HouseholdCard.vue';

interface Resident {
  id: number;
  firstName: string;
  lastName: string;
  isPrimaryContact: boolean | null;
  email: string | null;
  phoneMobile: string | null;
  phoneHome: string | null;
  occupation: string | null;
}

interface Child {
  id: number;
  name: string;
  birthYear: number | null;
  school: string | null;
  residenceLocation: string | null;
  petSitting: boolean | null;
  babysitting: boolean | null;
  specialSkills: string | null;
}

interface Household {
  id: number;
  streetAddress: string;
  yearMovedIn: number | null;
  parkHillMember: string | null;
  securityMember: boolean | null;
  pets: string | null;
  notes: string | null;
  isFavorite: boolean;
  residents: Resident[];
  children: Child[];
}

const query = ref('');
const petSitting = ref(false);
const babysitting = ref(false);
const favoritesOnly = ref(false);
const households = ref<Household[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

let searchDebounce: ReturnType<typeof setTimeout> | undefined;

async function loadDirectory() {
  isLoading.value = true;
  error.value = null;
  try {
    const params = new URLSearchParams();
    if (query.value) params.set('q', query.value);
    if (petSitting.value) params.set('petSitting', 'true');
    if (babysitting.value) params.set('babysitting', 'true');
    if (favoritesOnly.value) params.set('favorites', 'true');
    const search = params.toString();
    const res = await fetch(`/api/directory${search ? `?${search}` : ''}`);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    households.value = await res.json() as Household[];
  } catch {
    error.value = 'Unable to load the directory. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

watch([query, petSitting, babysitting, favoritesOnly], () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadDirectory, 300);
});

function clearCriteria() {
  query.value = '';
  petSitting.value = false;
  babysitting.value = false;
  favoritesOnly.value = false;
}

async function toggleFavorite(householdId: number) {
  const household = households.value.find((item) => item.id === householdId);
  if (!household) return;

  const previousValue = household.isFavorite;
  household.isFavorite = !previousValue;

  try {
    const method = household.isFavorite ? 'POST' : 'DELETE';
    const res = await fetch(`/api/households/${householdId}/favorite`, { method });
    if (!res.ok) throw new Error('Favorite update failed');
    if (!household.isFavorite && favoritesOnly.value) {
      households.value = households.value.filter((item) => item.id !== householdId);
    }
  } catch {
    household.isFavorite = previousValue;
    error.value = 'Unable to update favorites. Please try again.';
  }
}

onMounted(loadDirectory);
</script>

<template>
  <div class="space-y-6">
    <div class="sticky top-14 z-10 -mx-4 bg-[#f0f4f9] px-4 py-3 sm:mx-0 sm:px-0">
      <BaseInput
        v-model="query"
        :show-clear="Boolean(query || petSitting || babysitting || favoritesOnly)"
        placeholder="Search residents, addresses, children..."
        @clear="clearCriteria"
      />
      <div class="mt-3 flex flex-wrap gap-2">
        <FilterChip v-model="petSitting">Pet Sitter</FilterChip>
        <FilterChip v-model="babysitting">Babysitter</FilterChip>
        <FilterChip v-model="favoritesOnly">Favorites</FilterChip>
      </div>
    </div>

    <p v-if="isLoading" class="text-center text-[#444746] py-10">Loading directory...</p>
    <p v-else-if="error" class="text-center text-red-600 py-10">{{ error }}</p>
    <p v-else-if="!households.length" class="text-center text-[#444746] py-10">No households found.</p>

    <div v-else class="space-y-6">
      <HouseholdCard
        v-for="household in households"
        :key="household.id"
        :household="household"
        @toggle-favorite="toggleFavorite"
      />
    </div>
  </div>
</template>
