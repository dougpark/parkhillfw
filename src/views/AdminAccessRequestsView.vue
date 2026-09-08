<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Check, Search, X } from 'lucide-vue-next';

interface AccessRequest {
  id: number;
  email: string;
  fullName: string;
  streetAddress: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface DirectoryResident {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface DirectoryMatch {
  id: number;
  streetAddress: string;
  residents: DirectoryResident[];
}

const requests = ref<AccessRequest[]>([]);
const selectedId = ref<number | null>(null);
const directoryQuery = ref('');
const directoryMatches = ref<DirectoryMatch[]>([]);
const selectedResidentId = ref<number | null>(null);
const isLoading = ref(true);
const isSearching = ref(false);
const isReviewing = ref(false);
const error = ref('');
const notice = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const pendingRequests = computed(() => requests.value.filter((request) => request.status === 'pending'));
const sortedRequests = computed(() => [...requests.value].sort((left, right) => {
  const leftOpen = left.status === 'pending' ? 0 : 1;
  const rightOpen = right.status === 'pending' ? 0 : 1;
  if (leftOpen !== rightOpen) return leftOpen - rightOpen;
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}));
const selectedRequest = computed(() => requests.value.find((request) => request.id === selectedId.value) ?? null);

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadRequests() {
  isLoading.value = true;
  try {
    const response = await fetch('/api/admin/access-requests');
    if (!response.ok) throw new Error('Unable to load access requests.');
    requests.value = await response.json();
    if (!selectedId.value && pendingRequests.value[0]) selectedId.value = pendingRequests.value[0].id;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load access requests.';
  } finally {
    isLoading.value = false;
  }
}

async function searchDirectory() {
  if (!directoryQuery.value.trim()) {
    directoryMatches.value = [];
    return;
  }
  isSearching.value = true;
  try {
    const response = await fetch(`/api/admin/directory?q=${encodeURIComponent(directoryQuery.value.trim())}`);
    if (!response.ok) throw new Error('Unable to search the directory.');
    directoryMatches.value = await response.json();
  } catch (searchError) {
    error.value = searchError instanceof Error ? searchError.message : 'Unable to search the directory.';
  } finally {
    isSearching.value = false;
  }
}

function selectRequest(request: AccessRequest) {
  selectedId.value = request.id;
  selectedResidentId.value = null;
  directoryQuery.value = `${request.fullName} ${request.streetAddress}`;
  searchDirectory();
}

function chooseResident(residentId: number) {
  selectedResidentId.value = residentId;
}

async function review(status: 'approved' | 'rejected') {
  if (!selectedRequest.value) return;
  if (status === 'approved' && !selectedResidentId.value) {
    error.value = 'Search the directory and select the resident to connect before approving.';
    return;
  }
  isReviewing.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await fetch(`/api/admin/access-requests/${selectedRequest.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, residentId: selectedResidentId.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to update request.');
    selectedRequest.value.status = status;
    notice.value = data.emailSent === false ? data.warning : `${status === 'approved' ? 'Approval' : 'Rejection'} email sent.`;
    selectedResidentId.value = null;
    if (status === 'approved' || status === 'rejected') {
      const next = pendingRequests.value.find((request) => request.id !== selectedRequest.value?.id);
      selectedId.value = next?.id ?? null;
      directoryMatches.value = [];
      directoryQuery.value = '';
    }
  } catch (reviewError) {
    error.value = reviewError instanceof Error ? reviewError.message : 'Unable to update request.';
  } finally {
    isReviewing.value = false;
  }
}

watch(directoryQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchDirectory, 300);
});

onMounted(loadRequests);
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-medium uppercase tracking-wide text-[#1a73e8]">Admin review</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight">Access requests</h2>
        <p class="mt-2 text-[#444746]">Verify the request against the directory before connecting an account.</p>
      </div>
      <span class="rounded-full bg-[#fff8e1] px-3 py-1.5 text-sm font-medium text-[#8a6116]">{{ pendingRequests.length }} pending</span>
    </div>

    <p v-if="error" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="notice" class="rounded-xl bg-[#e6f4ea] p-3 text-sm text-[#137333]">{{ notice }}</p>
    <p v-if="isLoading" class="py-10 text-center text-[#444746]">Loading requests...</p>
    <p v-else-if="!requests.length" class="rounded-3xl border border-[#e1e3e1] bg-white p-6 text-[#444746]">No access requests.</p>

    <div v-else class="grid min-h-136 overflow-hidden rounded-3xl border border-[#e1e3e1] bg-white shadow-sm lg:grid-cols-[18rem_1fr]">
      <aside class="border-b border-[#e1e3e1] bg-[#f0f4f9] p-3 lg:border-b-0 lg:border-r">
        <h3 class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#444746]">Requests</h3>
        <button
          v-for="request in sortedRequests"
          :key="request.id"
          type="button"
          class="mb-1 w-full rounded-2xl p-3 text-left transition-colors"
          :class="selectedId === request.id ? 'bg-white shadow-sm' : 'hover:bg-white/70'"
          @click="selectRequest(request)"
        >
          <span class="flex items-center justify-between gap-2">
            <strong class="truncate text-sm">{{ request.fullName }}</strong>
            <span class="h-2 w-2 shrink-0 rounded-full" :class="request.status === 'pending' ? 'bg-[#f4b400]' : request.status === 'approved' ? 'bg-[#34a853]' : 'bg-[#b3261e]'" />
          </span>
          <span class="mt-1 block truncate text-xs text-[#444746]">{{ request.streetAddress }}</span>
          <span class="mt-1 block text-[11px] uppercase tracking-wide text-[#444746]">
            {{ request.status }}<template v-if="request.status !== 'pending' && request.reviewedAt"> · {{ formatDate(request.reviewedAt) }}</template>
          </span>
        </button>
      </aside>

      <article v-if="selectedRequest" class="p-5 sm:p-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-xl font-semibold">{{ selectedRequest.fullName }}</h3>
            <p class="mt-1 text-sm text-[#444746]">{{ selectedRequest.email }}</p>
            <p class="text-sm text-[#444746]">Submitted address: {{ selectedRequest.streetAddress }}</p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-medium" :class="selectedRequest.status === 'pending' ? 'bg-[#fff8e1] text-[#8a6116]' : selectedRequest.status === 'approved' ? 'bg-[#e6f4ea] text-[#137333]' : 'bg-red-50 text-[#b3261e]'">
            {{ selectedRequest.status }}<template v-if="selectedRequest.status !== 'pending' && selectedRequest.reviewedAt"> · {{ formatDate(selectedRequest.reviewedAt) }}</template>
          </span>
        </div>

        <div class="mt-8 border-t border-[#e1e3e1] pt-6">
          <h4 class="font-semibold">Verify directory match</h4>
          <p class="mt-1 text-sm text-[#444746]">Search by name or address, then select the resident this Login Email belongs to.</p>
          <div class="relative mt-4">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#444746]" />
            <input v-model="directoryQuery" class="w-full rounded-xl border border-[#e1e3e1] py-3 pl-10 pr-3 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30" placeholder="Search directory by name or street address" />
          </div>
          <p v-if="isSearching" class="mt-4 text-sm text-[#444746]">Searching...</p>
          <div v-else class="mt-4 space-y-3">
            <div v-for="match in directoryMatches" :key="match.id" class="rounded-2xl border border-[#e1e3e1] p-4">
              <p class="font-medium">{{ match.streetAddress }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button v-for="resident in match.residents" :key="resident.id" type="button" class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm" :class="selectedResidentId === resident.id ? 'border-[#1a73e8] bg-[#e8f0fe] text-[#0b57d0]' : 'border-[#e1e3e1] hover:border-[#1a73e8]'" @click="chooseResident(resident.id)">
                  <Check v-if="selectedResidentId === resident.id" class="h-4 w-4" />
                  {{ resident.firstName }} {{ resident.lastName }}<span v-if="resident.email" class="text-xs text-[#444746]">· {{ resident.email }}</span>
                </button>
              </div>
            </div>
            <p v-if="directoryQuery && !directoryMatches.length && !isSearching" class="text-sm text-[#444746]">No matching directory entries.</p>
          </div>
        </div>

        <div v-if="selectedRequest.status === 'pending'" class="mt-8 flex flex-wrap gap-3 border-t border-[#e1e3e1] pt-6">
          <button type="button" :disabled="isReviewing" class="inline-flex items-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60" @click="review('approved')">Approve and send login link</button>
          <button type="button" :disabled="isReviewing" class="inline-flex items-center gap-2 rounded-full border border-[#b3261e] px-5 py-2.5 text-sm font-medium text-[#b3261e] hover:bg-red-50 disabled:opacity-60" @click="review('rejected')"><X class="h-4 w-4" /> Reject request</button>
        </div>
      </article>
      <div v-else class="flex items-center justify-center p-8 text-center text-[#444746]">Select a request to review.</div>
    </div>
  </section>
</template>
