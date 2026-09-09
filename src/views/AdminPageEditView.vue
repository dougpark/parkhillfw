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
const emit = defineEmits<{ done: []; dirty: [value: boolean] }>();

const loading = ref(true);
const loadError = ref('');
const saveError = ref('');
const saving = ref(false);
const dirty = ref(false);
const showPreview = ref(false);
const lastSavedAt = ref<Date | null>(null);
let autosaveTimer: ReturnType<typeof setInterval> | null = null;

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

function cleanSlug(): void {
    const cleaned = slug.value
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]+/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-{2,}/g, '-');
    if (cleaned !== slug.value) slug.value = cleaned;
}

function markDirty(): void {
    dirty.value = true;
    emit('dirty', true);
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

    // Bare URL pasted over a selection -> wrap the selection as the link text.
    if (/^https?:\/\/\S+$/.test(converted) && view) {
        event.preventDefault();
        const { from, to } = view.state.selection.main;
        const selected = view.state.doc.sliceString(from, to);
        const insert = selected ? `[${selected}](${converted})` : `[link text](${converted})`;
        view.dispatch({
            changes: { from, to, insert },
            selection: selected
                ? { anchor: from + insert.length }
                : { anchor: from + 1, head: from + 1 + 'link text'.length },
        });
        view.focus();
        return;
    }

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

async function save(markAsDraft?: boolean): Promise<void> {
    // Guard against overlapping saves (blur + interval could collide).
    if (saving.value) return;
    saving.value = true;
    saveError.value = '';
    const publishing = markAsDraft === false;
    const res = await fetch(`/api/admin/pages/${props.pageId}${publishing ? '/publish' : ''}`, {
        method: publishing ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: title.value.trim(),
            slug: slug.value.trim(),
            bodyMd: bodyMd.value,
            isPublic: isPublic.value,
            ...(publishing ? {} : { isDraft: markAsDraft === true ? true : isDraft.value }),
        }),
    });
    saving.value = false;
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        saveError.value = body.error ?? 'Could not save the page.';
        return;
    }
    const data = (await res.json()) as { page: PageDetail };
    // Only take isDraft from the server on an explicit publish/unpublish toggle.
    // On quiet autosaves the local toggle state is authoritative — otherwise the
    // Draft/Published pill would flash/reset on every background save.
    if (markAsDraft !== undefined) isDraft.value = data.page.isDraft;
    isPublic.value = data.page.isPublic;
    updatedAt.value = data.page.updatedAt;
    lastSavedAt.value = new Date();
    dirty.value = false;
    emit('dirty', false);
}

// Quiet background save: preserves draft state, never touches CodeMirror, so
// the cursor and panel don't move. Used by blur + interval autosave.
function autosave(): void {
    if (loading.value || loadError.value || !dirty.value) return;
    void save();
}

// Toggle button behavior: publish a draft, or revert a published page to draft.
function togglePublish(): void {
    void save(isDraft.value ? false : true);
}

function startAutosave(): void {
    if (autosaveTimer) return;
    autosaveTimer = setInterval(autosave, 10_000);
}

function stopAutosave(): void {
    if (autosaveTimer) {
        clearInterval(autosaveTimer);
        autosaveTimer = null;
    }
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
    emit('dirty', false);
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
                    // Save when the editor loses focus — a natural pause point.
                    blur: () => autosave(),
                }),
            ],
        }),
    });
    window.addEventListener('beforeunload', onBeforeUnload);
    startAutosave();
});

onBeforeUnmount(() => {
    stopAutosave();
    window.removeEventListener('beforeunload', onBeforeUnload);
    view?.destroy();
    view = null;
});
</script>

<template>
  <div v-if="loading" class="p-6 text-sm text-content-muted">Loading page…</div>
  <div v-else-if="loadError" class="p-6 text-sm text-danger">{{ loadError }}</div>

  <div v-else class="flex min-h-[32rem] flex-col space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <input
        v-model="title"
        type="text"
        placeholder="Page title"
        class="min-w-0 flex-1 rounded-xl border border-theme-border bg-surface px-4 py-2.5 text-lg font-semibold outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/20"
        @input="markDirty"
      />
      <button
        type="button"
        class="rounded-full px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
        :class="isDraft ? 'bg-accent' : 'bg-content-muted'"
        :disabled="saving"
        @click="togglePublish"
      >
        {{ saving ? 'Saving…' : isDraft ? 'Publish' : 'Unpublish' }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm text-content-muted">
      <input
        v-model="slug"
        type="text"
        placeholder="slug"
        spellcheck="false"
        class="w-40 rounded-xl border border-theme-border bg-surface px-3 py-1.5 font-mono text-xs outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent/20"
        @input="cleanSlug(); markDirty()"
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
        :class="isPublic ? 'bg-accent/10 text-accent' : 'bg-app-bg text-content-muted'"
        title="Toggle public visibility"
        @click="isPublic = !isPublic; markDirty()"
      >
        {{ isPublic ? 'Public' : 'Members only' }}
      </button>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <span v-if="lastSavedAt && !dirty" class="text-xs text-content-muted">
          Saved {{ lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}
        </span>
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
          :class="showPreview ? 'bg-accent text-on-accent shadow' : 'border border-theme-border bg-surface text-content-muted hover:bg-app-bg'"
          :aria-pressed="showPreview"
          @click="showPreview = !showPreview"
        >
          Preview
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="dirty ? 'bg-accent text-on-accent shadow hover:opacity-90' : 'bg-accent/10 text-accent'"
          :disabled="saving"
          @click="save()"
        >
          {{ saving ? 'Saving…' : dirty ? 'Save ●' : 'Save' }}
        </button>
      </div>
    </div>

    <p v-if="saveError" class="rounded-xl border border-danger-border bg-danger-subtle px-4 py-2.5 text-sm text-danger" role="alert">
      {{ saveError }}
    </p>

    <EditorToolbar @command="onCommand" />

    <div class="relative min-h-[24rem] flex-1">
      <div ref="editorHost" class="h-full overflow-hidden rounded-xl border border-theme-border bg-surface" />
      <div
        v-if="showPreview"
        class="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-xl border border-theme-border bg-surface shadow-lg"
      >
        <div class="flex items-center justify-between border-b border-theme-border bg-app-bg px-4 py-2">
          <p class="text-sm font-medium text-content-muted">Preview — unsaved changes shown as-is</p>
          <button
            type="button"
            title="Close preview"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface"
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
