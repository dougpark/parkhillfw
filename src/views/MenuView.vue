<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';
import NavCardGrid from '../components/menus/NavCardGrid.vue';
import type { NavNode } from '../components/menus/menuTree';

const route = useRoute();

const title = ref('');
const description = ref<string | null>(null);
const breadcrumbs = ref<Array<{ slug: string | null; title: string }>>([]);
const items = ref<NavNode[]>([]);
const loading = ref(true);
const error = ref('');

async function load(slug: string): Promise<void> {
  loading.value = true;
  error.value = '';
  const response = await fetch(`/api/nav/${encodeURIComponent(slug)}`);
  if (!response.ok) {
    error.value = 'That menu is not available.';
    loading.value = false;
    return;
  }
  const data = await response.json() as {
    menu: { title: string; description: string | null };
    breadcrumbs: Array<{ slug: string | null; title: string }>;
    items: NavNode[];
  };
  title.value = data.menu.title;
  description.value = data.menu.description;
  breadcrumbs.value = data.breadcrumbs;
  items.value = data.items;
  loading.value = false;
}

watch(() => route.params.slug, (slug) => {
  if (typeof slug === 'string') void load(slug);
}, { immediate: true });
</script>

<template>
  <section class="space-y-6 py-4 sm:py-8">
    <BreadcrumbNav :trail="breadcrumbs.map((crumb) => ({ to: `/menu/${crumb.slug}`, title: crumb.title }))" :current="title" />

    <div>
      <h2 class="text-3xl font-semibold tracking-tight text-content">{{ title }}</h2>
      <p v-if="description" class="mt-2 max-w-xl text-content-muted">{{ description }}</p>
    </div>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <p v-else-if="loading" class="text-sm text-content-muted">Loading…</p>
    <NavCardGrid v-else-if="items.length" :items="items" />
    <p v-else class="rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-8 text-center text-sm text-content-muted">
      Nothing here yet.
    </p>

    <div>
      <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="$router.back()">
        ← Back
      </button>
    </div>
  </section>
</template>
