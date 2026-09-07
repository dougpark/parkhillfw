<script setup lang="ts">
import { Shield, Home, Star } from 'lucide-vue-next';

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

const props = defineProps<{
  household: Household;
}>();

const emit = defineEmits<{
  'toggle-favorite': [householdId: number];
}>();
</script>

<template>
  <article class="bg-white border border-[#e1e3e1] rounded-3xl p-6 shadow-sm">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold text-[#1f1f1f]">
          <Home class="w-4 h-4 text-[#1a73e8]" />
          {{ household.streetAddress }}
          <button
            type="button"
            class="rounded-full p-1 text-[#f4b400] hover:bg-[#fff8e1] transition-colors"
            :aria-label="props.household.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
            :title="props.household.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
            @click.stop="emit('toggle-favorite', props.household.id)"
          >
            <Star class="w-4 h-4" :fill="props.household.isFavorite ? 'currentColor' : 'none'" />
          </button>
        </h2>
        <p v-if="household.yearMovedIn || household.pets" class="mt-1 text-sm text-[#444746]">
          <span v-if="household.yearMovedIn">Moved In: {{ household.yearMovedIn }}</span>
          <span v-if="household.yearMovedIn && household.pets"> · </span>
          <span v-if="household.pets">Pets: {{ household.pets }}</span>
        </p>
        <p v-if="household.notes" class="mt-1 text-sm text-[#444746]">Notes: {{ household.notes }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <span
          v-if="household.parkHillMember"
          class="rounded-full bg-[#1a73e8]/10 text-[#1a73e8] px-3 py-1 text-xs font-medium"
        >
          {{ household.parkHillMember }}
        </span>
        <span
          v-if="household.securityMember"
          class="flex items-center gap-1 rounded-full bg-[#7c4dff]/10 text-[#7c4dff] px-3 py-1 text-xs font-medium"
        >
          <Shield class="w-3 h-3" /> Security Member
        </span>
      </div>
    </header>

    <section v-if="household.residents.length" class="mt-5">
      <h3 class="text-sm font-semibold text-[#444746] uppercase tracking-wide mb-2">Adults</h3>
      <!-- Desktop table -->
      <table class="hidden sm:table w-full text-sm">
        <thead>
          <tr class="text-left text-[#444746] border-b border-[#e1e3e1]">
            <th class="py-2 pr-4 font-medium">Name</th>
            <th class="py-2 pr-4 font-medium">Primary</th>
            <th class="py-2 pr-4 font-medium">Email</th>
            <th class="py-2 pr-4 font-medium">Mobile Phone</th>
            <th class="py-2 pr-4 font-medium">Home Phone</th>
            <th class="py-2 font-medium">Occupation</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="resident in household.residents" :key="resident.id" class="border-b border-[#e1e3e1] last:border-0">
            <td class="py-2 pr-4">{{ resident.firstName }} {{ resident.lastName }}</td>
            <td class="py-2 pr-4">{{ resident.isPrimaryContact ? 'Yes' : '' }}</td>
            <td class="py-2 pr-4">{{ resident.email ?? '' }}</td>
            <td class="py-2 pr-4">{{ resident.phoneMobile ?? '' }}</td>
            <td class="py-2 pr-4">{{ resident.phoneHome ?? '' }}</td>
            <td class="py-2">{{ resident.occupation ?? '' }}</td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile stacked cards -->
      <ul class="sm:hidden space-y-3">
        <li
          v-for="resident in household.residents"
          :key="resident.id"
          class="rounded-xl bg-[#f0f4f9] p-3 text-sm"
        >
          <p class="font-medium text-[#1f1f1f]">
            {{ resident.firstName }} {{ resident.lastName }}
            <span v-if="resident.isPrimaryContact" class="text-[#1a73e8]">· Primary</span>
          </p>
          <p class="text-[#444746]">{{ resident.email ?? '' }}</p>
          <p v-if="resident.phoneMobile" class="text-[#444746]">M: {{ resident.phoneMobile }}</p>
          <p v-if="resident.phoneHome" class="text-[#444746]">H: {{ resident.phoneHome }}</p>
          <p class="text-[#444746]">{{ resident.occupation ?? '' }}</p>
        </li>
      </ul>
    </section>

    <section v-if="household.children.length" class="mt-5">
      <h3 class="text-sm font-semibold text-[#444746] uppercase tracking-wide mb-2">Children</h3>
      <!-- Desktop table -->
      <table class="hidden sm:table w-full text-sm">
        <thead>
          <tr class="text-left text-[#444746] border-b border-[#e1e3e1]">
            <th class="py-2 pr-4 font-medium">Name</th>
            <th class="py-2 pr-4 font-medium">Birth Year</th>
            <th class="py-2 pr-4 font-medium">School</th>
            <th class="py-2 pr-4 font-medium">Location</th>
            <th class="py-2 pr-4 font-medium">Pet Sitting</th>
            <th class="py-2 pr-4 font-medium">Babysitting</th>
            <th class="py-2 font-medium">Special Skills</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="child in household.children" :key="child.id" class="border-b border-[#e1e3e1] last:border-0">
            <td class="py-2 pr-4">{{ child.name }}</td>
            <td class="py-2 pr-4">{{ child.birthYear ?? '' }}</td>
            <td class="py-2 pr-4">{{ child.school ?? '' }}</td>
            <td class="py-2 pr-4">{{ child.residenceLocation ?? '' }}</td>
            <td class="py-2 pr-4">{{ child.petSitting ? 'Yes' : '' }}</td>
            <td class="py-2 pr-4">{{ child.babysitting ? 'Yes' : '' }}</td>
            <td class="py-2">{{ child.specialSkills ?? '' }}</td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile stacked cards -->
      <ul class="sm:hidden space-y-3">
        <li v-for="child in household.children" :key="child.id" class="rounded-xl bg-[#f0f4f9] p-3 text-sm">
          <p class="font-medium text-[#1f1f1f]">{{ child.name }}</p>
          <p class="text-[#444746]">{{ child.school ?? '' }}</p>
          <p v-if="child.petSitting" class="text-[#444746]">Pet Sitting</p>
          <p v-if="child.babysitting" class="text-[#444746]">Babysitting</p>
          <p v-if="child.specialSkills" class="text-[#444746]">Skills: {{ child.specialSkills }}</p>
        </li>
      </ul>
    </section>
  </article>
</template>
