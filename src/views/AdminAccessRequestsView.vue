<script setup lang="ts">
import { onMounted, ref } from 'vue';

interface AccessRequest {
  id: number;
  email: string;
  fullName: string;
  streetAddress: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface Resident {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  householdId: number;
}

const requests = ref<AccessRequest[]>([]);
const residents = ref<Resident[]>([]);
const error = ref('');
const selectedResident = ref<Record<number, number | undefined>>({});

async function load() {
  const [requestsResponse, residentsResponse] = await Promise.all([
    fetch('/api/admin/access-requests'),
    fetch('/api/admin/residents'),
  ]);
  if (!requestsResponse.ok || !residentsResponse.ok) throw new Error('Unable to load admin requests.');
  requests.value = await requestsResponse.json();
  residents.value = await residentsResponse.json();
}

async function review(request: AccessRequest, status: 'approved' | 'rejected') {
  error.value = '';
  const response = await fetch(`/api/admin/access-requests/${request.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, residentId: selectedResident.value[request.id] }),
  });
  if (!response.ok) {
    const data = await response.json();
    error.value = data.error ?? 'Unable to update request.';
    return;
  }
  request.status = status;
}

onMounted(() => load().catch((loadError) => { error.value = loadError instanceof Error ? loadError.message : 'Unable to load requests.'; }));
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Access requests</h2>
      <p class="mt-2 text-[#444746]">Review unmatched residents and connect them to the correct directory entry.</p>
    </div>
    <p v-if="error" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="!requests.length" class="rounded-3xl border border-[#e1e3e1] bg-white p-6 text-[#444746]">No access requests.</p>
    <div v-for="request in requests" :key="request.id" class="rounded-3xl border border-[#e1e3e1] bg-white p-6 shadow-sm">
      <div class="grid gap-1 text-sm">
        <strong>{{ request.fullName }}</strong>
        <span class="text-[#444746]">{{ request.email }}</span>
        <span class="text-[#444746]">{{ request.streetAddress }}</span>
        <span class="mt-2 text-xs uppercase tracking-wide text-[#444746]">{{ request.status }}</span>
      </div>
      <div v-if="request.status === 'pending'" class="mt-5 flex flex-col gap-3 sm:flex-row">
        <select v-model="selectedResident[request.id]" class="rounded-xl border border-[#e1e3e1] bg-white px-3 py-2 text-sm">
          <option :value="undefined">Select directory resident</option>
          <option v-for="resident in residents" :key="resident.id" :value="resident.id">
            {{ resident.firstName }} {{ resident.lastName }}{{ resident.email ? ` · ${resident.email}` : '' }}
          </option>
        </select>
        <button type="button" class="rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white" @click="review(request, 'approved')">Approve</button>
        <button type="button" class="rounded-full border border-[#e1e3e1] px-5 py-2 text-sm font-medium text-[#444746]" @click="review(request, 'rejected')">Reject</button>
      </div>
    </div>
  </section>
</template>
