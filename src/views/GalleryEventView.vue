<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronLeft, ChevronRight, Share2, X } from 'lucide-vue-next';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';

interface EventPhoto {
    id: number;
    caption: string | null;
    width: number;
    height: number;
    displayOrder: number;
}

interface GalleryEventDetail {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    eventDate: string | null;
    isDraft: boolean;
}

const route = useRoute();
const router = useRouter();

const event = ref<GalleryEventDetail | null>(null);
const photos = ref<EventPhoto[]>([]);
const loading = ref(true);
const error = ref('');
const lightboxIndex = ref<number | null>(null);

const currentPhoto = computed(() => (lightboxIndex.value !== null ? photos.value[lightboxIndex.value] ?? null : null));
const slideDirection = ref<'next' | 'prev'>('next');
const transitionName = computed(() => (slideDirection.value === 'next' ? 'slide-next' : 'slide-prev'));
const showActions = ref(false);
const canShare = computed(() => typeof navigator !== 'undefined' && !!navigator.share);
let hideActionsTimer: ReturnType<typeof setTimeout> | null = null;

function hideActions(): void {
    showActions.value = false;
    if (hideActionsTimer) {
        clearTimeout(hideActionsTimer);
        hideActionsTimer = null;
    }
}

function toggleActions(): void {
    showActions.value = !showActions.value;
    if (hideActionsTimer) clearTimeout(hideActionsTimer);
    if (showActions.value) hideActionsTimer = setTimeout(() => { showActions.value = false; }, 3000);
}

function revealActions(): void {
    showActions.value = true;
    if (hideActionsTimer) clearTimeout(hideActionsTimer);
    hideActionsTimer = setTimeout(() => { showActions.value = false; }, 3000);
}

async function sharePhoto(): Promise<void> {
    if (!currentPhoto.value) return;
    try {
        const res = await fetch(originalUrl(currentPhoto.value));
        const blob = await res.blob();
        const ext = blob.type.split('/')[1] ?? 'jpg';
        const file = new File([blob], `photo-${currentPhoto.value.id}.${ext}`, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file] });
        } else {
            await navigator.share({ url: window.location.href });
        }
    } catch {
        // user cancelled the share sheet — nothing to do
    }
}

function thumbUrl(photo: EventPhoto): string {
    return `/api/photos/${photo.id}/thumb`;
}

function displayUrl(photo: EventPhoto): string {
    return `/api/photos/${photo.id}/display`;
}

function originalUrl(photo: EventPhoto): string {
    return `/api/photos/${photo.id}/original`;
}

function formatDate(value: string | null): string {
    // eventDate is stored as UTC midnight for a plain calendar date — format in UTC so it doesn't shift a day in local timezones.
    return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
}

async function load(slug: string): Promise<void> {
    loading.value = true;
    error.value = '';
    const res = await fetch(`/api/gallery/${encodeURIComponent(slug)}`);
    if (!res.ok) {
        error.value = 'That event is not available.';
        loading.value = false;
        return;
    }
    const data = (await res.json()) as { event: GalleryEventDetail; photos: EventPhoto[] };
    event.value = data.event;
    photos.value = data.photos;
    loading.value = false;
}

function openLightbox(index: number): void {
    lightboxIndex.value = index;
    revealActions();
}

function closeLightbox(): void {
    hideActions();
    lightboxIndex.value = null;
}

function showPrev(): void {
    if (lightboxIndex.value === null) return;
    revealActions();
    slideDirection.value = 'prev';
    lightboxIndex.value = (lightboxIndex.value - 1 + photos.value.length) % photos.value.length;
}

function showNext(): void {
    if (lightboxIndex.value === null) return;
    revealActions();
    slideDirection.value = 'next';
    lightboxIndex.value = (lightboxIndex.value + 1) % photos.value.length;
}

function onKeydown(e: KeyboardEvent): void {
    if (lightboxIndex.value === null) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') showPrev();
    else if (e.key === 'ArrowRight') showNext();
}

// Preload the adjacent images so prev/next feels instant.
watch(lightboxIndex, (index) => {
    if (index === null || !photos.value.length) return;
    for (const offset of [-1, 1]) {
        const neighbor = photos.value[(index + offset + photos.value.length) % photos.value.length];
        if (neighbor) new Image().src = displayUrl(neighbor);
    }
});

