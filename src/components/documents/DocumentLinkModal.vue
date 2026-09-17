<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Download, File, X } from 'lucide-vue-next';
import VuePdfEmbed, { GlobalWorkerOptions } from 'vue-pdf-embed/dist/index.essential.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
    fetchLibraryDocument,
    fetchLibraryFolder,
    formatFileSize,
    type LibraryDocument,
    type LibraryDocumentDetail,
    type LibraryFolder,
} from '../../composables/useDocumentLibrary';

// Renders the "click a folder link -> list of documents" and "click a document
// link -> view or download" behavior from docs/documents.md. Reused by
// MarkdownPreview's click-interceptor and by the /library/... fallback routes.
// The default blob-URL worker relies on nested dynamic import() inside a module
// worker, which Safari doesn't support reliably — load a real hosted worker instead.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const props = defineProps<{ kind: 'document' | 'folder'; id: number }>();
const emit = defineEmits<{ close: [] }>();

const loading = ref(true);
const error = ref('');
const folder = ref<LibraryFolder | null>(null);
const document = ref<LibraryDocumentDetail | null>(null);
const viewing = ref<LibraryDocumentDetail | null>(null);
const pdfEmbedRef = ref<InstanceType<typeof VuePdfEmbed> | null>(null);
const pdfLoading = ref(true);
const pdfError = ref('');

const isPdf = computed(() => viewing.value?.mimeType === 'application/pdf');
const isImage = computed(() => viewing.value?.mimeType.startsWith('image/') ?? false);
const isFullPanel = computed(() => isPdf.value || isImage.value);

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
    pdfLoading.value = true;
    pdfError.value = '';
    viewing.value = await loadDocument(row.id);
}

function downloadPdf(): void {
    if (!viewing.value) return;
    const filename = viewing.value.name.toLowerCase().endsWith('.pdf') ? viewing.value.name : `${viewing.value.name}.pdf`;
    pdfEmbedRef.value?.download(filename);
}

// Surfaces the real pdf.js error instead of a generic message, since the
// underlying cause (worker/CORS/format issues) varies a lot by browser.
function onPdfFailed(message: string, err: unknown): void {
    console.error('[pdf-viewer]', err);
    const detail = err instanceof Error ? err.message : String(err ?? '');
    pdfError.value = detail ? `${message} (${detail})` : message;
}

watch(() => [props.kind, props.id], load, { immediate: true });
watch(viewing, () => {
    pdfLoading.value = true;
    pdfError.value = '';
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4" @click.self="emit('close')">
      <div
        class="flex h-full w-full flex-col bg-surface p-6 shadow-xl sm:h-auto sm:rounded-3xl"
        :class="isFullPanel ? 'max-w-5xl sm:max-h-[92vh]' : 'max-w-2xl sm:max-h-[85vh]'"
      >
      <div class="flex items-center justify-between">
        <h4 class="min-w-0 truncate text-lg font-semibold">{{ folder?.folder.name ?? viewing?.name ?? 'Document' }}</h4>
        <div class="flex shrink-0 items-center gap-1">
          <button
            v-if="isPdf && !pdfLoading && !pdfError"
            type="button"
            title="Download"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-app-bg"
            @click="downloadPdf"
          >
            <Download class="h-4 w-4" />
          </button>
          <a
            v-else-if="isImage"
            :href="viewing!.url"
            download
            title="Download"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-app-bg"
          >
            <Download class="h-4 w-4" />
          </a>
          <button
            type="button"
            title="Close"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-app-bg"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
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

      <!-- PDF: straight to a full-panel viewer, no interim view/download choice -->
      <template v-else-if="viewing && isPdf">
        <button
          v-if="folder"
          type="button"
          class="mt-2 self-start text-sm font-medium text-accent hover:opacity-80"
          @click="viewing = null"
        >
          ← Back to {{ folder.folder.name }}
        </button>
        <p v-if="pdfError" class="py-8 text-center text-sm text-danger">{{ pdfError }}</p>
        <div v-show="!pdfError" class="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-theme-border bg-app-bg p-2">
          <p v-if="pdfLoading" class="py-8 text-center text-sm text-content-muted">Loading document…</p>
          <VuePdfEmbed
            ref="pdfEmbedRef"
            :source="viewing.url"
            class="mx-auto"
            @loaded="pdfLoading = false"
            @loading-failed="(err: unknown) => onPdfFailed('This document could not be loaded.', err)"
            @rendering-failed="(err: unknown) => onPdfFailed('This document could not be rendered.', err)"
          />
        </div>
      </template>

      <!-- Image: straight to a full-panel preview, no interim view/download choice -->
      <template v-else-if="viewing && isImage">
        <button
          v-if="folder"
          type="button"
          class="mt-2 self-start text-sm font-medium text-accent hover:opacity-80"
          @click="viewing = null"
        >
          ← Back to {{ folder.folder.name }}
        </button>
        <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-theme-border bg-app-bg p-2">
          <img :src="viewing.url" :alt="viewing.name" class="mx-auto h-full max-h-full w-auto object-contain" />
        </div>
      </template>

      <!-- Other file types: no inline preview available, just a download prompt -->
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
            :href="viewing.url"
            download
            class="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
          >
            <Download class="h-4 w-4" /> Download
          </a>
        </div>
      </template>
    </div>
  </div>
  </Teleport>
</template>
