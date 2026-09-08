<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { basicSetup, EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { X } from 'lucide-vue-next';
import MarkdownPreview from '../components/common/MarkdownPreview.vue';
import EditorToolbar from '../components/pages/EditorToolbar.vue';
import AttachmentsPanel from '../components/pages/AttachmentsPanel.vue';
import { applyMarkdownCommand, type MarkdownCommand } from '../components/pages/markdownCommands';

interface PageDetail {
    id: number;
    slug: string;
    title: string;
    bodyMd: string;
    isPublic: boolean;
    isDraft: boolean;
    updatedAt: string;
    authorEmail: string | null;
}

const props = defineProps<{ pageId: number }>();
const emit = defineEmits<{ done: [] }>();

const loading = ref(true);
const loadError = ref('');
const saveError = ref('');
const saving = ref(false);
const dirty = ref(false);
const showPreview = ref(false);

const title = ref('');
const slug = ref('');
const bodyMd = ref('');
const isPublic = ref(false);
const isDraft = ref(true);
const updatedAt = ref<string | null>(null);
const authorEmail = ref<string | null>(null);

const editorHost = ref<HTMLElement | null>(null);
const attachmentsPanel = ref<InstanceType<typeof AttachmentsPanel> | null>(null);
let view: EditorView | null = null;

function formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleString() : '—';
}

function markDirty(): void {
    dirty.value = true;
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (dirty.value) event.preventDefault();
}

function toRelativeLinks(text: string): string {
    const origin = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`${origin}/api/files/`, 'g'), '/api/files/');
}

function insertAtCursor(text: string): void {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
    view.focus();
}

