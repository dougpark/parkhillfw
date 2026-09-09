<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, GripVertical, MoveDown, MoveUp, Pencil, Trash2 } from 'lucide-vue-next';
import { menuIcon } from './menuIcons';
import { MAX_MENU_DEPTH, descendantIds, flattenMenus, moveNode, subtreeHeight, projectDrop, type FlatNode, type MenuRow } from './menuTree';

const props = defineProps<{ rows: MenuRow[] }>();
const emit = defineEmits<{
  reorder: [rows: MenuRow[]];
  edit: [row: MenuRow];
  remove: [row: MenuRow];
}>();

const INDENT_PX = 24;

const collapsed = ref(new Set<number>());
const armedId = ref<number | null>(null);
const dragId = ref<number | null>(null);
const dropIndex = ref<number | null>(null);
const projection = ref<{ depth: number; parentId: number | null; siblingIndex: number } | null>(null);
const rowHandled = ref(false);
const listEl = ref<HTMLElement | null>(null);

const draggedIds = computed(() => (dragId.value === null ? [] : [dragId.value, ...descendantIds(props.rows, dragId.value)]));

// Every node stays rendered while dragging — removing the drag source from the
// DOM cancels the native drag — so the dragged subtree is only dimmed, and the
// drop projection runs against the list with that subtree excluded.
const nodes = computed(() => flattenMenus(props.rows, collapsed.value));
const projectable = computed<FlatNode[]>(() => nodes.value.filter((node) => !draggedIds.value.includes(node.row.id)));

function hasChildren(id: number): boolean {
  return props.rows.some((row) => row.parentId === id);
}

function toggleCollapse(id: number): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function siblingsOf(parentId: number | null): MenuRow[] {
  return props.rows
    .filter((row) => row.parentId === parentId)
    .sort((left, right) => (left.displayOrder - right.displayOrder) || (left.id - right.id));
}

function siblingIndexOf(row: MenuRow): number {
  return siblingsOf(row.parentId).findIndex((sibling) => sibling.id === row.id);
}

function depthOf(row: MenuRow): number {
  return nodes.value.find((node) => node.row.id === row.id)?.depth ?? 1;
}

function canMoveUp(row: MenuRow): boolean {
  return siblingIndexOf(row) > 0;
}

function canMoveDown(row: MenuRow): boolean {
  return siblingIndexOf(row) < siblingsOf(row.parentId).length - 1;
}

function previousSibling(row: MenuRow): MenuRow | undefined {
  const index = siblingIndexOf(row);
  return index > 0 ? siblingsOf(row.parentId)[index - 1] : undefined;
}

function canIndent(row: MenuRow): boolean {
  const target = previousSibling(row);
  if (!target || target.kind !== 'menu') return false;
  return depthOf(row) + subtreeHeight(props.rows, row.id) <= MAX_MENU_DEPTH;
}

function canOutdent(row: MenuRow): boolean {
  return row.parentId !== null;
}

function move(row: MenuRow, parentId: number | null, siblingIndex: number): void {
  emit('reorder', moveNode(props.rows, row.id, parentId, siblingIndex));
}

function moveUp(row: MenuRow): void {
  if (canMoveUp(row)) move(row, row.parentId, siblingIndexOf(row) - 1);
}

function moveDown(row: MenuRow): void {
  if (canMoveDown(row)) move(row, row.parentId, siblingIndexOf(row) + 1);
}

function indent(row: MenuRow): void {
  const target = previousSibling(row);
  if (target && canIndent(row)) move(row, target.id, siblingsOf(target.id).length);
}

function outdent(row: MenuRow): void {
  if (!canOutdent(row)) return;
  const parent = props.rows.find((candidate) => candidate.id === row.parentId);
  if (!parent) return;
  move(row, parent.parentId, siblingIndexOf(parent) + 1);
}

function armDrag(id: number): void {
  armedId.value = id;
}

