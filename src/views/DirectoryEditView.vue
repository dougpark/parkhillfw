<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';

interface Resident {
  id?: number;
  firstName: string;
  lastName: string;
  isPrimaryContact: boolean;
  email: string | null;
  phoneMobile: string | null;
  phoneHome: string | null;
  phoneWork: string | null;
  occupation: string | null;
}

interface Child {
  id?: number;
  name: string;
  birthYear: number | null;
  school: string | null;
  occupation: string | null;
  residenceLocation: string | null;
  babysitting: boolean;
  petSitting: boolean;
  specialSkills: string | null;
}

interface Household {
  streetAddress: string;
  yearMovedIn: number | null;
  parkHillMember: string | null;
  securityMember: boolean;
  pets: string | null;
  notes: string | null;
}

const router = useRouter();
const props = defineProps<{
  adminHouseholdId?: number;
}>();
const household = ref<Household>({ streetAddress: '', yearMovedIn: null, parkHillMember: null, securityMember: false, pets: null, notes: null });
const residents = ref<Resident[]>([]);
const children = ref<Child[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const saved = ref(false);
const error = ref('');

const inputClass = 'mt-1 w-full rounded-xl border border-[#e1e3e1] bg-white px-3 py-2.5 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30';

async function loadDirectory() {
  try {
    const endpoint = props.adminHouseholdId
      ? `/api/admin/households/${props.adminHouseholdId}`
      : '/api/my-directory';
    const response = await fetch(endpoint);
    const data = await response.json() as { error?: string; household: Household; residents: Resident[]; children: Child[] };
    if (!response.ok) throw new Error(data.error ?? 'Unable to load your directory information.');
    household.value = data.household;
    residents.value = data.residents;
    children.value = data.children;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load your directory information.';
  } finally {
    isLoading.value = false;
  }
}

async function saveDirectory() {
  isSaving.value = true;
  saved.value = false;
  error.value = '';
  try {
    const endpoint = props.adminHouseholdId
      ? `/api/admin/households/${props.adminHouseholdId}`
      : '/api/my-directory';
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household: household.value, residents: residents.value, children: children.value }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? 'Unable to save your directory information.');
    saved.value = true;
    await loadDirectory();
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : 'Unable to save your directory information.';
  } finally {
    isSaving.value = false;
  }
}

function addResident() {
  residents.value.push({ firstName: '', lastName: '', isPrimaryContact: false, email: null, phoneMobile: null, phoneHome: null, phoneWork: null, occupation: null });
}

function addChild() {
  children.value.push({ name: '', birthYear: null, school: null, occupation: null, residenceLocation: null, babysitting: false, petSitting: false, specialSkills: null });
}

onMounted(loadDirectory);
</script>

