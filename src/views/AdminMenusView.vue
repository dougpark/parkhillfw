<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { List, Network, Pencil, Plus, Settings2, Trash2 } from 'lucide-vue-next';
import MenuTreeEditor from '../components/menus/MenuTreeEditor.vue';
import MenuItemDialog from '../components/menus/MenuItemDialog.vue';
import PagePickerPanel from '../components/menus/PagePickerPanel.vue';
import AddItemMenu from '../components/menus/AddItemMenu.vue';
import { flattenMenus, toReorderItems, type MenuRow } from '../components/menus/menuTree';
import { menuIcon } from '../components/menus/menuIcons';

const AdminPageEditView = defineAsyncComponent(() => import('./AdminPageEditView.vue'));

const emit = defineEmits<{ exit: [] }>();

const rows = ref<MenuRow[]>([]);
const loading = ref(true);
const error = ref('');
const mode = ref<'list' | 'tree'>('list');
const editing = ref<MenuRow | null>(null);
const deleteTarget = ref<MenuRow | null>(null);
const showPagePicker = ref(false);
const pickerParentId = ref<number | null>(null);
const showAddItem = ref(false);
const addItemParentId = ref<number | null>(null);
const editingPageId = ref<number | null>(null);
const editorDirty = ref(false);
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

// Row-level adds land at the start of that menu's children (directly below the
// row); action-bar adds have no row context, so they land at the end of the top level.
function positionFor(parentId: number | null): 'start' | 'end' {
  return parentId !== null ? 'start' : 'end';
}

function openAddItem(parentId: number | null): void {
  addItemParentId.value = parentId;
  showAddItem.value = true;
}

function closeAddItem(): void {
  showAddItem.value = false;
}

function addFolder(parentId: number | null): void {
  void createItem({ kind: 'menu', title: 'New menu', parentId, position: positionFor(parentId) });
  closeAddItem();
}

function addLink(parentId: number | null): void {
  void createItem({ kind: 'link', title: 'New link', targetUrl: 'https://', openInNewTab: true, parentId, position: positionFor(parentId) });
  closeAddItem();
}

async function createNewPage(title: string, parentId: number | null): Promise<void> {
  error.value = '';
  const response = await fetch('/api/admin/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    error.value = 'Could not create a new page.';
    return;
  }
  const data = (await response.json()) as { page: { id: number } };
  await createItem({ kind: 'page', pageId: data.page.id, title, parentId, position: positionFor(parentId) });
  closeAddItem();
  editingPageId.value = data.page.id;
  editorDirty.value = false;
}

function openPagePicker(parentId: number | null): void {
  pickerParentId.value = parentId;
  showPagePicker.value = true;
  closeAddItem();
}

function editPage(row: MenuRow): void {
  if (row.pageId === null) return;
  editingPageId.value = row.pageId;
  editorDirty.value = false;
}

function closePageEditor(): void {
  if (editorDirty.value && !window.confirm('You have unsaved changes. Discard them?')) return;
  editingPageId.value = null;
  editorDirty.value = false;
  void load();
}

