<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import MarkdownPreview from '../components/common/MarkdownPreview.vue';

interface PublicPage {
    title: string;
    bodyMd: string;
    updatedAt: string;
}

const route = useRoute();
const page = ref<PublicPage | null>(null);
const error = ref('');

onMounted(async () => {
    const res = await fetch(`/api/pages/${route.params.slug}`);
    if (!res.ok) {
        error.value = 'This page is not available.';
        return;
    }
    page.value = (await res.json()) as PublicPage;
});
</script>

<template>
  <section class="mx-auto max-w-3xl">
    <p v-if="error" class="rounded-2xl border border-dashed border-[#c4c7c5] bg-[#f8fafd] p-6 text-center text-sm text-[#444746]">
      {{ error }}
    </p>
    <template v-else-if="page">
      <h2 class="text-2xl font-semibold tracking-tight">{{ page.title }}</h2>
      <MarkdownPreview class="mt-6" :source="page.bodyMd" />
    </template>
    <p v-else class="text-sm text-[#444746]">Loading…</p>
  </section>
</template>
