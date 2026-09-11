<script setup lang="ts">
import { ref } from 'vue';
import {
    AlertTriangle,
    Bold,
    Code,
    Heading,
    Image as ImageIcon,
    Info,
    Italic,
    LayoutGrid,
    Link as LinkIcon,
    List,
    ListTodo,
    MessageSquareQuote,
    OctagonAlert,
    Table as TableIcon,
    Underline,
} from 'lucide-vue-next';
import type { MarkdownCommand } from './markdownCommands';

const emit = defineEmits<{ command: [name: MarkdownCommand] }>();

const isCalloutMenuOpen = ref(false);

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

function selectCallout(type: 'info' | 'warning' | 'danger') {
    isCalloutMenuOpen.value = false;
    emit('command', `callout-${type}`);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1 rounded-xl border border-theme-border bg-app-bg p-2" role="toolbar" aria-label="Markdown formatting">
    <button
      v-for="button in buttons"
      :key="button.name"
      type="button"
      :title="button.label"
      :aria-label="button.label"
      class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface hover:text-accent"
      @click="emit('command', button.name)"
    >
      <component :is="button.icon" class="h-4 w-4" />
    </button>

    <div class="h-5 w-px bg-theme-border mx-1" aria-hidden="true" />

    <!-- Custom Callout Dropdown Menu -->
    <div class="relative">
      <button
        type="button"
        title="Insert Callout Panel"
        aria-label="Insert Callout Panel"
        :aria-expanded="isCalloutMenuOpen"
        class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface hover:text-accent"
        @click="isCalloutMenuOpen = !isCalloutMenuOpen"
      >
        <MessageSquareQuote class="h-4 w-4" />
      </button>

      <div
        v-if="isCalloutMenuOpen"
        class="absolute left-0 top-full z-30 mt-1 w-44 rounded-xl border border-theme-border bg-surface p-1 shadow-lg"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-content hover:bg-surface-hover hover:text-accent"
          @click="selectCallout('info')"
        >
          <Info class="h-3.5 w-3.5 text-accent" />
          Info Box (Blue)
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-content hover:bg-surface-hover hover:text-warning"
          @click="selectCallout('warning')"
        >
          <AlertTriangle class="h-3.5 w-3.5 text-warning" />
          Warning Box (Yellow)
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-content hover:bg-surface-hover hover:text-danger"
          @click="selectCallout('danger')"
        >
          <OctagonAlert class="h-3.5 w-3.5 text-danger" />
          Danger Box (Red)
        </button>
      </div>
    </div>

    <!-- Image Row / Grid Container Button -->
    <button
      type="button"
      title="Insert Image Row / Grid (::: row)"
      aria-label="Insert Image Row / Grid"
      class="flex h-9 w-9 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface hover:text-accent"
      @click="emit('command', 'row')"
    >
      <LayoutGrid class="h-4 w-4" />
    </button>
  </div>
</template>
