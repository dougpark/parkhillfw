<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Check, Copy, GripVertical, Star, Trash2, Upload } from 'lucide-vue-next';
import { buildPhotoVariants } from '../lib/photo-resize';

interface PhotoRow {
    id: number;
    eventId: number;
    caption: string | null;
    width: number;
    height: number;
    displayOrder: number;
}

interface EventProp {
    id: number;
    name: string;
    coverPhotoId: number | null;
}

const props = defineProps<{ event: EventProp }>();
const emit = defineEmits<{ done: [] }>();

const photos = ref<PhotoRow[]>([]);
const coverPhotoId = ref<number | null>(props.event.coverPhotoId);
const loading = ref(true);
const error = ref('');
const uploading = ref(false);
const uploadProgress = ref({ done: 0, total: 0 });
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const dragPhotoId = ref<number | null>(null);
const copiedId = ref<number | null>(null);
const captionTarget = ref<PhotoRow | null>(null);
const captionValue = ref('');
const deleteTarget = ref<PhotoRow | null>(null);
const deleting = ref(false);

function thumbUrl(photo: PhotoRow): string {
    return `/api/photos/${photo.id}/thumb`;
}

function displayUrl(photo: PhotoRow): string {
    return `/api/photos/${photo.id}/display`;
}

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch(`/api/admin/photo-events/${props.event.id}/photos`);
    if (res.ok) photos.value = (await res.json()) as PhotoRow[];
    else error.value = 'Could not load photos.';
    loading.value = false;
}

async function upload(files: FileList | File[]): Promise<void> {
    const imageFiles = [...files].filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    uploading.value = true;
    uploadProgress.value = { done: 0, total: imageFiles.length };
    error.value = '';
    for (const file of imageFiles) {
        try {
            const variants = await buildPhotoVariants(file);
            const formData = new FormData();
            formData.append('original', file);
            formData.append('thumb', variants.thumb, 'thumb.webp');
            formData.append('display', variants.display, 'display.webp');
            formData.append('width', String(variants.width));
            formData.append('height', String(variants.height));
            const res = await fetch(`/api/admin/photo-events/${props.event.id}/photos`, { method: 'POST', body: formData });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                error.value = body.error ?? `Upload failed for ${file.name}.`;
            }
        } catch {
            error.value = `Could not process ${file.name}. Try a different image.`;
        }
        uploadProgress.value = { done: uploadProgress.value.done + 1, total: imageFiles.length };
    }
    uploading.value = false;
    await load();
    const refreshed = await fetch(`/api/admin/photo-events/${props.event.id}`);
    if (refreshed.ok) {
        const data = (await refreshed.json()) as { event: EventProp };
        coverPhotoId.value = data.event.coverPhotoId;
    }
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

function onPhotoDragStart(photo: PhotoRow): void {
    dragPhotoId.value = photo.id;
}

async function onPhotoDrop(target: PhotoRow): Promise<void> {
    if (dragPhotoId.value === null || dragPhotoId.value === target.id) return;
    const fromIndex = photos.value.findIndex((p) => p.id === dragPhotoId.value);
    const toIndex = photos.value.findIndex((p) => p.id === target.id);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...photos.value];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved!);
    photos.value = reordered;
    dragPhotoId.value = null;
    await fetch(`/api/admin/photo-events/${props.event.id}/photos/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: reordered.map((p) => p.id) }),
    });
}

async function setCover(photo: PhotoRow): Promise<void> {
    const res = await fetch(`/api/admin/photo-events/${props.event.id}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: photo.id }),
    });
    if (res.ok) coverPhotoId.value = photo.id;
}

function openCaption(photo: PhotoRow): void {
    captionTarget.value = photo;
    captionValue.value = photo.caption ?? '';
}