<template>
  <section class="space-y-6">
    <BreadcrumbNav v-if="!adminHouseholdId" current="Edit My Household" />

    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        
        <h2 class="mt-3 text-2xl font-semibold tracking-tight">{{ adminHouseholdId ? 'Edit Household' : 'Edit My Household' }}</h2>
        <p v-if="!adminHouseholdId" class="mt-2 text-[#444746]">Update information for your household and everyone who lives there.</p>
      </div>
      <button type="button" :disabled="isSaving || isLoading" class="inline-flex items-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60" @click="saveDirectory">
        <Save class="h-4 w-4" /> {{ isSaving ? 'Saving...' : 'Save changes' }}
      </button>
    </div>

    <p v-if="saved" class="rounded-xl bg-[#e6f4ea] p-3 text-sm text-[#137333]">Your directory information was saved.</p>
    <p v-if="error" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="isLoading" class="py-12 text-center text-[#444746]">Loading household information...</p>

    <form v-else class="space-y-6" @submit.prevent="saveDirectory">
      <section class="rounded-3xl border border-[#e1e3e1] bg-white p-5 shadow-sm sm:p-6">
        <h3 class="text-lg font-semibold">Household</h3>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <label class="text-sm font-medium sm:col-span-2">Street address<input :value="household.streetAddress" readonly :class="`${inputClass} cursor-not-allowed bg-[#f0f4f9]`" /></label>
          <p class="text-xs text-[#444746] sm:col-span-2">Address corrections must be made by an administrator.</p>
          <label class="text-sm font-medium">Year moved in<input v-model.number="household.yearMovedIn" type="number" min="1800" max="2200" :class="inputClass" /></label>
          <label class="text-sm font-medium">Park Hill membership<input v-model="household.parkHillMember" :class="inputClass" placeholder="e.g. PARK HILL REGULAR" /></label>
          <label class="flex items-center gap-3 text-sm font-medium sm:col-span-2"><input v-model="household.securityMember" type="checkbox" class="h-5 w-5 accent-[#1a73e8]" /> Security member</label>
          <label class="text-sm font-medium sm:col-span-2">Pets<input v-model="household.pets" :class="inputClass" /></label>
          <label class="text-sm font-medium sm:col-span-2">Notes<textarea v-model="household.notes" rows="3" :class="inputClass" /></label>
        </div>
      </section>

      <section class="rounded-3xl border border-[#e1e3e1] bg-white p-5 shadow-sm sm:p-6">
        <div class="flex items-center justify-between gap-4"><div><h3 class="text-lg font-semibold">Adult residents</h3><p class="mt-1 text-sm text-[#444746]">Anyone in the household can update the other residents here.</p></div><button type="button" class="inline-flex items-center gap-1 rounded-full border border-[#1a73e8] px-3 py-1.5 text-sm font-medium text-[#1a73e8]" @click="addResident"><Plus class="h-4 w-4" /> Add</button></div>
        <div class="mt-5 space-y-5">
          <div v-for="(resident, index) in residents" :key="resident.id ?? `new-${index}`" class="rounded-2xl bg-[#f0f4f9] p-4">
            <div class="flex justify-end"><button type="button" class="rounded-full p-1.5 text-[#b3261e] hover:bg-red-50" aria-label="Remove resident" title="Remove resident" @click="residents.splice(index, 1)"><Trash2 class="h-4 w-4" /></button></div>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium">First name<input v-model="resident.firstName" required :class="inputClass" /></label>
              <label class="text-sm font-medium">Last name<input v-model="resident.lastName" required :class="inputClass" /></label>
              <label class="flex items-center gap-3 text-sm font-medium sm:col-span-2"><input v-model="resident.isPrimaryContact" type="checkbox" class="h-5 w-5 accent-[#1a73e8]" /> Primary contact</label>
              <label class="text-sm font-medium">Email<input v-model="resident.email" type="email" :class="inputClass" /></label>
              <label class="text-sm font-medium">Occupation<input v-model="resident.occupation" :class="inputClass" /></label>
              <label class="text-sm font-medium">Mobile phone<input v-model="resident.phoneMobile" type="tel" :class="inputClass" /></label>
              <label class="text-sm font-medium">Home phone<input v-model="resident.phoneHome" type="tel" :class="inputClass" /></label>
              <label class="text-sm font-medium">Work phone<input v-model="resident.phoneWork" type="tel" :class="inputClass" /></label>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-3xl border border-[#e1e3e1] bg-white p-5 shadow-sm sm:p-6">
        <div class="flex items-center justify-between gap-4"><div><h3 class="text-lg font-semibold">Children and dependents</h3><p class="mt-1 text-sm text-[#444746]">Include service availability so neighbors can find help.</p></div><button type="button" class="inline-flex items-center gap-1 rounded-full border border-[#1a73e8] px-3 py-1.5 text-sm font-medium text-[#1a73e8]" @click="addChild"><Plus class="h-4 w-4" /> Add</button></div>
        <div class="mt-5 space-y-5">
          <div v-for="(child, index) in children" :key="child.id ?? `new-${index}`" class="rounded-2xl bg-[#f0f4f9] p-4">
            <div class="flex justify-end"><button type="button" class="rounded-full p-1.5 text-[#b3261e] hover:bg-red-50" aria-label="Remove child" title="Remove child" @click="children.splice(index, 1)"><Trash2 class="h-4 w-4" /></button></div>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium">Name<input v-model="child.name" required :class="inputClass" /></label>
              <label class="text-sm font-medium">Birth year<input v-model.number="child.birthYear" type="number" min="1900" max="2200" :class="inputClass" /></label>
              <label class="text-sm font-medium">School<input v-model="child.school" :class="inputClass" /></label>
              <label class="text-sm font-medium">Occupation<input v-model="child.occupation" :class="inputClass" /></label>
              <label class="text-sm font-medium">Residence location<input v-model="child.residenceLocation" :class="inputClass" /></label>
              <label class="text-sm font-medium sm:col-span-2">Special skills<input v-model="child.specialSkills" :class="inputClass" /></label>
              <label class="flex items-center gap-3 text-sm font-medium"><input v-model="child.petSitting" type="checkbox" class="h-5 w-5 accent-[#1a73e8]" /> Pet sitting</label>
              <label class="flex items-center gap-3 text-sm font-medium"><input v-model="child.babysitting" type="checkbox" class="h-5 w-5 accent-[#1a73e8]" /> Babysitting</label>
            </div>
          </div>
        </div>
      </section>
      <button type="submit" :disabled="isSaving" class="w-full rounded-full bg-[#1a73e8] px-6 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60">Save all changes</button>
    </form>
  </section>
</template>
