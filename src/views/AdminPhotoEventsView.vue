<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue';
import { Calendar, Check, Copy, Images, Pencil, Plus, Trash2 } from 'lucide-vue-next';

const AdminPhotoEventPhotosView = defineAsyncComponent(() => import('./AdminPhotoEventPhotosView.vue'));

interface EventRow {
    id: number;
    folderId: number;
    name: string;
    slug: string;
    description: string | null;
    eventDate: string | null;
    isPublic: boolean;
    isDraft: boolean;
    coverPhotoId: number | null;
    photoCount: number;
}

const props = defineProps<{ folderId: number; folderName: string }>();
const emit = defineEmits<{ done: [] }>();

const events = ref<EventRow[]>([]);
const loading = ref(true);
const error = ref('');
const selectedEvent = ref<EventRow | null>(null);
const editTarget = ref<EventRow | null>(null);
const editName = ref('');
const editDescription = ref('');
const editDate = ref('');
const editIsPublic = ref(true);
const editIsDraft = ref(true);
const deleteTarget = ref<EventRow | null>(null);
const deleting = ref(false);
const creating = ref(false);
const copiedId = ref<number | null>(null);

function eventUrl(event: EventRow): string {
    return `${window.location.origin}/gallery/${event.slug}`;
}

async function copyEventUrl(event: EventRow): Promise<void> {
    await navigator.clipboard.writeText(`[${event.name}](${eventUrl(event)})`);
    copiedId.value = event.id;
    setTimeout(() => {
        if (copiedId.value === event.id) copiedId.value = null;
    }, 1500);
}

function formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleDateString() : 'No date set';
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch(`/api/admin/photo-folders/${props.folderId}/events`);
    if (res.ok) events.value = (await res.json()) as EventRow[];
    else error.value = 'Could not load events.';
    loading.value = false;
}

async function createEvent(): Promise<void> {
    creating.value = true;
    error.value = '';
    const res = await fetch('/api/admin/photo-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: props.folderId, name: 'Untitled event' }),
    });
    creating.value = false;
    if (res.ok) {
        const data = (await res.json()) as { event: EventRow };
        await load();
        openEditor(events.value.find((row) => row.id === data.event.id) ?? data.event);
    } else {
        error.value = 'Could not create the event.';
    }
}

function openEditor(event: EventRow): void {
    editTarget.value = event;
    editName.value = event.name;
    editDescription.value = event.description ?? '';
    editDate.value = event.eventDate ? new Date(event.eventDate).toISOString().slice(0, 10) : '';
    editIsPublic.value = event.isPublic;
    editIsDraft.value = event.isDraft;
}

