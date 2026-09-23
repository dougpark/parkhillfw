<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import BreadcrumbNav from '@/components/common/BreadcrumbNav.vue';
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

const route = useRoute();
const query = ref(typeof route.query.q === 'string' ? route.query.q : '');
const petSitting = ref(false);
const babysitting = ref(false);
const favoritesOnly = ref(false);
const households = ref<Household[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

type SortBy = 'name' | 'address';
const SORT_STORAGE_KEY = 'directory_sort_by';

function loadStoredSortBy(): SortBy {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === 'address' ? 'address' : 'name';
  } catch {
    return 'name';
  }
}

const sortBy = ref<SortBy>(loadStoredSortBy());

watch(sortBy, (value) => {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, value);
  } catch {
    // Ignore storage errors in restricted contexts
  }
});

function householdSortName(household: Household): string {
  const primary = household.residents.find((resident) => resident.isPrimaryContact) ?? household.residents[0];
  return primary ? `${primary.lastName} ${primary.firstName}` : 'Vacant';
}

const sortedHouseholds = computed(() => {
  const list = [...households.value];
  if (sortBy.value === 'address') {
    list.sort((a, b) => a.streetAddress.localeCompare(b.streetAddress, undefined, { numeric: true, sensitivity: 'base' }));
  } else {
    list.sort((a, b) => householdSortName(a).localeCompare(householdSortName(b), undefined, { sensitivity: 'base' }));
  }
  return list;
});

const totalResidents = computed(() => households.value.reduce((sum, household) => sum + household.residents.length, 0));

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
    <BreadcrumbNav current="Directory" />
     <h2 class="mt-1 text-2xl font-semibold tracking-tight">Directory</h2>
   
    <div class="sticky top-14 z-10 -mx-4 bg-app-bg px-4 py-3 sm:mx-0 sm:px-0">
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

    <p v-if="isLoading" class="text-center text-content-muted py-10">Loading directory...</p>
    <p v-else-if="error" class="text-center text-danger py-10">{{ error }}</p>
    <p v-else-if="!households.length" class="text-center text-content-muted py-10">No households found.</p>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-content-muted">
          Showing {{ totalResidents }} {{ totalResidents === 1 ? 'Resident' : 'Residents' }}
        </p>
        <div class="inline-flex items-center rounded-full border border-theme-border bg-surface p-1" role="group" aria-label="Sort directory results">
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            :class="sortBy === 'name' ? 'bg-accent text-on-accent' : 'text-content-muted hover:text-content'"
            :aria-pressed="sortBy === 'name'"
            @click="sortBy = 'name'"
          >
            Name
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            :class="sortBy === 'address' ? 'bg-accent text-on-accent' : 'text-content-muted hover:text-content'"
            :aria-pressed="sortBy === 'address'"
            @click="sortBy = 'address'"
          >
            Address
          </button>
        </div>
      </div>

      <div class="space-y-6">
        <HouseholdCard
          v-for="household in sortedHouseholds"
          :key="household.id"
          :household="household"
          @toggle-favorite="toggleFavorite"
        />
      </div>
    </template>
  </div>
</template>
