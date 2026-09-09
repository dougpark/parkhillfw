<script setup lang="ts">
import { ref } from 'vue';
import { ClipboardList, FileText, FolderTree, Users } from 'lucide-vue-next';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';
import AdminAccessRequestsView from './AdminAccessRequestsView.vue';

import AdminDirectoryView from './AdminDirectoryView.vue';

import AdminMenusView from './AdminMenusView.vue';

import AdminPagesView from './AdminPagesView.vue';

const selectedFeature = ref('Access Requests');

const features = [
  { label: 'Access Requests', description: 'Review unmatched resident requests.', icon: ClipboardList },
  { label: 'Directory', description: 'Edit households and residents.', icon: Users },
  { label: 'Pages', description: 'Manage neighborhood pages.', icon: FileText },
  { label: 'Navigation', description: 'Organize navigation and folders.', icon: FolderTree },
  { label: 'Users', description: 'Manage users and Login Emails.', icon: Users },
];

function selectFeature(label: string) {
  selectedFeature.value = label;
}
</script>

<template>
  <section class="space-y-6">
    <BreadcrumbNav
      :trail="[{ title: 'Admin' }]"
      :current="selectedFeature"
      @crumb-click="selectedFeature = 'Access Requests'"
    />

    <div>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Administration</h2>
      </div>

    <!-- Pages renders full-width so the markdown editor is not squeezed by the sidebar -->
    <div
      v-if="selectedFeature === 'Pages'"
      class="rounded-3xl border border-[#e1e3e1] bg-white p-6 shadow-sm sm:p-8"
    >
      <AdminPagesView @exit="selectedFeature = 'Access Requests'" />
    </div>

    <!-- Menus needs the full width for the hierarchy editor's indent guides -->
    <div
      v-else-if="selectedFeature === 'Navigation'"
      class="rounded-3xl border border-[#e1e3e1] bg-white p-6 shadow-sm sm:p-8"
    >
      <AdminMenusView @exit="selectedFeature = 'Access Requests'" />
    </div>

    <div v-else class="grid min-h-112 overflow-hidden rounded-3xl border border-[#e1e3e1] bg-white shadow-sm md:grid-cols-[16rem_1fr]">
      <nav class="border-b border-[#e1e3e1] bg-[#f0f4f9] p-3 md:border-b-0 md:border-r" aria-label="Admin features">
        <button
          v-for="feature in features"
          :key="feature.label"
          type="button"
          class="mb-1 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
          :class="selectedFeature === feature.label ? 'bg-white text-[#1a73e8] shadow-sm' : 'text-[#444746] hover:bg-white/70'"
          @click="selectFeature(feature.label)"
        >
          <component :is="feature.icon" class="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span class="block text-sm font-medium">{{ feature.label }}</span>
            <span class="mt-0.5 block text-xs text-[#444746]">{{ feature.description }}</span>
          </span>
        </button>
      </nav>

      <div v-if="selectedFeature === 'Access Requests'" class="p-6 sm:p-8">
        <AdminAccessRequestsView />
      </div>
      <div v-else-if="selectedFeature === 'Directory'" class="p-6 sm:p-8">
        <AdminDirectoryView />
        
        
      </div>
      <div v-else class="p-6 sm:p-8">
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