function onDragStart(event: DragEvent, row: MenuRow): void {
  if (armedId.value !== row.id) {
    event.preventDefault();
    return;
  }
  dragId.value = row.id;
  event.dataTransfer?.setData('text/plain', String(row.id));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

// Rendered slots include the dragged subtree; the projection list does not.
function toProjectableIndex(renderedIndex: number): number {
  let count = 0;
  for (let index = 0; index < renderedIndex; index += 1) {
    if (!draggedIds.value.includes(nodes.value[index]!.row.id)) count += 1;
  }
  return count;
}

function updateProjection(event: DragEvent, insertIndex: number): void {
  if (dragId.value === null || !listEl.value) return;
  const left = listEl.value.getBoundingClientRect().left;
  const requestedDepth = Math.round((event.clientX - left - 12) / INDENT_PX) + 1;
  const height = subtreeHeight(props.rows, dragId.value);
  dropIndex.value = insertIndex;
  projection.value = projectDrop(projectable.value, toProjectableIndex(insertIndex), requestedDepth, height);
}

function onRowDragOver(event: DragEvent, index: number): void {
  if (dragId.value === null) return;
  event.preventDefault();
  rowHandled.value = true;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  updateProjection(event, after ? index + 1 : index);
}

// Fires after the row handler; the flag keeps a row hover from being overwritten.
function onListDragOver(event: DragEvent): void {
  if (dragId.value === null) return;
  event.preventDefault();
  if (rowHandled.value) {
    rowHandled.value = false;
    return;
  }
  updateProjection(event, nodes.value.length);
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  const id = dragId.value;
  const target = projection.value;
  resetDrag();
  if (id === null || !target) return;
  const row = props.rows.find((candidate) => candidate.id === id);
  if (row) move(row, target.parentId, target.siblingIndex);
}

function resetDrag(): void {
  dragId.value = null;
  dropIndex.value = null;
  projection.value = null;
  rowHandled.value = false;
  armedId.value = null;
}

function targetLabel(row: MenuRow): string {
  if (row.kind === 'page') return row.pageTitle ? `Page · ${row.pageTitle}` : 'Page · missing';
  if (row.kind === 'link') return `Link · ${row.targetUrl ?? ''}`;
  return row.slug ? `/menu/${row.slug}` : 'Folder';
}

function isBroken(row: MenuRow): boolean {
  if (row.kind === 'page') return !row.pageSlug;
  if (row.kind === 'link') return !row.targetUrl;
  return false;
}
</script>

<template>
  <div
    ref="listEl"
    class="rounded-2xl border border-[#e1e3e1] bg-white p-2"
    @dragover="onListDragOver"
    @drop="onDrop"
    @dragend="resetDrag"
  >
    <p v-if="!nodes.length" class="px-3 py-6 text-center text-sm text-[#444746]">
      No menus yet. Add a folder to start building navigation.
    </p>

    <template v-for="(node, index) in nodes" :key="node.row.id">
      <div
        v-if="dropIndex === index && projection"
        class="h-0.5 rounded-full bg-[#1a73e8]"
        :style="{ marginLeft: `${(projection.depth - 1) * INDENT_PX + 12}px` }"
        aria-hidden="true"
      />
      <div
        :draggable="armedId === node.row.id"
        class="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-[#f0f4f9]"
        :class="draggedIds.includes(node.row.id) ? 'opacity-40' : ''"
        :style="{ marginLeft: `${(node.depth - 1) * INDENT_PX}px` }"
        @dragstart="onDragStart($event, node.row)"
        @dragover="onRowDragOver($event, index)"
      >
        <button
          type="button"
          class="cursor-grab rounded-lg p-1 text-[#444746] hover:bg-white active:cursor-grabbing"
          :aria-label="`Drag ${node.row.title}`"
          @mousedown="armDrag(node.row.id)"
          @touchstart.passive="armDrag(node.row.id)"
        >
          <GripVertical class="h-4 w-4" />
        </button>

        <button
          v-if="node.row.kind === 'menu' && hasChildren(node.row.id)"
          type="button"
          class="rounded-lg p-1 text-[#444746] hover:bg-white"
          :aria-label="collapsed.has(node.row.id) ? `Expand ${node.row.title}` : `Collapse ${node.row.title}`"
          @click="toggleCollapse(node.row.id)"
        >
          <component :is="collapsed.has(node.row.id) ? ChevronRight : ChevronDown" class="h-4 w-4" />
        </button>
        <span v-else class="w-6" aria-hidden="true" />

        <component :is="menuIcon(node.row.iconName, node.row.kind)" class="h-4 w-4 shrink-0 text-[#1a73e8]" />

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate text-sm font-medium text-[#1f1f1f]">{{ node.row.title }}</span>
            <span v-if="node.row.isDraft" class="rounded-full bg-[#fff8e1] px-2 py-0.5 text-xs font-medium text-[#8a6116]">Draft</span>
            <span v-else-if="node.row.isPublic" class="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs font-medium text-[#137333]">Public</span>
            <span v-else class="rounded-full bg-[#e8f0fe] px-2 py-0.5 text-xs font-medium text-[#0b57d0]">Members</span>
            <span v-if="isBroken(node.row)" class="rounded-full bg-[#fce8e6] px-2 py-0.5 text-xs font-medium text-[#c5221f]">Broken target</span>
          </div>
          <p class="truncate text-xs text-[#444746]">{{ targetLabel(node.row) }}</p>
        </div>

        <div class="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" class="rounded-lg p-1.5 text-[#444746] hover:bg-white disabled:opacity-30" :disabled="!canMoveUp(node.row)" :aria-label="`Move ${node.row.title} up`" @click="moveUp(node.row)">
            <MoveUp class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-lg p-1.5 text-[#444746] hover:bg-white disabled:opacity-30" :disabled="!canMoveDown(node.row)" :aria-label="`Move ${node.row.title} down`" @click="moveDown(node.row)">
            <MoveDown class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-lg p-1.5 text-[#444746] hover:bg-white disabled:opacity-30" :disabled="!canOutdent(node.row)" :aria-label="`Outdent ${node.row.title}`" @click="outdent(node.row)">
            <ChevronsLeft class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-lg p-1.5 text-[#444746] hover:bg-white disabled:opacity-30" :disabled="!canIndent(node.row)" :aria-label="`Indent ${node.row.title}`" @click="indent(node.row)">
            <ChevronsRight class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-lg p-1.5 text-[#1a73e8] hover:bg-white" :aria-label="`Edit ${node.row.title}`" @click="emit('edit', node.row)">
            <Pencil class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-lg p-1.5 text-[#c5221f] hover:bg-white" :aria-label="`Delete ${node.row.title}`" @click="emit('remove', node.row)">
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </template>

    <div
      v-if="dropIndex === nodes.length && projection"
      class="h-0.5 rounded-full bg-[#1a73e8]"
      :style="{ marginLeft: `${(projection.depth - 1) * INDENT_PX + 12}px` }"
      aria-hidden="true"
    />
  </div>
</template>