function onEditorDone(): void {
  editingPageId.value = null;
  editorDirty.value = false;
  void load();
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
      class="mb-4 rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
      @click="editingPageId !== null ? closePageEditor() : emit('exit')"
    >
      ← {{ editingPageId !== null ? 'Navigation list' : 'Admin menu' }}
    </button>
  </div>

  <AdminPageEditView
    v-if="editingPageId !== null"
    :page-id="editingPageId"
    @done="onEditorDone"
    @dirty="editorDirty = $event"
  />

  <div v-else>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 class="text-xl font-semibold">Navigation</h3>
      <p class="mt-1 text-sm text-content-muted">Organize how pages are navigated. Drafts stay hidden until published.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-2 rounded-full border border-theme-border px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
        @click="mode = mode === 'list' ? 'tree' : 'list'"
      >
        <component :is="mode === 'list' ? Network : List" class="h-4 w-4" />
        {{ mode === 'list' ? 'Reorder Mode' : 'Edit Mode' }}
      </button>
      <button
        type="button"
        class="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
        @click="openAddItem(null)"
      >
        <Plus class="h-4 w-4" />
        Add Item
      </button>
    </div>
  </div>

  <p v-if="error" class="mt-4 text-sm text-danger">{{ error }}</p>
  <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading menus…</p>

  <template v-else>
    <div v-if="mode === 'tree'" class="mt-6">
      <div class="mb-3 flex items-center justify-between gap-3">
        <p class="text-sm text-content-muted">Drag the handle to reorder; drag right to nest. Changes save automatically.</p>
        <span class="text-xs font-medium" :class="saveState === 'error' ? 'text-danger' : 'text-content-muted'">
          <template v-if="saveState === 'saving'">Saving…</template>
          <template v-else-if="saveState === 'saved'">Saved {{ savedAt }}</template>
          <template v-else-if="saveState === 'error'">Not saved</template>
        </span>
      </div>
      <MenuTreeEditor
        :rows="rows"
        @reorder="onReorder"
      />
    </div>

    <div v-else-if="flat.length" class="mt-6 overflow-hidden rounded-2xl border border-theme-border bg-surface">
      <div
        v-for="node in flat"
        :key="node.row.id"
        class="flex flex-col gap-3 border-b border-theme-border px-4 py-3 last:border-b-0 sm:flex-row sm:flex-wrap sm:items-center sm:px-5"
      >
        <div class="flex min-w-0 items-start gap-3 sm:contents">
          <component :is="menuIcon(node.row.iconName, node.row.kind)" class="mt-0.5 h-5 w-5 shrink-0 text-accent sm:mt-0" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="min-w-0 wrap-break-word font-medium text-content sm:truncate">{{ node.row.title }}</span>
              <span v-if="node.row.isDraft" class="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">Draft</span>
              <span v-else-if="node.row.isPublic" class="rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">Public</span>
              <span v-else class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">Members</span>
            </div>
            <p class="mt-0.5 wrap-break-word text-xs text-content-muted">
              {{ node.row.kind === 'menu' ? 'Menu' : node.row.kind === 'page' ? `Page · ${node.row.pageTitle ?? 'missing'}` : `Link · ${node.row.targetUrl}` }}
              · in {{ parentTitle(node.row) }}
              <template v-if="node.row.kind === 'menu'"> · {{ childCount(node.row) }} item{{ childCount(node.row) === 1 ? '' : 's' }}</template>
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <button
            v-if="node.row.kind === 'menu'"
            type="button"
            class="rounded-lg p-2 text-content-muted hover:bg-app-bg"
            :aria-label="`Add item under ${node.row.title}`"
            :title="`Add item under ${node.row.title}`"
            @click="openAddItem(node.row.id)"
          >
            <Plus class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="rounded-full border border-theme-border px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-app-bg"
            @click="togglePublish(node.row)"
          >
            {{ node.row.isDraft ? 'Publish' : 'Unpublish' }}
          </button>
          <button
            type="button"
            class="rounded-lg p-2 text-accent hover:bg-app-bg"
            :aria-label="`Edit ${node.row.title} details`"
            :title="`Edit ${node.row.title} details`"
            @click="editing = node.row"
          >
            <Settings2 class="h-4 w-4" />
          </button>
          <button
            v-if="node.row.kind === 'page' && node.row.pageId !== null"
            type="button"
            class="rounded-lg p-2 text-accent hover:bg-app-bg"
            :aria-label="`Edit ${node.row.pageTitle ?? node.row.title} content`"
            :title="`Edit ${node.row.pageTitle ?? node.row.title} content`"
            @click="editPage(node.row)"
          >
            <Pencil class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-lg p-2 text-danger hover:bg-app-bg" :aria-label="`Delete ${node.row.title}`" :title="`Delete ${node.row.title}`" @click="deleteTarget = node.row">
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <p v-else class="mt-6 rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-8 text-center text-sm text-content-muted">
      No menus yet. Create a menu to start building navigation.
    </p>
  </template>

  <MenuItemDialog v-if="editing" :row="editing" @save="saveItem" @close="editing = null" />
  <PagePickerPanel v-if="showPagePicker" @select="onPageSelected" @close="showPagePicker = false; pickerParentId = null" />
  <AddItemMenu
    v-if="showAddItem"
    :parent-id="addItemParentId"
    @insert-page="openPagePicker(addItemParentId)"
    @new-link="addLink(addItemParentId)"
    @new-menu="addFolder(addItemParentId)"
    @new-page="createNewPage($event, addItemParentId)"
    @close="closeAddItem"
  />

  <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="deleteTarget = null">
    <div class="w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl">
      <h3 class="text-xl font-semibold text-content">Delete “{{ deleteTarget.title }}”?</h3>
      <p class="mt-2 text-sm text-content-muted">
        <template v-if="childCount(deleteTarget)">
          This also removes {{ childCount(deleteTarget) }} item{{ childCount(deleteTarget) === 1 ? '' : 's' }} nested inside it.
        </template>
        <template v-else>This removes the navigation entry. Pages themselves are not deleted.</template>
      </p>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="rounded-full border border-theme-border px-5 py-2.5 text-sm font-medium text-content-muted hover:bg-app-bg" @click="deleteTarget = null">Cancel</button>
        <button type="button" class="rounded-full bg-danger px-6 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90" @click="confirmDelete">Delete</button>
      </div>
    </div>
  </div>
  </div>
</template>
