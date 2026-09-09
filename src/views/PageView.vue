<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';
import MarkdownPreview from '../components/common/MarkdownPreview.vue';

interface PublicPage {
    title: string;
    bodyMd: string;
    updatedAt: string;
    breadcrumbs: Array<{ slug: string | null; title: string }>;
}

const route = useRoute();
const page = ref<PublicPage | null>(null);
const error = ref('');

async function load(slug: string): Promise<void> {
    error.value = '';
    page.value = null;
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}`);
    if (!res.ok) {
        error.value = 'This page is not available.';
        return;
    }
    page.value = (await res.json()) as PublicPage;
}

watch(() => route.params.slug, (slug) => {
    if (typeof slug === 'string') void load(slug);
}, { immediate: true });
</script>

<template>
  <section class="mx-auto max-w-3xl">
    <p v-if="error" class="rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-6 text-center text-sm text-content-muted">
      {{ error }}
    </p>
    <template v-else-if="page">
      <BreadcrumbNav :trail="page.breadcrumbs.map((crumb) => ({ to: `/menu/${crumb.slug}`, title: crumb.title }))" :current="page.title" />

      <h2 class="mt-4 text-2xl font-semibold tracking-tight">{{ page.title }}</h2>
      <MarkdownPreview class="mt-6" :source="page.bodyMd" />

      <div class="mt-8">
        <button type="button" class="rounded-full border border-theme-border px-4 py-2 text-sm font-medium text-content-muted hover:bg-app-bg" @click="$router.back()">
          ← Back
        </button>
      </div>
    </template>
    <p v-else class="text-sm text-content-muted">Loading…</p>
  </section>
</template>
