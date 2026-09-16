<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Check, Copy, FileText, Folder, FolderSearch, Images, Trash2, Upload, X } from 'lucide-vue-next';
import { formatFileSize } from '../../composables/useDocumentLibrary';

interface Attachment {
    id: number;
    r2Key: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
}

interface LibraryDocumentRow {
    id: number;
    folderId: number;
    filename: string;
    name: string | null;
    mimeType: string;
    sizeBytes: number;
}

interface LibraryFolderRow {
    id: number;
    name: string;
    documentCount: number;
}

const props = defineProps<{ pageId: number }>();
const emit = defineEmits<{ insert: [snippet: string] }>();

const attachments = ref<Attachment[]>([]);
const uploading = ref(false);
const error = ref('');
const dragOver = ref(false);
const copiedId = ref<number | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const showLibrary = ref(false);
const libraryImages = ref<Attachment[]>([]);
const libraryLoading = ref(false);

function fileUrl(attachment: Attachment): string {
    return `/api/files/${attachment.r2Key}`;
}

function snippetFor(attachment: Attachment): string {
    const url = fileUrl(attachment);
    return attachment.mimeType.startsWith('image/')
        ? `![${attachment.filename}](${url}){width=300 class="img-rounded"}`
        : `[${attachment.filename}](${url})`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function load(): Promise<void> {
    const res = await fetch(`/api/admin/pages/${props.pageId}/attachments`);
    if (res.ok) attachments.value = (await res.json()) as Attachment[];
}

async function upload(files: FileList | File[]): Promise<void> {
    uploading.value = true;
    error.value = '';
    for (const file of [...files]) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/admin/pages/${props.pageId}/attachments`, { method: 'POST', body: formData });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            error.value = body.error ?? `Upload failed for ${file.name}.`;
        }
    }
    uploading.value = false;
    await load();
}

async function remove(attachment: Attachment): Promise<void> {
    if (!window.confirm(`Delete ${attachment.filename}? Any markdown links to it will break.`)) return;
    const res = await fetch(`/api/admin/attachments/${attachment.id}`, { method: 'DELETE' });
    if (res.ok) await load();
    else error.value = 'Could not delete the attachment.';
}

async function copySnippet(attachment: Attachment): Promise<void> {
    await navigator.clipboard.writeText(snippetFor(attachment));
    copiedId.value = attachment.id;
    setTimeout(() => {
        if (copiedId.value === attachment.id) copiedId.value = null;
    }, 1500);
}

function onDrop(event: DragEvent): void {
    dragOver.value = false;
    if (event.dataTransfer?.files.length) void upload(event.dataTransfer.files);
}

function onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void upload(input.files);
    input.value = '';
}

async function openLibrary(): Promise<void> {
    showLibrary.value = true;
    libraryLoading.value = true;
    const res = await fetch('/api/admin/attachments/images');
    if (res.ok) {
        // Exclude images already attached to this page.
        const currentKeys = new Set(attachments.value.map((a) => a.r2Key));
        libraryImages.value = ((await res.json()) as Attachment[]).filter((a) => !currentKeys.has(a.r2Key));
    }
    libraryLoading.value = false;
}

function pickLibraryImage(image: Attachment): void {
    emit('insert', snippetFor(image));
    showLibrary.value = false;
}

const showDocLibrary = ref(false);
const docLibraryLoading = ref(false);
const docSearch = ref('');
const docTypeFilter = ref<'' | 'pdf' | 'image'>('');
const libraryDocuments = ref<LibraryDocumentRow[]>([]);
const libraryFolders = ref<LibraryFolderRow[]>([]);

function libraryDocName(document: LibraryDocumentRow): string {
    return document.name?.trim() || document.filename;
}

async function searchLibraryDocuments(): Promise<void> {
    docLibraryLoading.value = true;
    const params = new URLSearchParams();
    if (docSearch.value.trim()) params.set('q', docSearch.value.trim());
    if (docTypeFilter.value) params.set('type', docTypeFilter.value);
    const res = await fetch(`/api/admin/documents/search?${params.toString()}`);
    if (res.ok) libraryDocuments.value = (await res.json()) as LibraryDocumentRow[];
    docLibraryLoading.value = false;
}

async function openDocLibrary(): Promise<void> {
    showDocLibrary.value = true;
    docLibraryLoading.value = true;
    const foldersRes = await fetch('/api/admin/document-folders');
    if (foldersRes.ok) libraryFolders.value = (await foldersRes.json()) as LibraryFolderRow[];
    await searchLibraryDocuments();
}

function insertDocumentLink(document: LibraryDocumentRow): void {
    emit('insert', `[${libraryDocName(document)}](/library/documents/${document.id})`);
    showDocLibrary.value = false;
}

function insertFolderLink(folder: LibraryFolderRow): void {
    emit('insert', `[${folder.name}](/library/folders/${folder.id})`);
    showDocLibrary.value = false;
}

onMounted(load);
defineExpose({ load });
</script>

<template>
  <section class="rounded-xl border border-theme-border bg-surface p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 class="text-sm font-semibold">Attachments</h4>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-2 rounded-full border border-theme-border bg-surface px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
          @click="openLibrary"
        >
          <Images class="h-4 w-4" />
          Browse images
        </button>
        <button
          type="button"
          class="flex items-center gap-2 rounded-full border border-theme-border bg-surface px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
          @click="openDocLibrary"
        >
          <FolderSearch class="h-4 w-4" />
          Document library
        </button>
        <button
          type="button"
          class="flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-80"
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          <Upload class="h-4 w-4" />
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
      </div>
      <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePicked" />
    </div>

    <div
      class="mt-3 rounded-xl border border-dashed p-4 text-center text-sm text-content-muted transition-colors"
      :class="dragOver ? 'border-accent bg-accent/10' : 'border-theme-border bg-surface-subtle'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <p>Drag and drop files here, paste images into the editor, or use Upload.</p>
      <p class="mt-1 text-xs text-content-muted/70">
        Allowed: images (PNG, JPEG, GIF, WebP, SVG), PDF, text, Markdown, CSV, ZIP — up to 10 MB each.
      </p>
    </div>

    <p v-if="error" class="mt-2 text-sm text-danger">{{ error }}</p>

    <ul v-if="attachments.length" class="mt-3 divide-y divide-theme-border">
      <li v-for="attachment in attachments" :key="attachment.id" class="flex items-center gap-3 py-2">
        <img
          v-if="attachment.mimeType.startsWith('image/')"
          :src="fileUrl(attachment)"
          :alt="attachment.filename"
          class="h-10 w-10 shrink-0 rounded-lg border border-theme-border object-cover"
        />
        <FileText v-else class="h-6 w-6 shrink-0 text-content-muted" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ attachment.filename }}</p>
          <p class="text-xs text-content-muted">{{ attachment.mimeType }} · {{ formatSize(attachment.sizeBytes) }}</p>
        </div>
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
          @click="emit('insert', snippetFor(attachment))"
        >
          Insert
        </button>
        <button
          type="button"
          :title="copiedId === attachment.id ? 'Copied!' : 'Copy markdown link'"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-app-bg hover:text-accent"
          @click="copySnippet(attachment)"
        >
          <Check v-if="copiedId === attachment.id" class="h-4 w-4 text-green-600" />
          <Copy v-else class="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Delete attachment"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-danger-subtle hover:text-danger"
          @click="remove(attachment)"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </li>
    </ul>
    <p v-else class="mt-3 text-sm text-content-muted">No attachments yet.</p>

    <div v-if="showLibrary" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4" @click.self="showLibrary = false">
      <div class="flex h-full w-full max-w-2xl flex-col bg-surface p-6 shadow-xl sm:h-auto sm:max-h-[80vh] sm:rounded-3xl">
        <div class="flex items-center justify-between">
          <h4 class="text-lg font-semibold">Image library</h4>
          <button
            type="button"
            title="Close"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-app-bg"
            @click="showLibrary = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <p class="mt-1 text-sm text-content-muted">Pick an image uploaded for any page to insert its link here. Newest first.</p>

        <p v-if="libraryLoading" class="py-8 text-center text-sm text-content-muted">Loading images…</p>
        <p v-else-if="!libraryImages.length" class="py-8 text-center text-sm text-content-muted">No other images have been uploaded yet.</p>
        <div v-else class="mt-4 min-h-0 flex-1 overflow-y-auto">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <button
              v-for="image in libraryImages"
              :key="image.id"
              type="button"
              class="group overflow-hidden rounded-xl border border-theme-border bg-surface text-left transition-shadow hover:shadow-md"
              :title="`Insert ${image.filename}`"
              @click="pickLibraryImage(image)"
            >
              <img :src="fileUrl(image)" :alt="image.filename" class="h-24 w-full bg-app-bg object-cover sm:h-28" loading="lazy" />
              <span class="block truncate px-2 py-1.5 text-xs text-content-muted group-hover:text-accent">{{ image.filename }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showDocLibrary" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4" @click.self="showDocLibrary = false">
      <div class="flex h-full w-full max-w-2xl flex-col bg-surface p-6 shadow-xl sm:h-auto sm:max-h-[80vh] sm:rounded-3xl">
        <div class="flex items-center justify-between">
          <h4 class="text-lg font-semibold">Document library</h4>
          <button
            type="button"
            title="Close"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-app-bg"
            @click="showDocLibrary = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <p class="mt-1 text-sm text-content-muted">Insert a link to a document, or to a whole folder (visitors see a list of its documents).</p>

        <div v-if="libraryFolders.length" class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="folder in libraryFolders"
            :key="folder.id"
            type="button"
            class="flex items-center gap-1.5 rounded-full border border-theme-border px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-app-bg hover:text-accent"
            :title="`Insert folder link for ${folder.name}`"
            @click="insertFolderLink(folder)"
          >
            <Folder class="h-3.5 w-3.5" />
            {{ folder.name }} ({{ folder.documentCount }})
          </button>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <input
            v-model="docSearch"
            type="search"
            placeholder="Search documents by name…"
            class="min-w-0 flex-1 rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            @keyup.enter="searchLibraryDocuments"
          />
          <select
            v-model="docTypeFilter"
            class="rounded-xl border border-theme-border bg-surface px-3 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            @change="searchLibraryDocuments"
          >
            <option value="">All types</option>
            <option value="pdf">PDF</option>
            <option value="image">Images</option>
          </select>
          <button
            type="button"
            class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg"
            @click="searchLibraryDocuments"
          >
            Search
          </button>
        </div>

        <p v-if="docLibraryLoading" class="py-8 text-center text-sm text-content-muted">Loading documents…</p>
        <p v-else-if="!libraryDocuments.length" class="py-8 text-center text-sm text-content-muted">No documents match.</p>
        <ul v-else class="mt-3 min-h-0 flex-1 divide-y divide-theme-border overflow-y-auto">
          <li v-for="document in libraryDocuments" :key="document.id" class="flex items-center gap-3 py-2">
            <FileText class="h-5 w-5 shrink-0 text-content-muted" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ libraryDocName(document) }}</p>
              <p class="text-xs text-content-muted">{{ document.mimeType }} · {{ formatFileSize(document.sizeBytes) }}</p>
            </div>
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
              @click="insertDocumentLink(document)"
            >
              Insert
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