async function saveCaption(): Promise<void> {
    if (!captionTarget.value) return;
    const res = await fetch(`/api/admin/photos/${captionTarget.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: captionValue.value.trim() || null }),
    });
    if (res.ok) {
        captionTarget.value = null;
        await load();
    } else {
        error.value = 'Could not save the caption.';
    }
}

async function copyPhotoUrl(photo: PhotoRow): Promise<void> {
    const url = `${window.location.origin}${displayUrl(photo)}`;
    const snippet = `![${photo.caption ?? ''}](${url})`;
    await navigator.clipboard.writeText(snippet);
    copiedId.value = photo.id;
    setTimeout(() => {
        if (copiedId.value === photo.id) copiedId.value = null;
    }, 1500);
}

async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;
    deleting.value = true;
    const res = await fetch(`/api/admin/photos/${deleteTarget.value.id}`, { method: 'DELETE' });
    deleting.value = false;
    const wasCover = coverPhotoId.value === deleteTarget.value.id;
    deleteTarget.value = null;
    if (res.ok) {
        if (wasCover) coverPhotoId.value = null;
        await load();
    } else {
        error.value = 'Could not delete the photo.';
    }
}

onMounted(load);
</script>

<template>
  <button
    type="button"
    class="mb-4 rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
    @click="emit('done')"
  >
    ← Events
  </button>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 class="text-xl font-semibold">{{ event.name }}</h3>
      <p class="mt-1 text-sm text-content-muted">Drag photos to reorder. Click the star to set the event cover photo.</p>
    </div>
  </div>

  <p v-if="error" class="mt-4 text-sm text-danger">{{ error }}</p>

  <div
    class="mt-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
    :class="dragOver ? 'border-accent bg-accent/5' : 'border-theme-border bg-surface-subtle'"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop.prevent="onDrop"
  >
    <Upload class="h-6 w-6 text-content-muted" />
    <p class="text-sm text-content-muted">Drag and drop photos here, or</p>
    <button
      type="button"
      class="rounded-full border border-theme-border bg-surface px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-app-bg"
      @click="fileInput?.click()"
    >
      Choose files
    </button>
    <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFilePicked" />
    <p v-if="uploading" class="text-xs text-content-muted">
      Uploading {{ uploadProgress.done }} / {{ uploadProgress.total }}…
    </p>
  </div>

  <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading photos…</p>

  <div v-else-if="photos.length" class="mt-6 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
    <div
      v-for="photo in photos"
      :key="photo.id"
      draggable="true"
      class="group relative aspect-square overflow-hidden rounded-xl border border-theme-border bg-surface"
      @dragstart="onPhotoDragStart(photo)"
      @dragover.prevent
      @drop.prevent="onPhotoDrop(photo)"
    >
      <img :src="thumbUrl(photo)" :alt="photo.caption ?? ''" class="h-full w-full object-cover" loading="lazy" />
      <div class="absolute inset-x-0 top-0 flex items-center justify-between p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <span class="flex h-7 w-7 cursor-grab items-center justify-center rounded-lg bg-black/50 text-white">
          <GripVertical class="h-4 w-4" />
        </span>
        <button
          type="button"
          :title="coverPhotoId === photo.id ? 'Cover photo' : 'Set as cover photo'"
          class="flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
          @click="setCover(photo)"
        >
          <Star class="h-4 w-4" :class="coverPhotoId === photo.id ? 'fill-amber-400 text-amber-400' : ''" />
        </button>
      </div>
      <div class="absolute inset-x-0 bottom-0 flex items-center justify-between p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          title="Edit caption"
          class="rounded-lg bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
          @click="openCaption(photo)"
        >
          Caption
        </button>
        <div class="flex items-center gap-1">
          <button
            type="button"
            :title="copiedId === photo.id ? 'Copied!' : 'Copy image link for a page'"
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
            @click="copyPhotoUrl(photo)"
          >
            <Check v-if="copiedId === photo.id" class="h-3.5 w-3.5 text-green-400" />
            <Copy v-else class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete photo"
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-danger"
            @click="deleteTarget = photo"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
  <p v-else class="mt-6 rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-6 text-center text-sm text-content-muted">
    No photos yet. Drop some in above.
  </p>

  <div v-if="captionTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="captionTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Photo caption</h4>
      <input
        v-model="captionValue"
        type="text"
        placeholder="Caption (optional)"
        class="mt-4 w-full rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        @keyup.enter="saveCaption"
      />
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="captionTarget = null">Cancel</button>
        <button type="button" class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90" @click="saveCaption">Save</button>
      </div>
    </div>
  </div>

  <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="deleteTarget = null">
    <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-6 shadow-lg">
      <h4 class="text-base font-semibold">Delete this photo?</h4>
      <p class="mt-2 text-sm text-content-muted">This cannot be undone.</p>
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
