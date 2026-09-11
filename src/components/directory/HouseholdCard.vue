<script setup lang="ts">
import { ref } from 'vue';
import { Mail, MapPin, MessageCircle, Phone, Shield, Home, Star, X } from 'lucide-vue-next';

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

const selectedPhone = ref<string | null>(null);

function normalizedPhone(value: string): { digits: string; hasPlus: boolean; extension?: string } {
  const extensionMatch = value.match(/\b(?:x|ext\.?|extension)\s*(\d{1,6})$/i);
  const extension = extensionMatch?.[1];
  const mainNumber = extensionMatch ? value.slice(0, extensionMatch.index).trim() : value.trim();
  return {
    digits: mainNumber.replace(/\D/g, ''),
    hasPlus: mainNumber.startsWith('+'),
    extension,
  };
}

function phoneHref(value: string): string {
  const { digits, hasPlus, extension } = normalizedPhone(value);
  return `tel:${hasPlus ? '+' : ''}${digits}${extension ? `;ext=${extension}` : ''}`;
}

function smsHref(value: string): string {
  const { digits, hasPlus } = normalizedPhone(value);
  return `sms:${hasPlus ? '+' : ''}${digits}`;
}

function shouldShowPhoneChoice(): boolean {
  const maybeWindow = globalThis as typeof globalThis & { matchMedia?: (query: string) => { matches: boolean } };
  return maybeWindow.matchMedia?.('(hover: none), (pointer: coarse)').matches ?? false;
}

function choosePhoneAction(event: Event, value: string): void {
  if (!shouldShowPhoneChoice()) return;
  event.preventDefault();
  selectedPhone.value = value;
}

function closePhoneActions(): void {
  selectedPhone.value = null;
}

function emailHref(value: string): string {
  return `mailto:${value.trim()}`;
}

function mapsHref(streetAddress: string): string {
  const query = encodeURIComponent(`${streetAddress}, Fort Worth, TX`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
</script>

<template>
  <article class="bg-surface border border-theme-border rounded-3xl p-6 shadow-sm">
    <header class="flex flex-wrap items-start justify-between gap-3">
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
      <div class="flex flex-wrap gap-2">
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
              <a v-if="resident.phoneMobile" :href="phoneHref(resident.phoneMobile)" class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 -mx-2 text-accent hover:underline">
                <Phone class="h-3.5 w-3.5" aria-hidden="true" />
                {{ resident.phoneMobile }}
              </a>
            </td>
            <td class="py-2 pr-4">
              <a v-if="resident.phoneHome" :href="phoneHref(resident.phoneHome)" class="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 -mx-2 text-accent hover:underline">
                <Phone class="h-3.5 w-3.5" aria-hidden="true" />
                {{ resident.phoneHome }}
              </a>
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
          <a v-if="resident.phoneMobile" :href="phoneHref(resident.phoneMobile)" class="flex min-h-11 items-center gap-2 rounded-xl px-2 -mx-2 text-accent hover:underline" @click="choosePhoneAction($event, resident.phoneMobile)">
            <Phone class="h-4 w-4" aria-hidden="true" />
            <span>M: {{ resident.phoneMobile }}</span>
          </a>
          <a v-if="resident.phoneHome" :href="phoneHref(resident.phoneHome)" class="flex min-h-11 items-center gap-2 rounded-xl px-2 -mx-2 text-accent hover:underline" @click="choosePhoneAction($event, resident.phoneHome)">
            <Phone class="h-4 w-4" aria-hidden="true" />
            <span>H: {{ resident.phoneHome }}</span>
          </a>
          <p class="text-content-muted">{{ resident.occupation ?? '' }}</p>
        </li>
      </ul>
    </section>

    <Teleport to="body">
      <div
        v-if="selectedPhone"
        class="fixed inset-0 z-50 flex items-end bg-[#1f1f1f]/35 p-3 sm:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Choose phone action"
        @click="closePhoneActions"
      >
        <div class="w-full rounded-3xl border border-theme-border bg-surface p-4 shadow-2xl" @click.stop>
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-content">What would you like to do?</p>
              <p class="mt-1 text-sm text-content-muted">{{ selectedPhone }}</p>
            </div>
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-muted hover:bg-surface-hover"
              aria-label="Close phone actions"
              @click="closePhoneActions"
            >
              <X class="h-5 w-5" />
            </button>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <a
              :href="phoneHref(selectedPhone)"
              class="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-on-accent"
              @click="closePhoneActions"
            >
              <Phone class="h-5 w-5" aria-hidden="true" />
              Call
            </a>
            <a
              :href="smsHref(selectedPhone)"
              class="flex min-h-14 items-center justify-center gap-2 rounded-full border border-theme-border bg-surface px-4 text-sm font-medium text-content hover:bg-surface-hover"
              @click="closePhoneActions"
            >
              <MessageCircle class="h-5 w-5 text-accent" aria-hidden="true" />
              Text
            </a>
          </div>
        </div>
      </div>
    </Teleport>

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
  </article>
</template>
