<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Info } from 'lucide-vue-next';
import BaseInput from '../components/ui/BaseInput.vue';
import ModalShell from '../components/ui/ModalShell.vue';

interface ArchiveResident {
  name: string;
  email: string | null;
  phone: string | null;
}

interface ArchiveEntry {
  id: number;
  streetAddress: string | null;
  archivedAt: string;
  residents: ArchiveResident[];
}

interface ArchiveDetail {
  id: number;
  streetAddress: string | null;
  archivedAt: string;
  archivedByAdminId: number | null;
  snapshot: unknown;
}

const searchQuery = ref('');
const archives = ref<ArchiveEntry[]>([]);
const isLoading = ref(false);
const error = ref('');
const detail = ref<ArchiveDetail | null>(null);
const isDetailLoading = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadArchives() {
  isLoading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (searchQuery.value.trim()) params.set('q', searchQuery.value.trim());
    const response = await fetch(`/api/admin/log-viewer/archives?${params.toString()}`);
    if (!response.ok) throw new Error('Unable to load archives.');
    archives.value = await response.json() as ArchiveEntry[];
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load archives.';
  } finally {
    isLoading.value = false;
  }
}

async function openDetail(archiveId: number) {
  isDetailLoading.value = true;
  error.value = '';
  try {
    const response = await fetch(`/api/admin/log-viewer/archives/${archiveId}`);
    if (!response.ok) throw new Error('Unable to load archive detail.');
    detail.value = await response.json() as ArchiveDetail;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load archive detail.';
  } finally {
    isDetailLoading.value = false;
  }
}

function closeDetail() {
  detail.value = null;
}

watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadArchives, 250);
});

onMounted(loadArchives);
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Archives</h2>
      <p class="mt-2 text-content-muted">Search archived households by name or address.</p>
    </div>

    <BaseInput v-model="searchQuery" placeholder="Search by name or address..." />

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>

    <p v-if="!isLoading && !archives.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No archived households match your search.</p>
    <ul v-else class="space-y-2">
      <li
        v-for="archive in archives"
        :key="archive.id"
        class="flex items-start justify-between gap-4 rounded-2xl border border-theme-border bg-surface p-4"
      >
        <div class="min-w-0">
          <p class="font-medium text-content">{{ archive.streetAddress ?? 'Unknown address' }}</p>
          <p v-if="archive.residents.length" class="mt-1 text-sm text-content-muted">
            <span v-for="(resident, index) in archive.residents" :key="index">
              {{ resident.name }}<span v-if="resident.email"> · {{ resident.email }}</span><span v-if="resident.phone"> · {{ resident.phone }}</span><span v-if="index < archive.residents.length - 1">; </span>
            </span>
          </p>
          <p v-else class="mt-1 text-sm text-content-muted">No residents on file.</p>
          <p class="mt-1 text-xs text-content-muted">Archived {{ new Date(archive.archivedAt).toLocaleDateString() }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full p-2 text-content-muted hover:bg-app-bg hover:text-accent"
          aria-label="View full archive record"
          title="View full archive record"
          @click="openDetail(archive.id)"
        >
          <Info class="h-5 w-5" />
        </button>
      </li>
    </ul>

    <ModalShell v-if="detail" title="Archived household record" @close="closeDetail">
      <div class="space-y-3 text-sm">
        <p><span class="font-medium text-content">Address:</span> {{ detail.streetAddress ?? 'Unknown' }}</p>
        <p><span class="font-medium text-content">Archived:</span> {{ new Date(detail.archivedAt).toLocaleString() }}</p>
        <pre class="overflow-x-auto rounded-xl bg-app-bg p-4 text-xs text-content-muted">{{ JSON.stringify(detail.snapshot, null, 2) }}</pre>
      </div>
    </ModalShell>
    <ModalShell v-else-if="isDetailLoading" title="Loading..." @close="closeDetail">
      <p class="text-sm text-content-muted">Loading archive record...</p>
    </ModalShell>
  </section>
</template>
