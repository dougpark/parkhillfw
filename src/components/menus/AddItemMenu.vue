<script setup lang="ts">
import { ref } from 'vue';
import { FilePlus, FilePlus2, FolderPlus, Link2, X } from 'lucide-vue-next';

defineProps<{ parentId: number | null }>();
const emit = defineEmits<{
  'insert-page': [];
  'new-link': [];
  'new-menu': [];
  'new-page': [title: string];
  close: [];
}>();

const step = ref<'menu' | 'new-page'>('menu');
const title = ref('');

function submitNewPage(): void {
  const trimmed = title.value.trim();
  if (!trimmed) return;
  emit('new-page', trimmed);
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" @click.self="emit('close')">
    <div class="w-full max-w-sm overflow-hidden rounded-3xl bg-surface shadow-xl">
      <div class="flex items-center justify-between gap-4 border-b border-theme-border p-6">
        <h3 class="text-xl font-semibold text-content">Add item</h3>
        <button type="button" class="rounded-full p-2 text-content-muted hover:bg-app-bg" aria-label="Close" title="Close" @click="emit('close')">
          <X class="h-5 w-5" />
        </button>
      </div>

      <div v-if="step === 'menu'" class="p-3">
        <button type="button" class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-content hover:bg-app-bg" @click="emit('insert-page')">
          <FilePlus2 class="h-5 w-5 text-accent" />
          Insert Page
        </button>
        <button type="button" class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-content hover:bg-app-bg" @click="step = 'new-page'">
          <FilePlus class="h-5 w-5 text-accent" />
          New Page
        </button>
        <button type="button" class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-content hover:bg-app-bg" @click="emit('new-link')">
          <Link2 class="h-5 w-5 text-accent" />
          New Link
        </button>
        <button type="button" class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-content hover:bg-app-bg" @click="emit('new-menu')">
          <FolderPlus class="h-5 w-5 text-accent" />
          New Menu
        </button>
      </div>

      <form v-else class="p-6" @submit.prevent="submitNewPage">
        <label class="block">
          <span class="text-sm font-medium text-content">Title</span>
          <input
            v-model="title"
            type="text"
            autofocus
            placeholder="Page title"
            class="mt-1 w-full rounded-xl border border-theme-border px-4 py-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <div class="mt-6 flex justify-end gap-3">
          <button type="button" class="rounded-full border border-theme-border px-5 py-2.5 text-sm font-medium text-content-muted hover:bg-app-bg" @click="step = 'menu'">Back</button>
          <button type="submit" class="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90" :disabled="!title.trim()">Create</button>
        </div>
      </form>
    </div>
  </div>
</template>
