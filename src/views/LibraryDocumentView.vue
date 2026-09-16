<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DocumentLinkModal from '../components/documents/DocumentLinkModal.vue';

// Fallback full-page route for /library/documents/:id — used when a document
// link is opened directly (new tab, shared link) instead of clicked inline.
const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));
</script>

<template>
  <DocumentLinkModal kind="document" :id="id" @close="router.push('/home')" />
</template>