async function saveEdit(): Promise<void> {
    if (!editTarget.value) return;
    const name = editName.value.trim();
    if (!name) return;
    const res = await fetch(`/api/admin/photo-events/${editTarget.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            folderId: props.folderId,
            name,
            description: editDescription.value.trim() || null,
            eventDate: editDate.value || null,
            isPublic: editIsPublic.value,
            isDraft: editIsDraft.value,
        }),
    });
    if (res.ok) {
        editTarget.value = null;
        await load();
    } else {
        error.value = 'Could not save the event.';
    }
}

async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;
    deleting.value = true;
    const res = await fetch(`/api/admin/photo-events/${deleteTarget.value.id}`, { method: 'DELETE' });
    deleting.value = false;
    deleteTarget.value = null;
    if (res.ok) await load();
    else error.value = 'Could not delete the event.';
}

function openPhotos(event: EventRow): void {
    selectedEvent.value = event;
}

function onPhotosDone(): void {
    selectedEvent.value = null;
    void load();
}

onMounted(load);
</script>

<template>
  <button
    type="button"
    class="mb-4 rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
    @click="selectedEvent ? (selectedEvent = null) : emit('done')"
  >
    ← {{ selectedEvent ? folderName : 'Photo Folders' }}
  </button>

  <AdminPhotoEventPhotosView
    v-if="selectedEvent"
    :event="selectedEvent"
    @done="onPhotosDone"
  />

  <div v-else>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-xl font-semibold">{{ folderName }}</h3>
        <p class="mt-1 text-sm text-content-muted">Manage events in this folder. Drafts stay hidden from members.</p>
      </div>
      <button
        type="button"
        :disabled="creating"
        class="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        @click="createEvent"
      >
        <Plus class="h-4 w-4" />
        New event
      </button>
    </div>

    <p v-if="error" class="mt-4 text-sm text-danger">{{ error }}</p>
    <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading events…</p>

    <div v-else-if="events.length" class="mt-6 overflow-hidden rounded-2xl border border-theme-border bg-surface">
      <div
        v-for="event in events"
        :key="event.id"
        class="flex flex-col gap-3 border-b border-theme-border px-4 py-3 last:border-b-0 sm:flex-row sm:flex-wrap sm:items-center sm:px-5"
      >
        <button type="button" class="min-w-0 text-left sm:flex-1" @click="openPhotos(event)">
          <p class="truncate font-medium">{{ event.name }}</p>
          <p class="mt-0.5 flex items-center gap-1 text-xs text-content-muted">
            <Calendar class="h-3.5 w-3.5" />
            {{ formatDate(event.eventDate) }} · {{ event.photoCount }} photo{{ event.photoCount === 1 ? '' : 's' }}
          </p>
        </button>
        <div class="flex flex-wrap items-center gap-2 sm:contents">
          <span
            class="rounded-full px-2.5 py-1 text-xs font-medium"
            :class="event.isDraft ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'"
          >
            {{ event.isDraft ? 'Draft' : 'Published' }}
          </span>
          <span
            class="rounded-full px-2.5 py-1 text-xs font-medium"
            :class="event.isPublic ? 'bg-accent/10 text-accent' : 'bg-app-bg text-content-muted'"
          >
            {{ event.isPublic ? 'Public' : 'Members only' }}
          </span>
        </div>
        <div class="flex items-center gap-2 sm:contents">
          <button
            type="button"
            title="Open photos"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
            @click="openPhotos(event)"
          >
            <Images class="h-4 w-4" />
          </button>
          <button
            type="button"
            :title="copiedId === event.id ? 'Copied!' : 'Copy event link for a page'"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
            @click="copyEventUrl(event)"
          >
            <Check v-if="copiedId === event.id" class="h-4 w-4 text-green-600" />
            <Copy v-else class="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Edit event"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-accent/10 hover:text-accent"
            @click="openEditor(event)"
          >
            <Pencil class="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Delete event"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-danger-subtle hover:text-danger"
            @click="deleteTarget = event"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="mt-6 rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-6 text-center text-sm text-content-muted">
      No events yet. Create one to start uploading photos.
    </p>
  </div>

  <div v-if="editTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="editTarget = null">
    <div class="w-full max-w-md rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Edit event</h4>
      <div class="mt-4 space-y-3">
        <input
          v-model="editName"
          type="text"
          placeholder="Event name"
          class="w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <textarea
          v-model="editDescription"
          rows="3"
          placeholder="Description (optional)"
          class="w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <input
          v-model="editDate"
          type="date"
          class="w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <label class="flex items-center gap-2 text-sm text-content">
          <input v-model="editIsDraft" type="checkbox" class="h-4 w-4 rounded border-theme-border" />
          Draft (hidden from members)
        </label>
        <label class="flex items-center gap-2 text-sm text-content">
          <input v-model="editIsPublic" type="checkbox" class="h-4 w-4 rounded border-theme-border" />
          Public to any signed-in member (not just matched residents)
        </label>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="editTarget = null">Cancel</button>
        <button type="button" class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90" @click="saveEdit">Save</button>
      </div>
    </div>
  </div>

  <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="deleteTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Delete "{{ deleteTarget.name }}"?</h4>
      <p class="mt-2 text-sm text-content-muted">
        This deletes all {{ deleteTarget.photoCount }} photo{{ deleteTarget.photoCount === 1 ? '' : 's' }} in this event. This cannot be undone.
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
