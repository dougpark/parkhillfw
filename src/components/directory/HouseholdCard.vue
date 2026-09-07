<script setup lang="ts">
import { Shield, Home } from 'lucide-vue-next';

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

defineProps<{
  household: Household;
}>();
</script>

<template>
  <article class="bg-white border border-[#e1e3e1] rounded-3xl p-6 shadow-sm">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold text-[#1f1f1f]">
          <Home class="w-4 h-4 text-[#1a73e8]" />
          {{ household.streetAddress }}
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
      <h3 class="text-sm font-semibold text-[#444746] uppercase tracking-wide mb-2">Adult Residents</h3>
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
            <td class="py-2 pr-4">{{ resident.isPrimaryContact ? 'Yes' : 'No' }}</td>
            <td class="py-2 pr-4">{{ resident.email ?? 'N/A' }}</td>
            <td class="py-2 pr-4">{{ resident.phoneMobile ?? 'N/A' }}</td>
            <td class="py-2 pr-4">{{ resident.phoneHome ?? 'N/A' }}</td>
            <td class="py-2">{{ resident.occupation ?? 'N/A' }}</td>
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
          <p class="text-[#444746]">{{ resident.email ?? 'N/A' }}</p>
          <p class="text-[#444746]">{{ resident.phoneMobile ?? 'N/A' }}</p>
          <p class="text-[#444746]">{{ resident.occupation ?? 'N/A' }}</p>
        </li>
      </ul>
    </section>

    <section v-if="household.children.length" class="mt-5">
      <h3 class="text-sm font-semibold text-[#444746] uppercase tracking-wide mb-2">Children &amp; Dependents</h3>
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
            <td class="py-2 pr-4">{{ child.birthYear ?? 'N/A' }}</td>
            <td class="py-2 pr-4">{{ child.school ?? 'N/A' }}</td>
            <td class="py-2 pr-4">{{ child.residenceLocation ?? 'N/A' }}</td>
            <td class="py-2 pr-4">{{ child.petSitting ? 'Yes' : 'No' }}</td>
            <td class="py-2 pr-4">{{ child.babysitting ? 'Yes' : 'No' }}</td>
            <td class="py-2">{{ child.specialSkills ?? 'N/A' }}</td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile stacked cards -->
      <ul class="sm:hidden space-y-3">
        <li v-for="child in household.children" :key="child.id" class="rounded-xl bg-[#f0f4f9] p-3 text-sm">
          <p class="font-medium text-[#1f1f1f]">{{ child.name }}</p>
          <p class="text-[#444746]">{{ child.school ?? 'N/A' }}</p>
          <p class="text-[#444746]">
            Pet Sitting: {{ child.petSitting ? 'Yes' : 'No' }} · Babysitting: {{ child.babysitting ? 'Yes' : 'No' }}
          </p>
        </li>
      </ul>
    </section>
  </article>
</template>
