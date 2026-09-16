<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { defineAsyncComponent } from 'vue';
import { FolderPlus, Images, Pencil, Trash2 } from 'lucide-vue-next';

const AdminPhotoEventsView = defineAsyncComponent(() => import('./AdminPhotoEventsView.vue'));

interface FolderRow {
    id: number;
    name: string;
    slug: string;
    displayOrder: number;
    eventCount: number;
}

const emit = defineEmits<{ exit: [] }>();

const folders = ref<FolderRow[]>([]);
const loading = ref(true);
const error = ref('');
const selectedFolder = ref<FolderRow | null>(null);
const renameTarget = ref<FolderRow | null>(null);
const renameValue = ref('');
const deleteTarget = ref<FolderRow | null>(null);
const deleting = ref(false);
const creating = ref(false);
const newFolderName = ref('');

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch('/api/admin/photo-folders');
    if (res.ok) folders.value = (await res.json()) as FolderRow[];
    else error.value = 'Could not load photo folders.';
    loading.value = false;
}

async function createFolder(): Promise<void> {
    const name = newFolderName.value.trim();
    if (!name) return;
    creating.value = true;
    error.value = '';
    const res = await fetch('/api/admin/photo-folders', {
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
    renameValue.value = folder.name;
}

async function confirmRename(): Promise<void> {
    if (!renameTarget.value) return;
    const name = renameValue.value.trim();
    if (!name) return;
    const res = await fetch(`/api/admin/photo-folders/${renameTarget.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    });
    if (res.ok) {
        renameTarget.value = null;
        await load();
    } else {
        error.value = 'Could not rename the folder.';
    }
}

async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;
    deleting.value = true;
    const res = await fetch(`/api/admin/photo-folders/${deleteTarget.value.id}`, { method: 'DELETE' });
    deleting.value = false;
    deleteTarget.value = null;
    if (res.ok) await load();
    else error.value = 'Could not delete the folder.';
}

function openFolder(folder: FolderRow): void {
    selectedFolder.value = folder;
}

function onEventsDone(): void {
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
    ← {{ selectedFolder ? 'Photo Folders' : 'Admin menu' }}
  </button>

  <AdminPhotoEventsView
    v-if="selectedFolder"
    :folder-id="selectedFolder.id"
    :folder-name="selectedFolder.name"
    @done="onEventsDone"
  />

  <div v-else>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-xl font-semibold">Photo Folders</h3>
        <p class="mt-1 text-sm text-content-muted">Organize gallery events into folders. Photos live inside events.</p>
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
            {{ folder.eventCount }} event{{ folder.eventCount === 1 ? '' : 's' }}
          </p>
        </button>
        <div class="flex items-center gap-2">
          <button
            type="button"
            title="Open folder"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
            @click="openFolder(folder)"
          >
            <Images class="h-4 w-4" />
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
      No photo folders yet. Create one to start uploading event photos.
    </p>
  </div>

  <div v-if="renameTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="renameTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Rename folder</h4>
      <input
        v-model="renameValue"
        type="text"
        class="mt-4 w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        @keyup.enter="confirmRename"
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
        This deletes all {{ deleteTarget.eventCount }} event{{ deleteTarget.eventCount === 1 ? '' : 's' }} in this folder and every photo inside them. This cannot be undone.
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
