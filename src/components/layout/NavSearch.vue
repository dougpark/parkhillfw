<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Search, X } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import SearchResultsList from './SearchResultsList.vue';

interface DirectoryResult {
  id: number;
  streetAddress: string;
  residentSummary: string;
}

interface PageResult {
  slug: string;
  title: string;
  snippet: string;
}

const router = useRouter();
const root = ref<HTMLElement | null>(null);
const mobileInputEl = ref<HTMLInputElement | null>(null);
const query = ref('');
const isOpen = ref(false);
const mobileOpen = ref(false);
const isLoading = ref(false);
const directoryResults = ref<DirectoryResult[]>([]);
const pageResults = ref<PageResult[]>([]);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestToken = 0;

async function runSearch(term: string) {
  const token = ++requestToken;
  isLoading.value = true;
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    if (!response.ok || token !== requestToken) return;
    const data = await response.json() as { directory: DirectoryResult[]; pages: PageResult[] };
    directoryResults.value = data.directory;
    pageResults.value = data.pages;
  } catch {
    // Ignore network errors — leave prior results in place
  } finally {
    if (token === requestToken) isLoading.value = false;
  }
}

function onInput() {
  clearTimeout(debounceTimer);
  const term = query.value.trim();
  isOpen.value = true;
  if (term.length < 2) {
    directoryResults.value = [];
    pageResults.value = [];
    return;
  }
  debounceTimer = setTimeout(() => runSearch(term), 250);
}

function closePanel() {
  isOpen.value = false;
}

async function openMobile() {
  mobileOpen.value = true;
  if (query.value.trim()) isOpen.value = true;
  await nextTick();
  mobileInputEl.value?.focus();
}

function closeMobile() {
  mobileOpen.value = false;
  isOpen.value = false;
}

function reset() {
  isOpen.value = false;
  mobileOpen.value = false;
  query.value = '';
  directoryResults.value = [];
  pageResults.value = [];
}

function goToDirectoryEntry(result: DirectoryResult) {
  reset();
  router.push({ path: '/directory', query: { q: result.streetAddress } });
}

function goToPage(result: PageResult) {
  reset();
  router.push(`/pages/${result.slug}`);
}

function onDocumentClick(event: MouseEvent) {
  // Use composedPath (fixed at dispatch time) instead of contains() — the mobile
  // toggle button gets replaced by the popup on the same click, so by the time this
  // runs the original target node may already be detached and contains() would
  // wrongly report the click as "outside".
  if (root.value && event.composedPath().includes(root.value)) return;
  isOpen.value = false;
  mobileOpen.value = false;
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  clearTimeout(debounceTimer);
});
</script>

<template>
  <div ref="root" class="flex items-center justify-end">
    <!-- Desktop: always-visible inline search box -->
    <div class="relative hidden min-w-0 sm:block sm:w-64">
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        placeholder="Search directory & pages…"
        class="w-full rounded-full border border-theme-border bg-app-bg py-2 pl-9 pr-3 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        aria-label="Search directory and pages"
        @input="onInput"
        @focus="() => { if (query.trim()) isOpen = true; }"
        @keydown.escape="closePanel"
      />

      <div
        v-if="isOpen && query.trim().length >= 2"
        class="absolute right-0 top-full z-40 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-theme-border bg-surface shadow-lg"
      >
        <SearchResultsList
          :is-loading="isLoading"
          :directory-results="directoryResults"
          :page-results="pageResults"
          @select-directory="goToDirectoryEntry"
          @select-page="goToPage"
        />
      </div>
    </div>

    <!-- Mobile: subtle icon that opens a small popup search box -->
    <button
      v-if="!mobileOpen"
      type="button"
      class="inline-flex h-11 w-11 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-hover hover:text-content sm:hidden"
      aria-label="Search"
      @click="openMobile"
    >
      <Search class="h-5 w-5" />
    </button>

    <div
      v-if="mobileOpen"
      class="absolute inset-x-3 top-full z-40 mt-2 rounded-2xl border border-theme-border bg-surface p-2 shadow-lg sm:hidden"
    >
      <div class="relative">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden="true" />
        <input
          ref="mobileInputEl"
          v-model="query"
          type="search"
          placeholder="Search directory & pages…"
          class="w-full rounded-full border border-theme-border bg-app-bg py-2 pl-9 pr-8 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          aria-label="Search directory and pages"
          @input="onInput"
          @keydown.escape="closeMobile"
        />
        <button
          type="button"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-content-muted hover:bg-surface-hover"
          aria-label="Close search"
          @click="closeMobile"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div v-if="query.trim().length >= 2" class="mt-2 max-h-72 overflow-y-auto rounded-xl border border-theme-border">
        <SearchResultsList
          :is-loading="isLoading"
          :directory-results="directoryResults"
          :page-results="pageResults"
          @select-directory="goToDirectoryEntry"
          @select-page="goToPage"
        />
      </div>
    </div>
  </div>
</template>
