<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';
import BaseInput from '../ui/BaseInput.vue';

interface PageOption {
  id: number;
  slug: string;
  title: string;
  isDraft: boolean;
  isPublic: boolean;
  updatedAt: string;
}

const emit = defineEmits<{ select: [page: PageOption]; close: [] }>();

const pages = ref<PageOption[]>([]);
const loading = ref(true);
const error = ref('');
const search = ref('');

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return pages.value;
  return pages.value.filter((page) => page.title.toLowerCase().includes(term) || page.slug.includes(term));
});

onMounted(async () => {
  const response = await fetch('/api/admin/pages');
  if (response.ok) pages.value = (await response.json()) as PageOption[];
  else error.value = 'Could not load pages.';
  loading.value = false;
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" @click.self="emit('close')">
    <div class="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-surface shadow-xl">
      <div class="flex items-center justify-between gap-4 border-b border-theme-border p-6">
        <div>
          <h3 class="text-xl font-semibold text-content">Add a page</h3>
          <p class="mt-1 text-sm text-content-muted">Pick a page to place in this menu. A page can appear in more than one menu.</p>
        </div>
        <button type="button" class="rounded-full p-2 text-content-muted hover:bg-app-bg" aria-label="Close" @click="emit('close')">
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="p-6">
        <BaseInput v-model="search" placeholder="Search pages..." :show-clear="Boolean(search)" @clear="search = ''" />

        <p v-if="error" class="mt-4 text-sm text-danger">{{ error }}</p>
        <p v-else-if="loading" class="mt-4 text-sm text-content-muted">Loading pages…</p>
        <p v-else-if="!filtered.length" class="mt-4 text-sm text-content-muted">No pages match that search.</p>

        <div v-else class="mt-4 max-h-80 overflow-y-auto rounded-2xl border border-theme-border">
          <button
            v-for="page in filtered"
            :key="page.id"
            type="button"
            class="flex w-full items-center gap-3 border-b border-theme-border px-4 py-3 text-left last:border-b-0 hover:bg-app-bg"
            @click="emit('select', page)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-content">{{ page.title }}</span>
              <span class="block truncate text-xs text-content-muted">/{{ page.slug }}</span>
            </span>
            <span v-if="page.isDraft" class="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">Draft</span>
            <span v-else-if="page.isPublic" class="rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">Public</span>
            <span v-else class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">Members</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