async function uploadFiles(files: File[]): Promise<void> {
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/admin/pages/${props.pageId}/attachments`, { method: 'POST', body: formData });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            saveError.value = body.error ?? `Upload failed for ${file.name}.`;
            continue;
        }
        const data = (await res.json()) as { snippet: string };
        insertAtCursor(data.snippet);
        await attachmentsPanel.value?.load();
    }
}

function handlePaste(event: ClipboardEvent): boolean | void {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length) {
        event.preventDefault();
        return void uploadFiles(files);
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const converted = toRelativeLinks(text);
    if (converted !== text && view) {
        event.preventDefault();
        insertAtCursor(converted);
    }
}

function handleDrop(event: DragEvent): boolean | void {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) {
        event.preventDefault();
        return void uploadFiles(files);
    }
}

function onCommand(name: MarkdownCommand): void {
    if (view) applyMarkdownCommand(view, name);
}

async function save(publish = false): Promise<void> {
    saving.value = true;
    saveError.value = '';
    const res = await fetch(`/api/admin/pages/${props.pageId}${publish ? '/publish' : ''}`, {
        method: publish ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: title.value.trim(),
            slug: slug.value.trim(),
            bodyMd: bodyMd.value,
            isPublic: isPublic.value,
            ...(publish ? {} : { isDraft: isDraft.value }),
        }),
    });
    saving.value = false;
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        saveError.value = body.error ?? 'Could not save the page.';
        return;
    }
    const data = (await res.json()) as { page: PageDetail };
    isDraft.value = data.page.isDraft;
    isPublic.value = data.page.isPublic;
    updatedAt.value = data.page.updatedAt;
    dirty.value = false;
}

function done(): void {
    if (dirty.value && !window.confirm('You have unsaved changes. Discard them?')) return;
    emit('done');
}

onMounted(async () => {
    const res = await fetch(`/api/admin/pages/${props.pageId}`);
    if (!res.ok) {
        loadError.value = 'Could not load this page.';
        loading.value = false;
        return;
    }
    const data = (await res.json()) as { page: PageDetail };
    title.value = data.page.title;
    slug.value = data.page.slug;
    bodyMd.value = data.page.bodyMd;
    isPublic.value = data.page.isPublic;
    isDraft.value = data.page.isDraft;
    updatedAt.value = data.page.updatedAt;
    authorEmail.value = data.page.authorEmail;
    loading.value = false;
    // The editor host only exists after the loading v-if flips, so wait a tick
    // before mounting CodeMirror into it.
    await nextTick();

    view = new EditorView({
        parent: editorHost.value!,
        state: EditorState.create({
            doc: bodyMd.value,
            extensions: [
                basicSetup,
                markdown({ base: markdownLanguage }),
                EditorView.lineWrapping,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        bodyMd.value = update.state.doc.toString();
                        dirty.value = true;
                    }
                }),
                EditorView.domEventHandlers({
                    paste: (event) => handlePaste(event),
                    drop: (event) => handleDrop(event),
                }),
            ],
        }),
    });
    window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    view?.destroy();
    view = null;
});
</script>

<template>
  <div v-if="loading" class="p-6 text-sm text-[#444746]">Loading page…</div>
  <div v-else-if="loadError" class="p-6 text-sm text-red-600">{{ loadError }}</div>

  <div v-else class="flex min-h-[32rem] flex-col space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <input
        v-model="title"
        type="text"
        placeholder="Page title"
        class="min-w-0 flex-1 rounded-xl border border-[#e1e3e1] bg-white px-4 py-2.5 text-lg font-semibold outline-none transition-shadow focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20"
        @input="markDirty"
      />
      <button
        type="button"
        class="rounded-full bg-[#0b57d0] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        :disabled="saving"
        @click="save(true)"
      >
        Publish
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm text-[#444746]">
      <input
        v-model="slug"
        type="text"
        placeholder="slug"
        spellcheck="false"
        class="w-40 rounded-xl border border-[#e1e3e1] bg-white px-3 py-1.5 font-mono text-xs outline-none transition-shadow focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20"
        @input="markDirty"
      />
      <span class="hidden sm:inline" aria-hidden="true">·</span>
      <span class="hidden sm:inline">By {{ authorEmail ?? 'unknown' }}</span>
      <span aria-hidden="true">·</span>
      <span>Last edited {{ formatDate(updatedAt) }}</span>
      <button
        type="button"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="isDraft ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'"
        title="Toggle draft status"
        @click="isDraft = !isDraft; markDirty()"
      >
        {{ isDraft ? 'Draft' : 'Published' }}
      </button>
      <button
        type="button"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="isPublic ? 'bg-[#e8f0fe] text-[#0b57d0]' : 'bg-[#f0f4f9] text-[#444746]'"
        title="Toggle public visibility"
        @click="isPublic = !isPublic; markDirty()"
      >
        {{ isPublic ? 'Public' : 'Members only' }}
      </button>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
          :class="showPreview ? 'bg-[#1a73e8] text-white shadow' : 'border border-[#e1e3e1] bg-white text-[#444746] hover:bg-[#f0f4f9]'"
          :aria-pressed="showPreview"
          @click="showPreview = !showPreview"
        >
          Preview
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="dirty ? 'bg-[#1a73e8] text-white shadow hover:opacity-90' : 'bg-[#e8f0fe] text-[#0b57d0]'"
          :disabled="saving"
          @click="save()"
        >
          {{ saving ? 'Saving…' : dirty ? 'Save ●' : 'Save' }}
        </button>
        <button
          type="button"
          class="rounded-full border border-[#e1e3e1] bg-white px-4 py-2 text-sm font-medium text-[#444746] transition-colors hover:bg-[#f0f4f9]"
          @click="done"
        >
          Done
        </button>
      </div>
    </div>

    <EditorToolbar @command="onCommand" />

    <div class="relative min-h-[24rem] flex-1">
      <div ref="editorHost" class="h-full overflow-hidden rounded-xl border border-[#e1e3e1] bg-white" />
      <div
        v-if="showPreview"
        class="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-xl border border-[#c4c7c5] bg-white shadow-lg"
      >
        <div class="flex items-center justify-between border-b border-[#e1e3e1] bg-[#f0f4f9] px-4 py-2">
          <p class="text-sm font-medium text-[#444746]">Preview — unsaved changes shown as-is</p>
          <button
            type="button"
            title="Close preview"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-[#444746] transition-colors hover:bg-white"
            @click="showPreview = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 overflow-auto p-6">
          <MarkdownPreview :source="bodyMd" />
        </div>
      </div>
    </div>

    <AttachmentsPanel ref="attachmentsPanel" :page-id="pageId" @insert="insertAtCursor" />

    <p v-if="saveError" class="text-sm text-red-600">{{ saveError }}</p>
  </div>
</template>

<style scoped>
:deep(.cm-editor) {
    height: 100%;
    min-height: 24rem;
    font-size: 0.95rem;
}

:deep(.cm-editor.cm-focused) {
    outline: 2px solid rgba(26, 115, 232, 0.4);
    outline-offset: -1px;
}

:deep(.cm-scroller) {
    overflow: auto;
}

:deep(.cm-content) {
    padding: 1rem 0.5rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
