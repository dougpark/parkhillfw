<script setup lang="ts">
import { ref } from 'vue';
import { ClipboardList, FileText, FolderTree, Users } from 'lucide-vue-next';

const selectedFeature = ref('Access requests');

const features = [
  { label: 'Access requests', description: 'Review unmatched resident requests.', icon: ClipboardList },
  { label: 'Directory', description: 'Edit households and residents.', icon: Users },
  { label: 'Pages', description: 'Manage neighborhood pages.', icon: FileText },
  { label: 'Menus', description: 'Organize navigation and folders.', icon: FolderTree },
];
</script>

<template>
  <section class="space-y-6">
    <div>
      <p class="text-sm font-medium uppercase tracking-wide text-[#1a73e8]">Administration</p>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Manage Park Hill</h2>
      <p class="mt-2 text-[#444746]">Choose an area to manage from the list.</p>
    </div>

    <div class="grid min-h-[28rem] overflow-hidden rounded-3xl border border-[#e1e3e1] bg-white shadow-sm md:grid-cols-[16rem_1fr]">
      <nav class="border-b border-[#e1e3e1] bg-[#f0f4f9] p-3 md:border-b-0 md:border-r" aria-label="Admin features">
        <button
          v-for="feature in features"
          :key="feature.label"
          type="button"
          class="mb-1 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
          :class="selectedFeature === feature.label ? 'bg-white text-[#1a73e8] shadow-sm' : 'text-[#444746] hover:bg-white/70'"
          @click="selectedFeature = feature.label"
        >
          <component :is="feature.icon" class="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span class="block text-sm font-medium">{{ feature.label }}</span>
            <span class="mt-0.5 block text-xs text-[#444746]">{{ feature.description }}</span>
          </span>
        </button>
      </nav>

      <div class="p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-xl font-semibold">{{ selectedFeature }}</h3>
            <p class="mt-2 text-sm text-[#444746]">Select an item from this workspace to begin editing.</p>
          </div>
          <span class="rounded-full bg-[#e8f0fe] px-3 py-1 text-xs font-medium text-[#0b57d0]">Editor pane</span>
        </div>
        <div class="mt-8 flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-[#c4c7c5] bg-[#f8fafd] p-6 text-center text-sm text-[#444746]">
          {{ selectedFeature }} tools will appear here.
        </div>
      </div>
    </div>
  </section>
</template>
