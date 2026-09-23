<script setup lang="ts">
import { FileText, MapPin } from 'lucide-vue-next';

interface DirectoryResult {
  id: number;
  streetAddress: string;
  residentSummary: string;
}

interface PageResult {
  slug: string;
  title: string;
  snippet: string;
}

defineProps<{
  isLoading: boolean;
  directoryResults: DirectoryResult[];
  pageResults: PageResult[];
}>();

defineEmits<{
  selectDirectory: [result: DirectoryResult];
  selectPage: [result: PageResult];
}>();
</script>

<template>
  <p v-if="isLoading" class="px-4 py-3 text-sm text-content-muted">Searching…</p>
  <template v-else>
    <p v-if="!directoryResults.length && !pageResults.length" class="px-4 py-3 text-sm text-content-muted">No matches found.</p>

    <div v-if="directoryResults.length" class="border-b border-theme-border py-2 last:border-b-0">
      <p class="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">Directory</p>
      <button
        v-for="result in directoryResults"
        :key="result.id"
        type="button"
        class="flex w-full items-start gap-2 px-4 py-2 text-left hover:bg-surface-hover"
        @click="$emit('selectDirectory', result)"
      >
        <MapPin class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium text-content">{{ result.streetAddress }}</span>
          <span class="block truncate text-xs text-content-muted">{{ result.residentSummary }}</span>
        </span>
      </button>
    </div>

    <div v-if="pageResults.length" class="py-2">
      <p class="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">Pages</p>
      <button
        v-for="result in pageResults"
        :key="result.slug"
        type="button"
        class="flex w-full items-start gap-2 px-4 py-2 text-left hover:bg-surface-hover"
        @click="$emit('selectPage', result)"
      >
        <FileText class="mt-0.5 h-4 w-4 shrink-0 text-accent-secondary" aria-hidden="true" />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium text-content">{{ result.title }}</span>
          <span class="block truncate text-xs text-content-muted">{{ result.snippet }}</span>
        </span>
      </button>
    </div>
  </template>
</template>
