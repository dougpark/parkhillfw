<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue';
import { Check, Copy, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-vue-next';

const AdminDocumentFolderView = defineAsyncComponent(() => import('./AdminDocumentFolderView.vue'));

interface FolderRow {
    id: number;
    name: string;
    description: string | null;
    documentCount: number;
}

const emit = defineEmits<{ exit: [] }>();

const folders = ref<FolderRow[]>([]);
const loading = ref(true);
const error = ref('');
const selectedFolder = ref<FolderRow | null>(null);
const renameTarget = ref<FolderRow | null>(null);
const renameName = ref('');
const renameDescription = ref('');
const deleteTarget = ref<FolderRow | null>(null);
const deleting = ref(false);
const creating = ref(false);
const newFolderName = ref('');
const copiedId = ref<number | null>(null);

async function copyFolderLink(folder: FolderRow): Promise<void> {
    const url = `${window.location.origin}/library/folders/${folder.id}`;
    await navigator.clipboard.writeText(`[${folder.name}](${url})`);
    copiedId.value = folder.id;
    setTimeout(() => {
        if (copiedId.value === folder.id) copiedId.value = null;
    }, 1500);
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch('/api/admin/document-folders');
    if (res.ok) folders.value = (await res.json()) as FolderRow[];
    else error.value = 'Could not load document folders.';
    loading.value = false;
}

async function createFolder(): Promise<void> {
    const name = newFolderName.value.trim();
    if (!name) return;
    creating.value = true;
    error.value = '';
    const res = await fetch('/api/admin/document-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    creating.value = false;
    if (res.ok) {
        newFolderName.value = '';
        await load();
    } else {
        error.value = 'Could not create the folder.';
    }
}

function startRename(folder: FolderRow): void {
    renameTarget.value = folder;
    renameName.value = folder.name;
    renameDescription.value = folder.description ?? '';
}

async function confirmRename(): Promise<void> {
    if (!renameTarget.value) return;
    const name = renameName.value.trim();
    if (!name) return;
    const res = await fetch(`/api/admin/document-folders/${renameTarget.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: renameDescription.value }),
    });
    if (res.ok) {
        renameTarget.value = null;
        await load();
    } else {
        error.value = 'Could not save the folder.';
    }
}

async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;
    deleting.value = true;
    const res = await fetch(`/api/admin/document-folders/${deleteTarget.value.id}`, { method: 'DELETE' });
    deleting.value = false;
    deleteTarget.value = null;
    if (res.ok) await load();
    else error.value = 'Could not delete the folder.';
}

function openFolder(folder: FolderRow): void {
    selectedFolder.value = folder;
}

function onFolderDone(): void {
    selectedFolder.value = null;
    void load();
}

onMounted(load);
</script>

<template>
  <button
    type="button"
    class="mb-4 rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
    @click="selectedFolder ? (selectedFolder = null) : emit('exit')"
  >
    ← {{ selectedFolder ? 'Document Folders' : 'Admin menu' }}
  </button>

  <AdminDocumentFolderView
    v-if="selectedFolder"
    :folder-id="selectedFolder.id"
    :folder-name="selectedFolder.name"
    @done="onFolderDone"
  />

  <div v-else>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-xl font-semibold">Document Library</h3>
        <p class="mt-1 text-sm text-content-muted">A simple document archive. Documents live in single-level folders that can be linked from Pages.</p>
      </div>
    </div>

    <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="createFolder">
      <input
        v-model="newFolderName"
        type="text"
        placeholder="New folder name"
        class="min-w-0 flex-1 rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
      />
      <button
        type="submit"
        :disabled="creating || !newFolderName.trim()"
        class="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <FolderPlus class="h-4 w-4" />
        New folder
      </button>
    </form>

    <p v-if="error" class="mt-4 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading folders…</p>

    <div v-else-if="folders.length" class="mt-6 overflow-hidden rounded-2xl border border-theme-border bg-surface">
      <div
        v-for="folder in folders"
        :key="folder.id"
        class="flex flex-col gap-3 border-b border-theme-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:px-5"
      >
        <button type="button" class="min-w-0 text-left sm:flex-1" @click="openFolder(folder)">
          <p class="truncate font-medium">{{ folder.name }}</p>
          <p class="mt-0.5 text-xs text-content-muted">
            {{ folder.documentCount }} document{{ folder.documentCount === 1 ? '' : 's' }}
          </p>
        </button>
        <div class="flex items-center gap-2">
          <button
            type="button"
            title="Open folder"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
            @click="openFolder(folder)"
          >
            <FolderOpen class="h-4 w-4" />
          </button>
          <button
            type="button"
            :title="copiedId === folder.id ? 'Copied!' : 'Copy folder link'"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
            @click="copyFolderLink(folder)"
          >
            <Check v-if="copiedId === folder.id" class="h-4 w-4 text-green-600" />
            <Copy v-else class="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Rename folder"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
            @click="startRename(folder)"
          >
            <Pencil class="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Delete folder"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-danger-subtle hover:text-danger"
            @click="deleteTarget = folder"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="mt-6 rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-6 text-center text-sm text-content-muted">
      No document folders yet. Create one to start uploading documents.
    </p>
  </div>

  <div v-if="renameTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="renameTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Edit folder</h4>
      <label class="mt-4 block text-xs font-medium text-content-muted">Name</label>
      <input
        v-model="renameName"
        type="text"
        class="mt-1 w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        @keyup.enter="confirmRename"
      />
      <label class="mt-4 block text-xs font-medium text-content-muted">Description</label>
      <textarea
        v-model="renameDescription"
        rows="2"
        class="mt-1 w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
      />
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="renameTarget = null">Cancel</button>
        <button type="button" class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90" @click="confirmRename">Save</button>
      </div>
    </div>
  </div>

  <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="deleteTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Delete "{{ deleteTarget.name }}"?</h4>
      <p class="mt-2 text-sm text-content-muted">
        This deletes all {{ deleteTarget.documentCount }} document{{ deleteTarget.documentCount === 1 ? '' : 's' }} in this folder. This cannot be undone.
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="deleteTarget = null">Cancel</button>
        <button
          type="button"
          :disabled="deleting"
          class="rounded-full bg-danger px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
          @click="confirmDelete"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
