<script setup lang="ts">
import { ref, computed } from 'vue';
import { Mail, MapPin, Phone, Shield, Home, Star, ChevronDown, ChevronUp } from 'lucide-vue-next';
import { emailHref, mapsHref } from '@/lib/contact';
import PhoneActionSheet from './PhoneActionSheet.vue';

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

const expanded = ref(false);
const selectedPhone = ref<string | null>(null);

const sortedResidents = computed(() =>
  [...props.household.residents].sort((left, right) => Number(right.isPrimaryContact) - Number(left.isPrimaryContact))
);

function choosePhoneAction(event: Event, value: string): void {
  event.preventDefault();
  selectedPhone.value = value;
}
</script>

<template>
  <article class="bg-surface border border-theme-border rounded-3xl shadow-sm overflow-hidden">
    <Transition name="card-face" mode="out-in">
      <!-- Preview card -->
      <div v-if="!expanded" key="preview" class="p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1 space-y-2">
            <!-- Desktop compact rows -->
            <div class="hidden sm:block space-y-1.5">
              <div
                v-for="resident in sortedResidents"
                :key="resident.id"
                class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"
              >
                <span class="font-medium text-content">
                  {{ resident.firstName }} {{ resident.lastName }}
                </span>
                <a
                  v-if="resident.email"
                  :href="emailHref(resident.email)"
                  class="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Mail class="h-3.5 w-3.5" aria-hidden="true" />{{ resident.email }}
                </a>
                <button
                  v-if="resident.phoneMobile"
                  type="button"
                  class="inline-flex items-center gap-1 text-accent hover:underline"
                  @click="choosePhoneAction($event, resident.phoneMobile)"
                >
                  <Phone class="h-3.5 w-3.5" aria-hidden="true" />{{ resident.phoneMobile }}
                </button>
              </div>
            </div>
            <!-- Mobile stacked rows -->
            <ul class="sm:hidden space-y-2">
              <li v-for="resident in sortedResidents" :key="resident.id" class="text-sm">
                <p class="font-medium text-content">
                  {{ resident.firstName }} {{ resident.lastName }}
                </p>
                <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-content-muted">
                  <a
                    v-if="resident.email"
                    :href="emailHref(resident.email)"
                    class="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    <Mail class="h-3.5 w-3.5" aria-hidden="true" />{{ resident.email }}
                  </a>
                  <button
                    v-if="resident.phoneMobile"
                    type="button"
                    class="inline-flex items-center gap-1 text-accent hover:underline"
                    @click="choosePhoneAction($event, resident.phoneMobile)"
                  >
                    <Phone class="h-3.5 w-3.5" aria-hidden="true" />{{ resident.phoneMobile }}
                  </button>
                </div>
              </li>
            </ul>
            <p class="text-xs text-content-muted">{{ household.streetAddress }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-full p-1 text-[#f4b400] hover:bg-warning-subtle transition-colors"
              :aria-label="props.household.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
              :title="props.household.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
              @click.stop="emit('toggle-favorite', props.household.id)"
            >
              <Star class="w-4 h-4" :fill="props.household.isFavorite ? 'currentColor' : 'none'" />
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
              @click="expanded = true"
            >
              Show more
              <ChevronDown class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <!-- Full card -->
      <div v-else key="full" class="p-6">
    <div class="flex justify-end">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
        @click="expanded = false"
      >
        Show less
        <ChevronUp class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <header class="mt-2 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold text-content">
          <Home class="w-4 h-4 text-accent" />
          <a
            :href="mapsHref(household.streetAddress)"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 -mx-2 text-content underline decoration-theme-border underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
          >
            <span>{{ household.streetAddress }}</span>
            <MapPin class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          </a>
          <button
            type="button"
            class="rounded-full p-1 text-[#f4b400] hover:bg-warning-subtle transition-colors"
            :aria-label="props.household.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
            :title="props.household.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
            @click.stop="emit('toggle-favorite', props.household.id)"
          >
            <Star class="w-4 h-4" :fill="props.household.isFavorite ? 'currentColor' : 'none'" />
          </button>
        </h2>
        <p v-if="household.yearMovedIn || household.pets" class="mt-1 text-sm text-content-muted">
          <span v-if="household.yearMovedIn">Moved In: {{ household.yearMovedIn }}</span>
          <span v-if="household.yearMovedIn && household.pets"> · </span>
          <span v-if="household.pets">Pets: {{ household.pets }}</span>
        </p>
        <p v-if="household.notes" class="mt-1 text-sm text-content-muted">Notes: {{ household.notes }}</p>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <span
          v-if="household.parkHillMember"
          class="rounded-full bg-accent/10 text-accent px-3 py-1 text-xs font-medium"
        >
          {{ household.parkHillMember }}
        </span>
        <span
          v-if="household.securityMember"
          class="flex items-center gap-1 rounded-full bg-accent-secondary/10 text-accent-secondary px-3 py-1 text-xs font-medium"
        >
          <Shield class="w-3 h-3" /> Security Member
        </span>
      </div>
    </header>

    <section v-if="household.residents.length" class="mt-5">
      <h3 class="text-sm font-semibold text-content-muted uppercase tracking-wide mb-2">Adults</h3>
      <!-- Desktop table -->
      <table class="hidden sm:table w-full text-sm">
        <thead>
          <tr class="text-left text-content-muted border-b border-theme-border">
            <th class="py-2 pr-4 font-medium">Name</th>
            <th class="py-2 pr-4 font-medium">Primary</th>
            <th class="py-2 pr-4 font-medium">Email</th>
            <th class="py-2 pr-4 font-medium">Mobile Phone</th>
            <th class="py-2 pr-4 font-medium">Home Phone</th>
            <th class="py-2 font-medium">Occupation</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="resident in household.residents" :key="resident.id" class="border-b border-theme-border last:border-0">
            <td class="py-2 pr-4">{{ resident.firstName }} {{ resident.lastName }}</td>
            <td class="py-2 pr-4">{{ resident.isPrimaryContact ? 'Yes' : '' }}</td>
            <td class="py-2 pr-4">
              <a v-if="resident.email" :href="emailHref(resident.email)" class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 -mx-2 text-accent hover:underline">
                <Mail class="h-3.5 w-3.5" aria-hidden="true" />
                {{ resident.email }}
              </a>
            </td>
            <td class="py-2 pr-4">
              <button v-if="resident.phoneMobile" type="button" class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 -mx-2 text-left text-accent hover:underline" @click="choosePhoneAction($event, resident.phoneMobile)">
                <Phone class="h-3.5 w-3.5" aria-hidden="true" />
                {{ resident.phoneMobile }}
              </button>
            </td>
            <td class="py-2 pr-4">
              <button v-if="resident.phoneHome" type="button" class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 -mx-2 text-left text-accent hover:underline" @click="choosePhoneAction($event, resident.phoneHome)">
                <Phone class="h-3.5 w-3.5" aria-hidden="true" />
                {{ resident.phoneHome }}
              </button>
            </td>
            <td class="py-2">{{ resident.occupation ?? '' }}</td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile stacked cards -->
      <ul class="sm:hidden space-y-3">
        <li
          v-for="resident in household.residents"
          :key="resident.id"
          class="rounded-xl bg-app-bg p-3 text-sm"
        >
          <p class="font-medium text-content">
            {{ resident.firstName }} {{ resident.lastName }}
            <span v-if="resident.isPrimaryContact" class="text-accent">· Primary</span>
          </p>
          <a v-if="resident.email" :href="emailHref(resident.email)" class="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 -mx-2 text-accent hover:underline">
            <Mail class="h-4 w-4" aria-hidden="true" />
            {{ resident.email }}
          </a>
          <button v-if="resident.phoneMobile" type="button" class="flex min-h-11 items-center gap-2 rounded-xl px-2 -mx-2 text-left text-accent hover:underline" @click="choosePhoneAction($event, resident.phoneMobile)">
            <Phone class="h-4 w-4" aria-hidden="true" />
            <span>M: {{ resident.phoneMobile }}</span>
          </button>
          <button v-if="resident.phoneHome" type="button" class="flex min-h-11 items-center gap-2 rounded-xl px-2 -mx-2 text-left text-accent hover:underline" @click="choosePhoneAction($event, resident.phoneHome)">
            <Phone class="h-4 w-4" aria-hidden="true" />
            <span>H: {{ resident.phoneHome }}</span>
          </button>
          <p class="text-content-muted">{{ resident.occupation ?? '' }}</p>
        </li>
      </ul>
    </section>

    <section v-if="household.children.length" class="mt-5">
      <h3 class="text-sm font-semibold text-content-muted uppercase tracking-wide mb-2">Children</h3>
      <!-- Desktop table -->
      <table class="hidden sm:table w-full text-sm">
        <thead>
          <tr class="text-left text-content-muted border-b border-theme-border">
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
          <tr v-for="child in household.children" :key="child.id" class="border-b border-theme-border last:border-0">
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
        <li v-for="child in household.children" :key="child.id" class="rounded-xl bg-app-bg p-3 text-sm">
          <p class="font-medium text-content">{{ child.name }}</p>
          <p class="text-content-muted">{{ child.school ?? '' }}</p>
          <p v-if="child.petSitting" class="text-content-muted">Pet Sitting</p>
          <p v-if="child.babysitting" class="text-content-muted">Babysitting</p>
          <p v-if="child.specialSkills" class="text-content-muted">Skills: {{ child.specialSkills }}</p>
        </li>
      </ul>
    </section>
      </div>
    </Transition>

    <PhoneActionSheet v-if="selectedPhone" :phone="selectedPhone" @close="selectedPhone = null" />
  </article>
</template>

<style scoped>
.card-face-enter-active,
.card-face-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.card-face-enter-from,
.card-face-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.99);
}
</style>

