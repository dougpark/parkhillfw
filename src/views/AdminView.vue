<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ClipboardList, FileText, FolderTree, Gauge, ShieldCheck, Users } from 'lucide-vue-next';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';
import AdminAccessControlView from './AdminAccessControlView.vue';
import AdminAccessRequestsView from './AdminAccessRequestsView.vue';
import AdminStatusView from './AdminStatusView.vue';

import AdminDirectoryView from './AdminDirectoryView.vue';

import AdminLoginUsersView from './AdminLoginUsersView.vue';

import AdminMenusView from './AdminMenusView.vue';

import AdminPagesView from './AdminPagesView.vue';

type Role = 'any' | 'admin' | 'directoryEditor' | 'pageEditor';

const selectedFeature = ref('Status');
const permissions = ref({ isOwner: false, isAdmin: false, isPageEditor: false, isDirectoryEditor: false });

const allFeatures: { label: string; description: string; icon: unknown; role: Role }[] = [
  { label: 'Status', description: 'Review database and request counts.', icon: Gauge, role: 'any' },
  { label: 'Access Requests', description: 'Review unmatched resident requests.', icon: ClipboardList, role: 'admin' },
  { label: 'Directory', description: 'Edit households and residents.', icon: Users, role: 'directoryEditor' },
  { label: 'Pages', description: 'Manage neighborhood pages.', icon: FileText, role: 'pageEditor' },
  { label: 'Navigation', description: 'Organize navigation and folders.', icon: FolderTree, role: 'pageEditor' },
  { label: 'Login Accounts', description: 'Manage login account status, sessions, and sign-in links.', icon: Users, role: 'admin' },
  { label: 'Access Control', description: 'Grant and revoke Admin, Page, and Directory permissions.', icon: ShieldCheck, role: 'admin' },
];

const isAdmin = computed(() => permissions.value.isAdmin || permissions.value.isOwner);

function allows(role: Role) {
  if (role === 'admin') return isAdmin.value;
  if (role === 'pageEditor') return isAdmin.value || permissions.value.isPageEditor;
  if (role === 'directoryEditor') return isAdmin.value || permissions.value.isDirectoryEditor;
  return true;
}

const features = computed(() => allFeatures.filter((feature) => allows(feature.role)));

onMounted(async () => {
  const response = await fetch('/api/auth/me');
  if (!response.ok) return;
  const data = await response.json() as { user?: Partial<typeof permissions.value> };
  permissions.value = {
    isOwner: Boolean(data.user?.isOwner),
    isAdmin: Boolean(data.user?.isAdmin),
    isPageEditor: Boolean(data.user?.isPageEditor),
    isDirectoryEditor: Boolean(data.user?.isDirectoryEditor),
  };
});

// Falls back to the first permitted tab so a revoked permission cannot leave a stale pane open.
watch(features, (list) => {
  if (!list.some((feature) => feature.label === selectedFeature.value)) {
    selectedFeature.value = list[0]?.label ?? 'Status';
  }
});

function selectFeature(label: string) {
  if (!features.value.some((feature) => feature.label === label)) return;
  selectedFeature.value = label;
}
</script>

<template>
  <section class="space-y-6">
    <BreadcrumbNav
      :trail="[{ title: 'Admin' }]"
      :current="selectedFeature"
      @crumb-click="selectedFeature = 'Status'"
    />

    <div>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Administration</h2>
      </div>

    <!-- Pages renders full-width so the markdown editor is not squeezed by the sidebar -->
    <div
      v-if="selectedFeature === 'Pages'"
      class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm sm:p-8"
    >
      <AdminPagesView @exit="selectedFeature = 'Status'" />
    </div>

    <!-- Menus needs the full width for the hierarchy editor's indent guides -->
    <div
      v-else-if="selectedFeature === 'Navigation'"
      class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm sm:p-8"
    >
      <AdminMenusView @exit="selectedFeature = 'Status'" />
    </div>

    <div v-else class="grid min-h-112 overflow-hidden rounded-3xl border border-theme-border bg-surface shadow-sm md:grid-cols-[16rem_1fr]">
      <nav class="border-b border-theme-border bg-app-bg p-3 md:border-b-0 md:border-r" aria-label="Admin features">
        <button
          v-for="feature in features"
          :key="feature.label"
          type="button"
          class="mb-1 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
          :class="selectedFeature === feature.label ? 'bg-surface text-accent shadow-sm' : 'text-content-muted hover:bg-surface/70'"
          @click="selectFeature(feature.label)"
        >
          <component :is="feature.icon" class="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span class="block text-sm font-medium">{{ feature.label }}</span>
            <span class="mt-0.5 block text-xs text-content-muted">{{ feature.description }}</span>
          </span>
        </button>
      </nav>

      <div v-if="selectedFeature === 'Access Requests'" class="p-6 sm:p-8">
        <AdminAccessRequestsView />
      </div>
      <div v-else-if="selectedFeature === 'Status'" class="p-6 sm:p-8">
        <AdminStatusView />
      </div>
      <div v-else-if="selectedFeature === 'Directory'" class="p-6 sm:p-8">
        <AdminDirectoryView />
        
        
      </div>
      <div v-else-if="selectedFeature === 'Login Accounts'" class="p-6 sm:p-8">
        <AdminLoginUsersView />
      </div>
      <div v-else-if="selectedFeature === 'Access Control'" class="p-6 sm:p-8">
        <AdminAccessControlView />
      </div>
      <div v-else class="p-6 sm:p-8">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-xl font-semibold">{{ selectedFeature }}</h3>
            <p class="mt-2 text-sm text-content-muted">Select an item from this workspace to begin editing.</p>
          </div>
          <span class="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">Editor pane</span>
        </div>
        <div class="mt-8 flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-theme-border bg-surface-subtle p-6 text-center text-sm text-content-muted">
          {{ selectedFeature }} tools will appear here.
        </div>
      </div>
    </div>
  </section>
</template>
