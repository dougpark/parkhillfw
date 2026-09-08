<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Check, Copy, FileText, Trash2, Upload } from 'lucide-vue-next';

interface Attachment {
    id: number;
    r2Key: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
}

const props = defineProps<{ pageId: number }>();
const emit = defineEmits<{ insert: [snippet: string] }>();

const attachments = ref<Attachment[]>([]);
const uploading = ref(false);
const error = ref('');
const dragOver = ref(false);
const copiedId = ref<number | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

function fileUrl(attachment: Attachment): string {
    return `/api/files/${attachment.r2Key}`;
}

function snippetFor(attachment: Attachment): string {
    const url = fileUrl(attachment);
    return attachment.mimeType.startsWith('image/')
        ? `![${attachment.filename}](${url})`
        : `[${attachment.filename}](${url})`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function load(): Promise<void> {
    const res = await fetch(`/api/admin/pages/${props.pageId}/attachments`);
    if (res.ok) attachments.value = (await res.json()) as Attachment[];
}

async function upload(files: FileList | File[]): Promise<void> {
    uploading.value = true;
    error.value = '';
    for (const file of [...files]) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/admin/pages/${props.pageId}/attachments`, { method: 'POST', body: formData });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            error.value = body.error ?? `Upload failed for ${file.name}.`;
        }
    }
    uploading.value = false;
    await load();
}

async function remove(attachment: Attachment): Promise<void> {
    if (!window.confirm(`Delete ${attachment.filename}? Any markdown links to it will break.`)) return;
    const res = await fetch(`/api/admin/attachments/${attachment.id}`, { method: 'DELETE' });
    if (res.ok) await load();
    else error.value = 'Could not delete the attachment.';
}

async function copySnippet(attachment: Attachment): Promise<void> {
    await navigator.clipboard.writeText(snippetFor(attachment));
    copiedId.value = attachment.id;
    setTimeout(() => {
        if (copiedId.value === attachment.id) copiedId.value = null;
    }, 1500);
}

function onDrop(event: DragEvent): void {
    dragOver.value = false;
    if (event.dataTransfer?.files.length) void upload(event.dataTransfer.files);
}

function onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void upload(input.files);
    input.value = '';
}

onMounted(load);
defineExpose({ load });
</script>

<template>
  <section class="rounded-xl border border-[#e1e3e1] bg-white p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 class="text-sm font-semibold">Attachments</h4>
      <button
        type="button"
        class="flex items-center gap-2 rounded-full bg-[#e8f0fe] px-4 py-2 text-sm font-medium text-[#0b57d0] transition-opacity hover:opacity-80"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        <Upload class="h-4 w-4" />
        {{ uploading ? 'Uploading…' : 'Upload' }}
      </button>
      <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePicked" />
    </div>

    <div
      class="mt-3 rounded-xl border border-dashed p-4 text-center text-sm text-[#444746] transition-colors"
      :class="dragOver ? 'border-[#1a73e8] bg-[#e8f0fe]' : 'border-[#c4c7c5] bg-[#f8fafd]'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <p>Drag and drop files here, paste images into the editor, or use Upload.</p>
      <p class="mt-1 text-xs text-[#444746]/70">
        Allowed: images (PNG, JPEG, GIF, WebP, SVG), PDF, text, Markdown, CSV, ZIP — up to 10 MB each.
      </p>
    </div>

    <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>

    <ul v-if="attachments.length" class="mt-3 divide-y divide-[#e1e3e1]">
      <li v-for="attachment in attachments" :key="attachment.id" class="flex items-center gap-3 py-2">
        <img
          v-if="attachment.mimeType.startsWith('image/')"
          :src="fileUrl(attachment)"
          :alt="attachment.filename"
          class="h-10 w-10 shrink-0 rounded-lg border border-[#e1e3e1] object-cover"
        />
        <FileText v-else class="h-6 w-6 shrink-0 text-[#444746]" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ attachment.filename }}</p>
          <p class="text-xs text-[#444746]">{{ attachment.mimeType }} · {{ formatSize(attachment.sizeBytes) }}</p>
        </div>
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-medium text-[#0b57d0] transition-colors hover:bg-[#e8f0fe]"
          @click="emit('insert', snippetFor(attachment))"
        >
          Insert
        </button>
        <button
          type="button"
          :title="copiedId === attachment.id ? 'Copied!' : 'Copy markdown link'"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-[#444746] transition-colors hover:bg-[#f0f4f9] hover:text-[#1a73e8]"
          @click="copySnippet(attachment)"
        >
          <Check v-if="copiedId === attachment.id" class="h-4 w-4 text-green-600" />
          <Copy v-else class="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Delete attachment"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-[#444746] transition-colors hover:bg-red-50 hover:text-red-600"
          @click="remove(attachment)"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </li>
    </ul>
    <p v-else class="mt-3 text-sm text-[#444746]">No attachments yet.</p>
  </section>
</template>
