<script setup lang="ts">
import { ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { MENU_ICON_NAMES, MENU_ICONS, menuIcon } from './menuIcons';
import type { MenuRow } from './menuTree';

const props = defineProps<{ row: MenuRow }>();
const emit = defineEmits<{ save: [payload: Record<string, unknown>]; close: [] }>();

const title = ref(props.row.title);
const slug = ref(props.row.slug ?? '');
const description = ref(props.row.description ?? '');
const iconName = ref(props.row.iconName ?? '');
const targetUrl = ref(props.row.targetUrl ?? '');
const isPublic = ref(props.row.isPublic);
const isDraft = ref(props.row.isDraft);
const error = ref('');

watch(() => props.row, (row) => {
  title.value = row.title;
  slug.value = row.slug ?? '';
  description.value = row.description ?? '';
  iconName.value = row.iconName ?? '';
  targetUrl.value = row.targetUrl ?? '';
  isPublic.value = row.isPublic;
  isDraft.value = row.isDraft;
});

function submit(): void {
  error.value = '';
  if (!title.value.trim()) {
    error.value = 'Title is required.';
    return;
  }
  if (props.row.kind === 'link' && !targetUrl.value.trim()) {
    error.value = 'A link URL is required.';
    return;
  }
  emit('save', {
    title: title.value.trim(),
    slug: slug.value.trim() || null,
    description: description.value.trim() || null,
    iconName: iconName.value || null,
    targetUrl: targetUrl.value.trim() || null,
    isPublic: isPublic.value,
    isDraft: isDraft.value,
  });
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" @click.self="emit('close')">
    <form class="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-xl" @submit.prevent="submit">
      <div class="flex items-center justify-between gap-4 border-b border-[#e1e3e1] p-6">
        <div class="flex items-center gap-3">
          <component :is="menuIcon(iconName, props.row.kind)" class="h-5 w-5 text-[#1a73e8]" />
          <h3 class="text-xl font-semibold text-[#1f1f1f]">Edit {{ props.row.kind === 'menu' ? 'menu' : props.row.kind }}</h3>
        </div>
        <button type="button" class="rounded-full p-2 text-[#444746] hover:bg-[#f0f4f9]" aria-label="Close" @click="emit('close')">
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="space-y-5 p-6">
        <label class="block">
          <span class="text-sm font-medium text-[#1f1f1f]">Title</span>
          <input v-model="title" type="text" class="mt-1 w-full rounded-xl border border-[#e1e3e1] px-4 py-3 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40" />
        </label>

        <label v-if="props.row.kind === 'menu'" class="block">
          <span class="text-sm font-medium text-[#1f1f1f]">Slug</span>
          <input v-model="slug" type="text" placeholder="auto-generated from the title" class="mt-1 w-full rounded-xl border border-[#e1e3e1] px-4 py-3 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40" />
          <span class="mt-1 block text-xs text-[#444746]">Used for the menu address: /menu/{{ slug || 'your-slug' }}</span>
        </label>

        <label v-if="props.row.kind === 'link'" class="block">
          <span class="text-sm font-medium text-[#1f1f1f]">Link URL</span>
          <input v-model="targetUrl" type="text" placeholder="https://example.com" class="mt-1 w-full rounded-xl border border-[#e1e3e1] px-4 py-3 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40" />
        </label>

        <p v-if="props.row.kind === 'page'" class="rounded-xl bg-[#f0f4f9] px-4 py-3 text-sm text-[#444746]">
          Links to page <span class="font-medium text-[#1f1f1f]">{{ props.row.pageTitle ?? 'missing page' }}</span>
        </p>

        <label class="block">
          <span class="text-sm font-medium text-[#1f1f1f]">Description</span>
          <textarea v-model="description" rows="2" class="mt-1 w-full rounded-xl border border-[#e1e3e1] px-4 py-3 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40" />
        </label>

        <div>
          <span class="text-sm font-medium text-[#1f1f1f]">Icon</span>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="name in MENU_ICON_NAMES"
              :key="name"
              type="button"
              class="rounded-xl border p-2.5 transition-colors"
              :class="iconName === name ? 'border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]' : 'border-[#e1e3e1] text-[#444746] hover:bg-[#f0f4f9]'"
              :aria-label="name"
              :aria-pressed="iconName === name"
              @click="iconName = iconName === name ? '' : name"
            >
              <component :is="MENU_ICONS[name]" class="h-5 w-5" />
            </button>
          </div>
        </div>

        <div class="space-y-3 rounded-2xl bg-[#f0f4f9] p-4">
          <label class="flex items-center gap-3 text-sm text-[#1f1f1f]">
            <input v-model="isDraft" type="checkbox" class="h-4 w-4 rounded" />
            Draft — hidden from everyone except editors
          </label>
          <label class="flex items-center gap-3 text-sm text-[#1f1f1f]">
            <input v-model="isPublic" type="checkbox" class="h-4 w-4 rounded" />
            Public — visible to visitors without directory access
          </label>
        </div>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </div>

      <div class="flex justify-end gap-3 border-t border-[#e1e3e1] p-6">
        <button type="button" class="rounded-full border border-[#e1e3e1] px-5 py-2.5 text-sm font-medium text-[#444746] hover:bg-[#f0f4f9]" @click="emit('close')">Cancel</button>
        <button type="submit" class="rounded-full bg-[#1a73e8] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">Save</button>
      </div>
    </form>
  </div>
</template>
