<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Calendar, Images } from 'lucide-vue-next';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';

interface GalleryEvent {
    id: number;
    name: string;
    slug: string;
    eventDate: string | null;
    isDraft: boolean;
    coverPhotoId: number | null;
}

interface GalleryFolder {
    id: number;
    name: string;
    slug: string;
}

const route = useRoute();
const router = useRouter();
const folder = ref<GalleryFolder | null>(null);
const events = ref<GalleryEvent[]>([]);
const loading = ref(true);
const error = ref('');

function coverThumbUrl(event: GalleryEvent): string | null {
    return event.coverPhotoId ? `/api/photos/${event.coverPhotoId}/thumb` : null;
}

function formatDate(value: string | null): string {
    // eventDate is stored as UTC midnight for a plain calendar date — format in UTC so it doesn't shift a day in local timezones.
    return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
}

function openEvent(event: GalleryEvent): void {
    router.push(`/gallery/${event.slug}`);
}

async function load(slug: string): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch(`/api/gallery/folder/${encodeURIComponent(slug)}`);
    if (res.ok) {
        const data = (await res.json()) as { folder: GalleryFolder; events: GalleryEvent[] };
        folder.value = data.folder;
        events.value = data.events;
    } else {
        error.value = 'Could not load this folder.';
    }
    loading.value = false;
}

watch(() => route.params.slug, (slug) => { if (typeof slug === 'string') void load(slug); }, { immediate: true });
</script>

<template>
  <section class="space-y-6 py-4 sm:py-8">
    <BreadcrumbNav :trail="[{ title: 'Photo Gallery', to: '/gallery' }]" :current="folder?.name ?? 'Folder'" />

    <div>
      <h2 class="text-3xl font-semibold tracking-tight text-content">{{ folder?.name ?? 'Photo Folder' }}</h2>
      <p class="mt-2 max-w-xl text-content-muted">All events in this folder.</p>
    </div>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <p v-else-if="loading" class="text-sm text-content-muted">Loading…</p>

    <div v-else-if="events.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      <button
        v-for="event in events"
        :key="event.id"
        type="button"
        class="group overflow-hidden rounded-xl border border-theme-border bg-surface text-left transition-shadow hover:shadow-md"
        @click="openEvent(event)"
      >
        <div class="aspect-square w-full overflow-hidden bg-app-bg">
          <img
            v-if="coverThumbUrl(event)"
            :src="coverThumbUrl(event)!"
            :alt="event.name"
            class="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
          <div v-else class="flex h-full w-full items-center justify-center text-content-muted">
            <Images class="h-8 w-8" />
          </div>
        </div>
        <div class="p-3">
          <p class="truncate text-sm font-medium text-content">{{ event.name }}</p>
          <p v-if="event.eventDate" class="mt-0.5 flex items-center gap-1 text-xs text-content-muted">
            <Calendar class="h-3 w-3" />
            {{ formatDate(event.eventDate) }}
          </p>
          <span v-if="event.isDraft" class="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            Draft - Not visible to public
          </span>
        </div>
      </button>
    </div>
    <p v-else class="rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-8 text-center text-sm text-content-muted">
      No photos have been published in this folder yet.
    </p>
  </section>
</template>
