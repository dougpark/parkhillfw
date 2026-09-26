<script setup lang="ts">
import { ChevronRight, Receipt } from 'lucide-vue-next';

const emit = defineEmits<{ select: [label: string] }>();

interface ReportEntry {
  label: string;
  description: string;
  icon: unknown;
}

// Add future finance reports here as they're built.
const reports: ReportEntry[] = [
  { label: 'Transaction Report', description: 'Search and export payment transactions by date range and category.', icon: Receipt },
];
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Reports</h2>
      <p class="mt-2 text-content-muted">Choose a report to view or export.</p>
    </div>

    <div class="space-y-3">
      <button
        v-for="report in reports"
        :key="report.label"
        type="button"
        class="flex w-full items-center gap-4 rounded-2xl border border-theme-border bg-surface p-5 text-left shadow-sm transition-colors hover:bg-app-bg"
        @click="emit('select', report.label)"
      >
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <component :is="report.icon" class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-content">{{ report.label }}</span>
          <span class="mt-0.5 block text-xs text-content-muted">{{ report.description }}</span>
        </span>
        <ChevronRight class="h-5 w-5 shrink-0 text-content-muted" />
      </button>
    </div>
  </section>
</template>
