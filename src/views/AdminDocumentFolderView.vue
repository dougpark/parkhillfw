<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Check, Copy, Eye, FileText, Image as ImageIcon, Pencil, RefreshCw, Trash2, Upload } from 'lucide-vue-next';
import { formatFileSize } from '../composables/useDocumentLibrary';
import DocumentLinkModal from '../components/documents/DocumentLinkModal.vue';

interface DocumentRow {
    id: number;
    folderId: number;
    filename: string;
    name: string | null;
    description: string | null;
    mimeType: string;
    sizeBytes: number;
    isDraft: boolean;
    createdAt: string;
}

const props = defineProps<{ folderId: number; folderName: string }>();
const emit = defineEmits<{ done: [] }>();

const documents = ref<DocumentRow[]>([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const uploading = ref(false);
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const replaceInput = ref<HTMLInputElement | null>(null);
const replaceTargetId = ref<number | null>(null);
const conflict = ref<{ file: File; existingDocumentId: number; existingName: string } | null>(null);
const editTarget = ref<DocumentRow | null>(null);
const editName = ref('');
const editDescription = ref('');
const deleteTarget = ref<DocumentRow | null>(null);
const deleting = ref(false);
const previewId = ref<number | null>(null);
const copiedId = ref<number | null>(null);

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return documents.value;
    return documents.value.filter((d) => displayName(d).toLowerCase().includes(q));
});

function displayName(document: DocumentRow): string {
    return document.name?.trim() || document.filename;
}

function markdownLink(document: DocumentRow): string {
    return `[${displayName(document)}](${window.location.origin}/library/documents/${document.id})`;
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch(`/api/admin/document-folders/${props.folderId}/documents`);
    if (res.ok) documents.value = (await res.json()) as DocumentRow[];
    else error.value = 'Could not load documents.';
    loading.value = false;
}

async function uploadFile(file: File, replace = false): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    const url = `/api/admin/document-folders/${props.folderId}/documents${replace ? '?replace=true' : ''}`;
    const res = await fetch(url, { method: 'POST', body: formData });
    if (res.status === 409) {
        const body = (await res.json()) as { existingDocumentId: number };
        conflict.value = { file, existingDocumentId: body.existingDocumentId, existingName: file.name };
        return;
    }
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        error.value = body.error ?? `Upload failed for ${file.name}.`;
        return;
    }
    await load();
}

async function uploadFiles(files: FileList | File[]): Promise<void> {
    uploading.value = true;
    error.value = '';
    for (const file of [...files]) {
        await uploadFile(file);
    }
    uploading.value = false;
}

async function confirmReplaceConflict(): Promise<void> {
    if (!conflict.value) return;
    uploading.value = true;
    await uploadFile(conflict.value.file, true);
    uploading.value = false;
    conflict.value = null;
}

function onDrop(event: DragEvent): void {
    dragOver.value = false;
    if (event.dataTransfer?.files.length) void uploadFiles(event.dataTransfer.files);
}

function onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void uploadFiles(input.files);
    input.value = '';
}

function startReplace(document: DocumentRow): void {
    replaceTargetId.value = document.id;
    replaceInput.value?.click();
}

async function onReplacePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !replaceTargetId.value) return;
    uploading.value = true;
    error.value = '';
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/admin/documents/${replaceTargetId.value}/replace`, { method: 'PUT', body: formData });
    uploading.value = false;
    replaceTargetId.value = null;
    if (res.ok) await load();
    else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        error.value = body.error ?? 'Could not replace the document.';
    }
}

function startEdit(document: DocumentRow): void {
    editTarget.value = document;
    editName.value = displayName(document);
    editDescription.value = document.description ?? '';
}

async function saveEdit(): Promise<void> {
    if (!editTarget.value) return;
    const res = await fetch(`/api/admin/documents/${editTarget.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: editName.value,
            description: editDescription.value,
            isDraft: editTarget.value.isDraft,
        }),
    });
    if (res.ok) {
        editTarget.value = null;
        await load();
    } else {
        error.value = 'Could not save changes.';
    }
}

