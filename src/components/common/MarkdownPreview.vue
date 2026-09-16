<script setup lang="ts">
import { computed, ref } from 'vue';
import { createMarkdownRenderer } from '../../lib/markdown';
import { parseLibraryLink } from '../../composables/useDocumentLibrary';
import DocumentLinkModal from '../documents/DocumentLinkModal.vue';
import 'github-markdown-css/github-markdown.css';

// Shared renderer for the editor preview overlay AND the public page view,
// so what editors see is exactly what visitors get.
const props = defineProps<{ source: string }>();

// html: true is required for underline (<u>) support. Page authoring is
// restricted to page editors/admins, matching the CMS trust model.
const md = createMarkdownRenderer();

const rendered = computed(() => md.render(props.source ?? ''));

const activeLink = ref<{ kind: 'document' | 'folder'; id: number } | null>(null);

// Intercept clicks on /library/documents/:id and /library/folders/:id links
// so they open a modal (view/download or folder listing) instead of
// navigating away; modifier-clicks (new tab, etc.) still work normally.
function onContentClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    const link = parseLibraryLink(href);
    if (!link) return;
    event.preventDefault();
    activeLink.value = link;
}
</script>

<template>
  <article class="markdown-body parkhill-markdown" v-html="rendered" @click="onContentClick" />
  <DocumentLinkModal
    v-if="activeLink"
    :kind="activeLink.kind"
    :id="activeLink.id"
    @close="activeLink = null"
  />
</template>

<style scoped>
.markdown-body {
    background: transparent;
    color: var(--theme-text);
    --fgColor-default: var(--theme-text);
    --fgColor-muted: var(--theme-text-muted);
    --fgColor-accent: var(--theme-accent);
    --bgColor-default: transparent;
    --borderColor-default: var(--theme-border);
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
