<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue';
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-vue-next';

// CodeMirror is heavy and only needed when an editor actually opens a page,
// so load the editor (and its CodeMirror chunk) on demand.
const AdminPageEditView = defineAsyncComponent(() => import('./AdminPageEditView.vue'));

interface PageRow {
    id: number;
    slug: string;
    title: string;
    isPublic: boolean;
    isDraft: boolean;
    updatedAt: string;
    authorEmail: string | null;
    attachmentCount: number;
}

const pages = ref<PageRow[]>([]);
const loading = ref(true);
const error = ref('');
const mode = ref<'list' | 'edit'>('list');
const editingPageId = ref<number | null>(null);
const deleteTarget = ref<PageRow | null>(null);
const deleting = ref(false);
const editorDirty = ref(false);

const emit = defineEmits<{ exit: [] }>();

function goToAdminMenu(): void {
    if (mode.value === 'edit' && editorDirty.value && !window.confirm('You have unsaved changes. Discard them?')) return;
    if (mode.value === 'edit') {
        mode.value = 'list';
        editingPageId.value = null;
        editorDirty.value = false;
        void load();
        return;
    }
    emit('exit');
}

function formatDate(value: string): string {
    return new Date(value).toLocaleString();
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch('/api/admin/pages');
    if (res.ok) pages.value = (await res.json()) as PageRow[];
    else error.value = 'Could not load pages.';
    loading.value = false;
}

async function createPage(): Promise<void> {
    error.value = '';
    const res = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled page' }),
    });
    if (!res.ok) {
        error.value = 'Could not create a new page.';
        return;
    }
    const data = (await res.json()) as { page: { id: number } };
    editingPageId.value = data.page.id;
    mode.value = 'edit';
}

function editPage(row: PageRow): void {
    editingPageId.value = row.id;
    mode.value = 'edit';
}

async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;
    deleting.value = true;
    const res = await fetch(`/api/admin/pages/${deleteTarget.value.id}`, { method: 'DELETE' });
    deleting.value = false;
    deleteTarget.value = null;
    if (res.ok) await load();
    else error.value = 'Could not delete the page.';
}

function onEditorDone(): void {
    mode.value = 'list';
    editingPageId.value = null;
    editorDirty.value = false;
    void load();
}

onMounted(load);
</script>

<template>
  <div>
    <button
      type="button"
      class="mb-4 rounded-full border border-[#e1e3e1] px-4 py-2 text-sm font-medium text-[#444746] transition-colors hover:bg-[#f0f4f9]"
      @click="goToAdminMenu"
    >
      ← {{ mode === 'edit' ? 'Pages List' : 'Admin menu' }}
    </button>
  </div>

  <AdminPageEditView
    v-if="mode === 'edit' && editingPageId !== null"
    :page-id="editingPageId"
    @done="onEditorDone"
    @dirty="editorDirty = $event"
  />

  <div v-else>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-xl font-semibold">Pages</h3>
        <p class="mt-1 text-sm text-[#444746]">Create and edit neighborhood pages. Drafts are hidden from members.</p>
      </div>
      <button
        type="button"
        class="flex items-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        @click="createPage"
      >
        <Plus class="h-4 w-4" />
        New page
      </button>
    </div>

    <p v-if="error" class="mt-4 text-sm text-red-600">{{ error }}</p>
    <p v-if="loading" class="mt-6 text-sm text-[#444746]">Loading pages…</p>

    <div v-else-if="pages.length" class="mt-6 overflow-hidden rounded-2xl border border-[#e1e3e1] bg-white">
      <div
        v-for="page in pages"
        :key="page.id"
        class="flex flex-wrap items-center gap-3 border-b border-[#e1e3e1] px-4 py-3 last:border-b-0 sm:px-5"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ page.title }}</p>
          <p class="mt-0.5 truncate text-xs text-[#444746]">
            /pages/{{ page.slug }} · by {{ page.authorEmail ?? 'unknown' }} · edited {{ formatDate(page.updatedAt) }}
          </p>
        </div>
        <span
          class="rounded-full px-2.5 py-1 text-xs font-medium"
          :class="page.isDraft ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'"
        >
          {{ page.isDraft ? 'Draft' : 'Published' }}
        </span>
        <span
          class="rounded-full px-2.5 py-1 text-xs font-medium"
          :class="page.isPublic ? 'bg-[#e8f0fe] text-[#0b57d0]' : 'bg-[#f0f4f9] text-[#444746]'"
        >
          {{ page.isPublic ? 'Public' : 'Members only' }}
        </span>
        <button
          type="button"
          title="Edit page"
          class="flex h-9 w-9 items-center justify-center rounded-lg text-[#444746] transition-colors hover:bg-[#e8f0fe] hover:text-[#1a73e8]"
          @click="editPage(page)"
        >
          <Pencil class="h-4 w-4" />
        </button>
        <span
          v-if="page.attachmentCount > 0"
          class="flex items-center gap-1 rounded-full bg-[#e8f0fe] px-2.5 py-1 text-xs font-medium text-[#0b57d0]"
          :title="`${page.attachmentCount} attachment${page.attachmentCount === 1 ? '' : 's'} attached`"
        >
          <Paperclip class="h-3.5 w-3.5" />
          {{ page.attachmentCount }}
        </span>
        <span
          v-else
          class="flex h-9 w-9 items-center justify-center text-[#c4c7c5]"
          title="No attachments"
        >
          <Paperclip class="h-4 w-4" />
        </span>
        <button
          type="button"
          title="Delete page"
          class="flex h-9 w-9 items-center justify-center rounded-lg text-[#444746] transition-colors hover:bg-red-50 hover:text-red-600"
          @click="deleteTarget = page"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </div>
    </div>
    <p v-else class="mt-6 rounded-2xl border border-dashed border-[#c4c7c5] bg-[#f8fafd] p-6 text-center text-sm text-[#444746]">
      No pages yet. Create the first one.
    </p>

    <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div class="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h4 class="text-lg font-semibold">Delete page?</h4>
        <p class="mt-2 text-sm text-[#444746]">
          “{{ deleteTarget.title }}” and its attachments will be permanently deleted.
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-full border border-[#e1e3e1] px-4 py-2 text-sm font-medium text-[#444746] transition-colors hover:bg-[#f0f4f9]"
            @click="deleteTarget = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            :disabled="deleting"
            @click="confirmDelete"
          >
            {{ deleting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
