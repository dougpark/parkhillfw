<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { FilePlus2, FolderPlus, Link2, List, Network, Pencil, Trash2 } from 'lucide-vue-next';
import MenuTreeEditor from '../components/menus/MenuTreeEditor.vue';
import MenuItemDialog from '../components/menus/MenuItemDialog.vue';
import PagePickerPanel from '../components/menus/PagePickerPanel.vue';
import { flattenMenus, toReorderItems, type MenuRow } from '../components/menus/menuTree';
import { menuIcon } from '../components/menus/menuIcons';

const emit = defineEmits<{ exit: [] }>();

const rows = ref<MenuRow[]>([]);
const loading = ref(true);
const error = ref('');
const mode = ref<'list' | 'tree'>('list');
const editing = ref<MenuRow | null>(null);
const deleteTarget = ref<MenuRow | null>(null);
const showPagePicker = ref(false);
const pickerParentId = ref<number | null>(null);
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const savedAt = ref('');

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const flat = computed(() => flattenMenus(rows.value));

const parentTitle = (row: MenuRow) => rows.value.find((candidate) => candidate.id === row.parentId)?.title ?? '—';
const childCount = (row: MenuRow) => rows.value.filter((candidate) => candidate.parentId === row.id).length;

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  const response = await fetch('/api/admin/menus');
  if (response.ok) rows.value = (await response.json()) as MenuRow[];
  else error.value = 'Could not load menus.';
  loading.value = false;
}

async function createItem(payload: Record<string, unknown>): Promise<void> {
  error.value = '';
  const response = await fetch('/api/admin/menus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    error.value = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not create the item.';
    return;
  }
  await load();
}

function addFolder(): void {
  void createItem({ kind: 'menu', title: 'New menu' });
}

function addLink(): void {
  void createItem({ kind: 'link', title: 'New link', targetUrl: 'https://' });
}

function openPagePicker(parentId: number | null): void {
  pickerParentId.value = parentId;
  showPagePicker.value = true;
}

async function onPageSelected(page: { id: number; title: string }): Promise<void> {
  showPagePicker.value = false;
  await createItem({ kind: 'page', pageId: page.id, title: page.title, parentId: pickerParentId.value });
  pickerParentId.value = null;
}

async function saveItem(payload: Record<string, unknown>): Promise<void> {
  const row = editing.value;
  if (!row) return;
  const response = await fetch(`/api/admin/menus/${row.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    error.value = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not save the item.';
    return;
  }
  editing.value = null;
  await load();
}

async function togglePublish(row: MenuRow): Promise<void> {
  const response = await fetch(`/api/admin/menus/${row.id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isDraft: !row.isDraft }),
  });
  if (response.ok) await load();
  else error.value = 'Could not change visibility.';
}

async function confirmDelete(): Promise<void> {
  const row = deleteTarget.value;
  deleteTarget.value = null;
  if (!row) return;
  const response = await fetch(`/api/admin/menus/${row.id}`, { method: 'DELETE' });
  if (response.ok) await load();
  else error.value = 'Could not delete the item.';
}

// Drag-and-drop applies locally first, then persists; a failed save reloads the
// server's version so the tree never drifts from what is stored.
function onReorder(next: MenuRow[]): void {
  rows.value = next;
  saveState.value = 'saving';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const response = await fetch('/api/admin/menus/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: toReorderItems(rows.value) }),
    });
    if (response.ok) {
      saveState.value = 'saved';
      savedAt.value = new Date().toLocaleTimeString();
      return;
    }
    saveState.value = 'error';
    error.value = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not save the new order.';
    await load();
  }, 400);
}

onMounted(load);
</script>

