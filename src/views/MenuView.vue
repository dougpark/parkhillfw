<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronRight, Home } from 'lucide-vue-next';
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
    <nav class="flex flex-wrap items-center gap-1 text-sm text-[#444746]" aria-label="Breadcrumb">
      <RouterLink to="/home" class="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-[#f0f4f9]">
        <Home class="h-4 w-4" />
        Home
      </RouterLink>
      <template v-for="crumb in breadcrumbs" :key="crumb.slug ?? crumb.title">
        <ChevronRight class="h-4 w-4" aria-hidden="true" />
        <RouterLink :to="`/menu/${crumb.slug}`" class="rounded-full px-2 py-1 hover:bg-[#f0f4f9]">{{ crumb.title }}</RouterLink>
      </template>
      <ChevronRight class="h-4 w-4" aria-hidden="true" />
      <span class="px-2 py-1 font-medium text-[#1f1f1f]">{{ title }}</span>
    </nav>

    <div>
      <h2 class="text-3xl font-semibold tracking-tight text-[#1f1f1f]">{{ title }}</h2>
      <p v-if="description" class="mt-2 max-w-xl text-[#444746]">{{ description }}</p>
    </div>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-else-if="loading" class="text-sm text-[#444746]">Loading…</p>
    <NavCardGrid v-else-if="items.length" :items="items" />
    <p v-else class="rounded-2xl border border-dashed border-[#c4c7c5] bg-[#f8fafd] p-8 text-center text-sm text-[#444746]">
      Nothing here yet.
    </p>

    <div>
      <button type="button" class="rounded-full border border-[#e1e3e1] px-4 py-2 text-sm font-medium text-[#444746] hover:bg-[#f0f4f9]" @click="$router.back()">
        ← Back
      </button>
    </div>
  </section>
</template>
