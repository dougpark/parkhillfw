<script setup lang="ts">
import { ref, watch } from 'vue';
import { Download, Eye, File, X } from 'lucide-vue-next';
import {
    fetchLibraryDocument,
    fetchLibraryFolder,
    formatFileSize,
    isInlineViewable,
    type LibraryDocument,
    type LibraryDocumentDetail,
    type LibraryFolder,
} from '../../composables/useDocumentLibrary';

// Renders the "click a folder link -> list of documents" and "click a document
// link -> view or download" behavior from docs/documents.md. Reused by
// MarkdownPreview's click-interceptor and by the /library/... fallback routes.
const props = defineProps<{ kind: 'document' | 'folder'; id: number }>();
const emit = defineEmits<{ close: [] }>();

const loading = ref(true);
const error = ref('');
const folder = ref<LibraryFolder | null>(null);
const document = ref<LibraryDocumentDetail | null>(null);
const viewing = ref<LibraryDocumentDetail | null>(null);

async function loadDocument(id: number): Promise<LibraryDocumentDetail | null> {
    const detail = await fetchLibraryDocument(id);
    if (!detail) error.value = 'This document is not available.';
    return detail;
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    folder.value = null;
    document.value = null;
    viewing.value = null;

    if (props.kind === 'folder') {
        const result = await fetchLibraryFolder(props.id);
        if (!result) error.value = 'This folder is not available.';
        else folder.value = result;
    } else {
        document.value = await loadDocument(props.id);
        viewing.value = document.value;
    }
    loading.value = false;
}

async function openDocument(row: LibraryDocument): Promise<void> {
    error.value = '';
    viewing.value = await loadDocument(row.id);
}

watch(() => [props.kind, props.id], load, { immediate: true });
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4" @click.self="emit('close')">
    <div class="flex h-full w-full max-w-2xl flex-col bg-surface p-6 shadow-xl sm:h-auto sm:max-h-[85vh] sm:rounded-3xl">
      <div class="flex items-center justify-between">
        <h4 class="text-lg font-semibold">{{ folder?.folder.name ?? viewing?.name ?? 'Document' }}</h4>
        <button
          type="button"
          title="Close"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-app-bg"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <p v-if="loading" class="py-8 text-center text-sm text-content-muted">Loading…</p>
      <p v-else-if="error" class="py-8 text-center text-sm text-danger">{{ error }}</p>

      <!-- Folder: list of documents -->
      <template v-else-if="folder && !viewing">
        <p v-if="folder.folder.description" class="mt-1 text-sm text-content-muted">{{ folder.folder.description }}</p>
        <p v-if="!folder.documents.length" class="mt-6 text-center text-sm text-content-muted">This folder has no documents yet.</p>
        <ul v-else class="mt-4 min-h-0 flex-1 divide-y divide-theme-border overflow-y-auto">
          <li v-for="row in folder.documents" :key="row.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 py-3 text-left hover:bg-app-bg"
              @click="openDocument(row)"
            >
              <File class="h-5 w-5 shrink-0 text-content-muted" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ row.name }}</p>
                <p class="text-xs text-content-muted">{{ formatFileSize(row.sizeBytes) }}</p>
              </div>
            </button>
          </li>
        </ul>
      </template>

      <!-- Document: view (inline) or download prompt -->
      <template v-else-if="viewing">
        <button
          v-if="folder"
          type="button"
          class="mt-2 self-start text-sm font-medium text-accent hover:opacity-80"
          @click="viewing = null"
        >
          ← Back to {{ folder.folder.name }}
        </button>
        <p class="mt-2 text-xs text-content-muted">{{ formatFileSize(viewing.sizeBytes) }}</p>

        <div class="mt-4 flex flex-wrap gap-2">
          <a
            v-if="isInlineViewable(viewing.mimeType)"
            :href="viewing.url"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
          >
            <Eye class="h-4 w-4" /> View
          </a>
          <a
            :href="viewing.url"
            download
            class="flex items-center gap-2 rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg"
          >
            <Download class="h-4 w-4" /> Download
          </a>
        </div>

        <div v-if="isInlineViewable(viewing.mimeType)" class="mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-theme-border">
          <img v-if="viewing.mimeType.startsWith('image/')" :src="viewing.url" :alt="viewing.name" class="max-h-[60vh] w-full object-contain" />
          <iframe v-else :src="viewing.url" :title="viewing.name" class="h-[60vh] w-full" />
        </div>
      </template>
    </div>
  </div>
</template>
