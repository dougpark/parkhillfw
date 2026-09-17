<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// Lazy-loaded so the pdf.js viewer it bundles is only fetched when a document is previewed.
const DocumentLinkModal = defineAsyncComponent(() => import('../components/documents/DocumentLinkModal.vue'));

// Fallback full-page route for /library/folders/:id — used when a folder
// link is opened directly (new tab, shared link) instead of clicked inline.
const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));
</script>

<template>
  <DocumentLinkModal kind="folder" :id="id" @close="router.push('/home')" />
</template>
