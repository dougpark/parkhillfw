<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import BaseInput from '@/components/ui/BaseInput.vue';
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
  residents: Resident[];
  children: Child[];
}

const query = ref('');
const households = ref<Household[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

let searchDebounce: ReturnType<typeof setTimeout> | undefined;

async function loadDirectory() {
  isLoading.value = true;
  error.value = null;
  try {
    const params = query.value ? `?q=${encodeURIComponent(query.value)}` : '';
    const res = await fetch(`/api/directory${params}`);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    households.value = await res.json();
  } catch {
    error.value = 'Unable to load the directory. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

watch(query, () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadDirectory, 300);
});

onMounted(loadDirectory);
</script>

<template>
  <div class="space-y-6">
    <div class="sticky top-[57px] z-10 -mx-4 bg-[#f0f4f9] px-4 py-3 sm:mx-0 sm:px-0">
      <BaseInput v-model="query" placeholder="Search residents, addresses, children..." />
    </div>

    <p v-if="isLoading" class="text-center text-[#444746] py-10">Loading directory...</p>
    <p v-else-if="error" class="text-center text-red-600 py-10">{{ error }}</p>
    <p v-else-if="!households.length" class="text-center text-[#444746] py-10">No households found.</p>

    <div v-else class="space-y-6">
      <HouseholdCard v-for="household in households" :key="household.id" :household="household" />
    </div>
  </div>
</template>