async function togglePublish(document: DocumentRow): Promise<void> {
    const res = await fetch(`/api/admin/documents/${document.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: document.name, description: document.description, isDraft: !document.isDraft }),
    });
    if (res.ok) await load();
    else error.value = 'Could not update publish status.';
}

async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;
    deleting.value = true;
    const res = await fetch(`/api/admin/attachments/${deleteTarget.value.id}`, { method: 'DELETE' });
    deleting.value = false;
    deleteTarget.value = null;
    if (res.ok) await load();
    else error.value = 'Could not delete the document.';
}

async function copyLink(document: DocumentRow): Promise<void> {
    await navigator.clipboard.writeText(markdownLink(document));
    copiedId.value = document.id;
    setTimeout(() => {
        if (copiedId.value === document.id) copiedId.value = null;
    }, 1500);
}

onMounted(load);
</script>

<template>
  <button
    type="button"
    class="mb-4 rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
    @click="emit('done')"
  >
    ← Document Folders
  </button>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 class="text-xl font-semibold">{{ folderName }}</h3>
      <p class="mt-1 text-sm text-content-muted">Upload, search, and manage documents in this folder.</p>
    </div>
    <button
      type="button"
      class="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
      :disabled="uploading"
      @click="fileInput?.click()"
    >
      <Upload class="h-4 w-4" />
      {{ uploading ? 'Uploading…' : 'Upload' }}
    </button>
    <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePicked" />
    <input ref="replaceInput" type="file" class="hidden" @change="onReplacePicked" />
  </div>

  <input
    v-model="search"
    type="search"
    placeholder="Search documents by name…"
    class="mt-4 w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
  />

  <div
    class="mt-3 rounded-xl border border-dashed p-4 text-center text-sm text-content-muted transition-colors"
    :class="dragOver ? 'border-accent bg-accent/10' : 'border-theme-border bg-surface-subtle'"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onDrop"
  >
    <p>Drag and drop files here, or use Upload.</p>
    <p class="mt-1 text-xs text-content-muted/70">PDF or images (PNG, JPEG, GIF, WebP) — up to 20 MB. MS Office files must be saved as PDF first.</p>
  </div>

  <p v-if="error" class="mt-3 text-sm text-danger">{{ error }}</p>
  <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading documents…</p>

  <ul v-else-if="filtered.length" class="mt-4 divide-y divide-theme-border rounded-2xl border border-theme-border bg-surface">
    <li v-for="document in filtered" :key="document.id" class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <ImageIcon v-if="document.mimeType.startsWith('image/')" class="h-6 w-6 shrink-0 text-content-muted" />
      <FileText v-else class="h-6 w-6 shrink-0 text-content-muted" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{{ displayName(document) }}</p>
        <p class="text-xs text-content-muted">
          {{ document.mimeType }} · {{ formatFileSize(document.sizeBytes) }}
          <span :class="document.isDraft ? 'text-amber-600' : 'text-green-600'"> · {{ document.isDraft ? 'Draft' : 'Published' }}</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" title="Preview" class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent" @click="previewId = document.id">
          <Eye class="h-4 w-4" />
        </button>
        <button type="button" title="Rename / edit" class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent" @click="startEdit(document)">
          <Pencil class="h-4 w-4" />
        </button>
        <button type="button" title="Replace file" class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent" @click="startReplace(document)">
          <RefreshCw class="h-4 w-4" />
        </button>
        <button
          type="button"
          :title="copiedId === document.id ? 'Copied!' : 'Copy markdown link'"
          class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
          @click="copyLink(document)"
        >
          <Check v-if="copiedId === document.id" class="h-4 w-4 text-green-600" />
          <Copy v-else class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="rounded-full border border-theme-border px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-app-bg"
          @click="togglePublish(document)"
        >
          {{ document.isDraft ? 'Publish' : 'Unpublish' }}
        </button>
        <button type="button" title="Delete document" class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-danger-subtle hover:text-danger" @click="deleteTarget = document">
          <Trash2 class="h-4 w-4" />
        </button>
      </div>
    </li>
  </ul>
  <p v-else class="mt-6 rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-6 text-center text-sm text-content-muted">
    No documents match. Upload a file to get started.
  </p>

  <DocumentLinkModal v-if="previewId" kind="document" :id="previewId" @close="previewId = null" />

  <div v-if="conflict" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="conflict = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Replace existing file?</h4>
      <p class="mt-2 text-sm text-content-muted">A document named "{{ conflict.existingName }}" already exists in this folder. Replace it with the new upload?</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="conflict = null">Cancel</button>
        <button type="button" class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90" @click="confirmReplaceConflict">Replace</button>
      </div>
    </div>
  </div>

  <div v-if="editTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="editTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Edit document</h4>
      <label class="mt-4 block text-xs font-medium text-content-muted">Display name</label>
      <input v-model="editName" type="text" class="mt-1 w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
      <label class="mt-4 block text-xs font-medium text-content-muted">Description</label>
      <textarea v-model="editDescription" rows="3" class="mt-1 w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent" />
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="editTarget = null">Cancel</button>
        <button type="button" class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90" @click="saveEdit">Save</button>
      </div>
    </div>
  </div>

  <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="deleteTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Delete "{{ displayName(deleteTarget) }}"?</h4>
      <p class="mt-2 text-sm text-content-muted">This cannot be undone. Any markdown links to it will break.</p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="deleteTarget = null">Cancel</button>
        <button type="button" :disabled="deleting" class="rounded-full bg-danger px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50" @click="confirmDelete">Delete</button>
      </div>
    </div>
  </div>
</template>