<template>
  <div>
    <button
      type="button"
      class="mb-4 rounded-full border border-[#e1e3e1] px-4 py-2 text-sm font-medium text-[#444746] transition-colors hover:bg-[#f0f4f9]"
      @click="emit('exit')"
    >
      ← Admin menu
    </button>
  </div>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 class="text-xl font-semibold">Navigation</h3>
      <p class="mt-1 text-sm text-[#444746]">Organize how pages are navigated. Drafts stay hidden until published.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-2 rounded-full border border-[#e1e3e1] px-4 py-2.5 text-sm font-medium text-[#444746] transition-colors hover:bg-[#f0f4f9]"
        @click="mode = mode === 'list' ? 'tree' : 'list'"
      >
        <component :is="mode === 'list' ? Network : List" class="h-4 w-4" />
        {{ mode === 'list' ? 'Hierarchy editor' : 'List view' }}
      </button>
      <button type="button" class="flex items-center gap-2 rounded-full border border-[#e1e3e1] px-4 py-2.5 text-sm font-medium text-[#444746] hover:bg-[#f0f4f9]" @click="openPagePicker(null)">
        <FilePlus2 class="h-4 w-4" />
        Add page
      </button>
      <button type="button" class="flex items-center gap-2 rounded-full border border-[#e1e3e1] px-4 py-2.5 text-sm font-medium text-[#444746] hover:bg-[#f0f4f9]" @click="addLink">
        <Link2 class="h-4 w-4" />
        Add link
      </button>
      <button type="button" class="flex items-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90" @click="addFolder">
        <FolderPlus class="h-4 w-4" />
        New menu
      </button>
    </div>
  </div>

  <p v-if="error" class="mt-4 text-sm text-red-600">{{ error }}</p>
  <p v-if="loading" class="mt-6 text-sm text-[#444746]">Loading menus…</p>

  <template v-else>
    <div v-if="mode === 'tree'" class="mt-6">
      <div class="mb-3 flex items-center justify-between gap-3">
        <p class="text-sm text-[#444746]">Drag the handle to reorder; drag right to nest. Changes save automatically.</p>
        <span class="text-xs font-medium" :class="saveState === 'error' ? 'text-red-600' : 'text-[#444746]'">
          <template v-if="saveState === 'saving'">Saving…</template>
          <template v-else-if="saveState === 'saved'">Saved {{ savedAt }}</template>
          <template v-else-if="saveState === 'error'">Not saved</template>
        </span>
      </div>
      <MenuTreeEditor
        :rows="rows"
        @reorder="onReorder"
        @edit="editing = $event"
        @remove="deleteTarget = $event"
      />
    </div>

    <div v-else-if="flat.length" class="mt-6 overflow-hidden rounded-2xl border border-[#e1e3e1] bg-white">
      <div
        v-for="node in flat"
        :key="node.row.id"
        class="flex flex-wrap items-center gap-3 border-b border-[#e1e3e1] px-4 py-3 last:border-b-0 sm:px-5"
      >
        <component :is="menuIcon(node.row.iconName, node.row.kind)" class="h-5 w-5 shrink-0 text-[#1a73e8]" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate font-medium text-[#1f1f1f]">{{ node.row.title }}</span>
            <span v-if="node.row.isDraft" class="rounded-full bg-[#fff8e1] px-2 py-0.5 text-xs font-medium text-[#8a6116]">Draft</span>
            <span v-else-if="node.row.isPublic" class="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs font-medium text-[#137333]">Public</span>
            <span v-else class="rounded-full bg-[#e8f0fe] px-2 py-0.5 text-xs font-medium text-[#0b57d0]">Members</span>
          </div>
          <p class="mt-0.5 text-xs text-[#444746]">
            {{ node.row.kind === 'menu' ? 'Menu' : node.row.kind === 'page' ? `Page · ${node.row.pageTitle ?? 'missing'}` : `Link · ${node.row.targetUrl}` }}
            · in {{ parentTitle(node.row) }}
            <template v-if="node.row.kind === 'menu'"> · {{ childCount(node.row) }} item{{ childCount(node.row) === 1 ? '' : 's' }}</template>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="node.row.kind === 'menu'"
            type="button"
            class="rounded-full border border-[#e1e3e1] px-3 py-1.5 text-xs font-medium text-[#444746] hover:bg-[#f0f4f9]"
            @click="openPagePicker(node.row.id)"
          >
            Add page
          </button>
          <button
            type="button"
            class="rounded-full border border-[#e1e3e1] px-3 py-1.5 text-xs font-medium text-[#444746] hover:bg-[#f0f4f9]"
            @click="togglePublish(node.row)"
          >
            {{ node.row.isDraft ? 'Publish' : 'Unpublish' }}
          </button>
          <button type="button" class="rounded-lg p-2 text-[#1a73e8] hover:bg-[#f0f4f9]" :aria-label="`Edit ${node.row.title}`" @click="editing = node.row">
            <Pencil class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-lg p-2 text-[#c5221f] hover:bg-[#f0f4f9]" :aria-label="`Delete ${node.row.title}`" @click="deleteTarget = node.row">
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <p v-else class="mt-6 rounded-2xl border border-dashed border-[#c4c7c5] bg-[#f8fafd] p-8 text-center text-sm text-[#444746]">
      No menus yet. Create a menu to start building navigation.
    </p>
  </template>

  <MenuItemDialog v-if="editing" :row="editing" @save="saveItem" @close="editing = null" />
  <PagePickerPanel v-if="showPagePicker" @select="onPageSelected" @close="showPagePicker = false; pickerParentId = null" />

  <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="deleteTarget = null">
    <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
      <h3 class="text-xl font-semibold text-[#1f1f1f]">Delete “{{ deleteTarget.title }}”?</h3>
      <p class="mt-2 text-sm text-[#444746]">
        <template v-if="childCount(deleteTarget)">
          This also removes {{ childCount(deleteTarget) }} item{{ childCount(deleteTarget) === 1 ? '' : 's' }} nested inside it.
        </template>
        <template v-else>This removes the navigation entry. Pages themselves are not deleted.</template>
      </p>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="rounded-full border border-[#e1e3e1] px-5 py-2.5 text-sm font-medium text-[#444746] hover:bg-[#f0f4f9]" @click="deleteTarget = null">Cancel</button>
        <button type="button" class="rounded-full bg-[#c5221f] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90" @click="confirmDelete">Delete</button>
      </div>
    </div>
  </div>
</template>