let touchStartX = 0;
let isMultiTouch = false;
function onTouchStart(e: TouchEvent): void {
    isMultiTouch = e.touches.length > 1;
    touchStartX = e.changedTouches[0]?.clientX ?? 0;
}
function onTouchMove(e: TouchEvent): void {
    if (e.touches.length > 1) isMultiTouch = true;
}
function onTouchEnd(e: TouchEvent): void {
    // Let taps that land directly on a button (close/prev/next/download/share) fire their own click normally.
    if ((e.target as HTMLElement | null)?.closest('button')) return;
    e.preventDefault();
    if (isMultiTouch) return;
    const endX = e.changedTouches[0]?.clientX ?? 0;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 40) {
        toggleActions();
        return;
    }
    if (delta > 0) showPrev();
    else showNext();
}

watch(() => route.params.slug, (slug) => {
    if (typeof slug === 'string') void load(slug);
}, { immediate: true });

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <section class="space-y-6 py-4 sm:py-8">
    <BreadcrumbNav :trail="[{ to: '/gallery', title: 'Photo Gallery' }]" :current="event?.name ?? ''" />

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <p v-else-if="loading" class="text-sm text-content-muted">Loading…</p>

    <template v-else-if="event">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-3xl font-semibold tracking-tight text-content">{{ event.name }}</h2>
          <span v-if="event.isDraft" class="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Draft - Not visible to public
          </span>
        </div>
        <p v-if="event.eventDate" class="mt-1 text-sm text-content-muted">{{ formatDate(event.eventDate) }}</p>
        <p v-if="event.description" class="mt-2 max-w-2xl text-content-muted">{{ event.description }}</p>
      </div>

      <div
        v-if="photos.length"
        class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
      >
        <button
          v-for="(photo, index) in photos"
          :key="photo.id"
          type="button"
          class="aspect-square overflow-hidden rounded-xl border border-theme-border bg-app-bg transition-all hover:scale-[1.02] hover:brightness-110"
          @click="openLightbox(index)"
        >
          <img :src="thumbUrl(photo)" :alt="photo.caption ?? ''" class="h-full w-full object-cover" loading="lazy" />
        </button>
      </div>
      <p v-else class="rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-8 text-center text-sm text-content-muted">
        No photos in this event yet.
      </p>
    </template>

    <div
      v-if="currentPhoto"
      class="fixed inset-0 z-50 flex flex-col bg-[#171818]"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @click="toggleActions"
      @mousemove="revealActions"
    >
      <button type="button" class="absolute right-4 top-4 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60" aria-label="Close" @click.stop="closeLightbox">
        <X class="h-6 w-6" />
      </button>
      <Transition name="fade">
        <button
          v-if="showActions && canShare"
          type="button"
          class="absolute left-4 top-4 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
          aria-label="Share photo"
          @click.stop="sharePhoto"
        >
          <Share2 class="h-5 w-5" />
        </button>
      </Transition>
      <Transition name="fade">
        <button
          v-if="photos.length > 1 && showActions"
          type="button"
          class="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:left-4"
          aria-label="Previous photo"
          @click.stop="showPrev"
        >
          <ChevronLeft class="h-7 w-7" />
        </button>
      </Transition>
      <Transition name="fade">
        <button
          v-if="photos.length > 1 && showActions"
          type="button"
          class="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:right-4"
          aria-label="Next photo"
          @click.stop="showNext"
        >
          <ChevronRight class="h-7 w-7" />
        </button>
      </Transition>

      <div class="relative min-h-0 flex-1 overflow-hidden">
        <Transition :name="transitionName">
          <div :key="currentPhoto.id" class="absolute inset-0 flex items-center justify-center p-4">
            <img :src="displayUrl(currentPhoto)" :alt="currentPhoto.caption ?? ''" class="max-h-full max-w-full object-contain" />
          </div>
        </Transition>
      </div>

      <p v-if="currentPhoto.caption" class="pb-6 text-center text-sm text-white/80">{{ currentPhoto.caption }}</p>
    </div>
  </section>
</template>

<style scoped>
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.slide-next-enter-from { transform: translateX(100%); opacity: 0; }
.slide-next-leave-to { transform: translateX(-100%); opacity: 0; }
.slide-prev-enter-from { transform: translateX(-100%); opacity: 0; }
.slide-prev-leave-to { transform: translateX(100%); opacity: 0; }
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
