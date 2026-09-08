<script setup lang="ts">
import {
    Bold,
    Code,
    Heading,
    Image as ImageIcon,
    Italic,
    Link as LinkIcon,
    List,
    ListTodo,
    Table as TableIcon,
    Underline,
} from 'lucide-vue-next';
import type { MarkdownCommand } from './markdownCommands';

const emit = defineEmits<{ command: [name: MarkdownCommand] }>();

const buttons: Array<{ name: MarkdownCommand; label: string; icon: unknown }> = [
    { name: 'bold', label: 'Bold', icon: Bold },
    { name: 'italic', label: 'Italic', icon: Italic },
    { name: 'underline', label: 'Underline', icon: Underline },
    { name: 'heading', label: 'Heading (cycles H1 → H2 → H3 → none)', icon: Heading },
    { name: 'code', label: 'Code', icon: Code },
    { name: 'link', label: 'Link', icon: LinkIcon },
    { name: 'image', label: 'Image', icon: ImageIcon },
    { name: 'table', label: 'Table', icon: TableIcon },
    { name: 'bullet', label: 'Bullet list', icon: List },
    { name: 'checklist', label: 'Checklist (cycles unchecked → checked → plain)', icon: ListTodo },
];
</script>

<template>
  <div class="flex flex-wrap items-center gap-1 rounded-xl border border-[#e1e3e1] bg-[#f0f4f9] p-2" role="toolbar" aria-label="Markdown formatting">
    <button
      v-for="button in buttons"
      :key="button.name"
      type="button"
      :title="button.label"
      :aria-label="button.label"
      class="flex h-9 w-9 items-center justify-center rounded-lg text-[#444746] transition-colors hover:bg-white hover:text-[#1a73e8]"
      @click="emit('command', button.name)"
    >
      <component :is="button.icon" class="h-4 w-4" />
    </button>
  </div>
</template>
