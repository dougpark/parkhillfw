<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import 'github-markdown-css/github-markdown.css';

// Shared renderer for the editor preview overlay AND the public page view,
// so what editors see is exactly what visitors get.
const props = defineProps<{ source: string }>();

// html: true is required for underline (<u>) support. Page authoring is
// restricted to page editors/admins, matching the CMS trust model.
const md = new MarkdownIt({ html: true, linkify: true }).use(taskLists, { enabled: false, label: true });

const rendered = computed(() => md.render(props.source ?? ''));
</script>

<template>
  <article class="markdown-body parkhill-markdown" v-html="rendered" />
</template>

<style scoped>
.markdown-body {
    background: transparent;
    color: #1f1f1f;
    font-family: inherit;
    font-size: 1rem;
    box-sizing: border-box;
    min-width: 0;
}

.markdown-body :deep(img) {
    display: block;
    max-width: 100%;
    height: auto;
    margin-left: auto;
    margin-right: auto;
}

.markdown-body :deep(.task-list-item) {
    list-style-type: none;
}

.markdown-body :deep(.task-list-item-checkbox) {
    margin: 0 0.5rem 0.2rem -1.4rem;
    vertical-align: middle;
}
</style>
