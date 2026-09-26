<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Archive, ChevronDown, ClipboardList, Clock, DollarSign, FileArchive, FileText, FolderTree, Gauge, Images, Receipt, ScrollText, Settings, ShieldCheck, Users } from 'lucide-vue-next';
import BreadcrumbNav from '../components/common/BreadcrumbNav.vue';
import AdminAccessControlView from './AdminAccessControlView.vue';
import AdminAccessRequestsView from './AdminAccessRequestsView.vue';
import AdminArchiveBrowserView from './AdminArchiveBrowserView.vue';
import AdminFinanceDuesView from './AdminFinanceDuesView.vue';
import AdminFinancePaymentProcessorView from './AdminFinancePaymentProcessorView.vue';
import AdminFinanceReportsView from './AdminFinanceReportsView.vue';
import AdminFinanceTransactionReportView from './AdminFinanceTransactionReportView.vue';
import AdminLastSeenView from './AdminLastSeenView.vue';
import AdminLogsView from './AdminLogsView.vue';
import AdminStatusView from './AdminStatusView.vue';

import AdminDirectoryView from './AdminDirectoryView.vue';

import AdminLoginUsersView from './AdminLoginUsersView.vue';

import AdminMenusView from './AdminMenusView.vue';

import AdminPagesView from './AdminPagesView.vue';

import AdminPhotosView from './AdminPhotosView.vue';

import AdminSettingsView from './AdminSettingsView.vue';

import AdminDocumentsView from './AdminDocumentsView.vue';

type Role = 'any' | 'admin' | 'directoryEditor' | 'pageEditor' | 'finance';

interface AdminFeature {
  label: string;
  description: string;
  icon: unknown;
  role: Role;
  // Valid navigation target, but not rendered as its own sidebar row (e.g. reached via a report list panel).
  hidden?: boolean;
}

interface AdminMenuSection {
  label: string;
  description: string;
  icon: unknown;
  role: Role;
  disabled?: boolean;
  badge?: string;
  feature?: AdminFeature;
  children?: AdminFeature[];
}

const ACCORDION_STORAGE_KEY = 'parkhillfw.admin.expandedSection';

const selectedFeature = ref('Status');
const expandedSection = ref<string | null>(null);
const permissions = ref({ isOwner: false, isAdmin: false, isPageEditor: false, isDirectoryEditor: false, isFinance: false });

const adminMenuSections: AdminMenuSection[] = [
  {
    label: 'Status',
    description: 'Review database and request counts.',
    icon: Gauge,
    role: 'any',
    feature: { label: 'Status', description: 'Review database and request counts.', icon: Gauge, role: 'any' },
  },
  {
    label: 'Directory',
    description: 'Edit households and residents.',
    icon: Users,
    role: 'directoryEditor',
    feature: { label: 'Directory', description: 'Edit households and residents.', icon: Users, role: 'directoryEditor' },
  },
  {
    label: 'Site Content',
    description: 'Manage pages and navigation.',
    icon: FileText,
    role: 'pageEditor',
    children: [
      { label: 'Pages', description: 'Manage neighborhood pages.', icon: FileText, role: 'pageEditor' },
      { label: 'Navigation', description: 'Organize navigation and folders.', icon: FolderTree, role: 'pageEditor' },
      { label: 'Photos', description: 'Manage gallery folders, events, and photos.', icon: Images, role: 'pageEditor' },
      { label: 'Documents', description: 'Manage document library folders and files.', icon: FileArchive, role: 'pageEditor' },
    ],
  },
  {
    label: 'User Management',
    description: 'Review requests, accounts, and permissions.',
    icon: ShieldCheck,
    role: 'admin',
    children: [
      { label: 'Access Requests', description: 'Review unmatched resident requests.', icon: ClipboardList, role: 'admin' },
      { label: 'Login Accounts', description: 'Manage login account status, sessions, and sign-in links.', icon: Users, role: 'admin' },
      { label: 'Permissions', description: 'Grant and revoke Admin, Page, and Directory permissions.', icon: ShieldCheck, role: 'admin' },
    ],
  },
  {
    label: 'Finance',
    description: 'Payment processor, dues & reports',
    icon: DollarSign,
    role: 'finance',
    children: [
      { label: 'Dues & Subscriptions', description: 'Review household dues/security status and record manual payments.', icon: DollarSign, role: 'finance' },
      { label: 'Reports', description: 'Browse and export finance reports.', icon: Receipt, role: 'finance' },
      { label: 'Transaction Report', description: 'Search and export payment transactions by date range and category.', icon: Receipt, role: 'finance', hidden: true },
      { label: 'Payment Processor', description: 'Configure payment processor settings.', icon: DollarSign, role: 'finance' },
    ],
  },
  {
    label: 'Log Viewer',
    description: 'Browse activity logs and archived households.',
    icon: ScrollText,
    role: 'any',
    children: [
      { label: 'Logs', description: 'Search and filter the activity log.', icon: ScrollText, role: 'any' },
      { label: 'Archives', description: 'Browse archived household records.', icon: Archive, role: 'any' },
      { label: 'Last Seen', description: 'Most recently active users.', icon: Clock, role: 'any' },
    ],
  },
  {    label: 'Settings',
    description: 'Configure site-wide settings.',
    icon: Settings,
    role: 'admin',
    feature: { label: 'Settings', description: 'Configure site-wide settings.', icon: Settings, role: 'admin' },
  },
];

const isAdmin = computed(() => permissions.value.isAdmin || permissions.value.isOwner);

function allows(role: Role) {
  if (role === 'admin') return isAdmin.value;
  if (role === 'pageEditor') return isAdmin.value || permissions.value.isPageEditor;
  if (role === 'directoryEditor') return isAdmin.value || permissions.value.isDirectoryEditor;
  if (role === 'finance') return isAdmin.value || permissions.value.isFinance;
  return true;
}

const menuSections = computed(() => adminMenuSections
  .map((section) => {
    if (section.children?.length) {
      return {
        ...section,
        children: section.children.filter((child) => allows(child.role)),
      };
    }

    return section;
  })
  .filter((section) => section.disabled || (section.children?.length ? section.children.length > 0 : allows(section.role))));

const features = computed(() => menuSections.value.flatMap((section) => {
  if (section.children?.length) return section.children;
  return section.feature && !section.disabled ? [section.feature] : [];
}));

const selectedSection = computed(() => menuSections.value.find((section) => {
  if (section.feature?.label === selectedFeature.value) return true;
  return section.children?.some((child) => child.label === selectedFeature.value) ?? false;
}));

const selectedChild = computed(() => selectedSection.value?.children?.find((child) => child.label === selectedFeature.value) ?? null);

const breadcrumbTrail = computed(() => {
  const trail = [{ title: 'Admin' }];
  if (selectedChild.value && selectedSection.value) trail.push({ title: selectedSection.value.label });
  return trail;
});

const fullWidthAdminFeature = computed(() => selectedFeature.value === 'Pages' || selectedFeature.value === 'Navigation' || selectedFeature.value === 'Photos' || selectedFeature.value === 'Documents' || selectedFeature.value === 'Permissions' || selectedFeature.value === 'Transaction Report');

onMounted(async () => {
  const savedExpandedSection = localStorage.getItem(ACCORDION_STORAGE_KEY);
  if (savedExpandedSection && adminMenuSections.some((section) => section.label === savedExpandedSection && section.children?.length)) {
    expandedSection.value = savedExpandedSection;
  }

  const response = await fetch('/api/auth/me');
  if (!response.ok) return;
  const data = await response.json() as { user?: Partial<typeof permissions.value> };
  permissions.value = {
    isOwner: Boolean(data.user?.isOwner),
    isAdmin: Boolean(data.user?.isAdmin),
    isPageEditor: Boolean(data.user?.isPageEditor),
    isDirectoryEditor: Boolean(data.user?.isDirectoryEditor),
    isFinance: Boolean(data.user?.isFinance),
  };
});

// Falls back to the first permitted tab so a revoked permission cannot leave a stale pane open.
watch(features, (list) => {
  if (!list.some((feature) => feature.label === selectedFeature.value)) {
    selectedFeature.value = list[0]?.label ?? 'Status';
  }
});

watch(menuSections, (sections) => {
  if (expandedSection.value && !sections.some((section) => section.label === expandedSection.value && section.children?.length)) {
    expandedSection.value = null;
    localStorage.removeItem(ACCORDION_STORAGE_KEY);
  }
});

function selectFeature(label: string) {
  if (!features.value.some((feature) => feature.label === label)) return;
  selectedFeature.value = label;
}

function saveExpandedSection(label: string | null) {
  expandedSection.value = label;
  if (label) localStorage.setItem(ACCORDION_STORAGE_KEY, label);
  else localStorage.removeItem(ACCORDION_STORAGE_KEY);
}

function toggleSection(section: AdminMenuSection) {
  if (section.disabled) return;
  if (section.children?.length) {
    saveExpandedSection(expandedSection.value === section.label ? null : section.label);
    return;
  }
  if (section.feature) selectFeature(section.feature.label);
}

function selectChild(section: AdminMenuSection, child: AdminFeature) {
  saveExpandedSection(section.label);
  selectFeature(child.label);
}

function isSectionActive(section: AdminMenuSection) {
  if (section.label === selectedFeature.value) return true;
  if (section.feature?.label === selectedFeature.value) return true;
  return section.children?.some((child) => child.label === selectedFeature.value) ?? false;
}

function handleCrumbClick(index: number) {
  if (index === 0) {
    selectedFeature.value = 'Status';
    return;
  }

  if (index === 1 && selectedSection.value?.children?.length) {
    saveExpandedSection(selectedSection.value.label);
    selectedFeature.value = selectedSection.value.label;
  }
}
</script>

<template>
  <section class="space-y-6">
    <BreadcrumbNav
      :trail="breadcrumbTrail"
      :current="selectedFeature"
      @crumb-click="handleCrumbClick"
    />

    <div>
      <h2 class="mt-1 text-2xl font-semibold tracking-tight">Administration</h2>
      </div>

    <div
      class="grid min-h-112 rounded-3xl border border-theme-border bg-surface shadow-sm"
      :class="fullWidthAdminFeature ? 'md:grid-cols-1' : 'overflow-hidden md:grid-cols-[17rem_minmax(0,1fr)]'"
    >
      <nav
        v-if="!fullWidthAdminFeature"
        class="border-b border-theme-border bg-app-bg p-3 md:border-b-0 md:border-r"
        aria-label="Admin features"
      >
        <div class="space-y-1">
          <div v-for="section in menuSections" :key="section.label">
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
              :class="[
                section.disabled
                  ? 'cursor-not-allowed text-content-muted/60'
                  : isSectionActive(section)
                    ? 'bg-surface text-accent shadow-sm'
                    : 'text-content-muted hover:bg-surface/70',
              ]"
              :aria-expanded="section.children?.length ? expandedSection === section.label : undefined"
              :aria-controls="section.children?.length ? `admin-section-${section.label.replaceAll(' ', '-')}` : undefined"
              :disabled="section.disabled"
              @click="toggleSection(section)"
            >
              <component :is="section.icon" class="mt-0.5 h-5 w-5 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ section.label }}</span>
                <span class="mt-0.5 block text-xs text-content-muted">{{ section.description }}</span>
                <span
                  v-if="section.badge"
                  class="mt-2 inline-flex rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-content-muted"
                >
                  {{ section.badge }}
                </span>
              </span>
              <ChevronDown
                v-if="section.children?.length"
                class="mt-1 h-4 w-4 shrink-0 transition-transform"
                :class="expandedSection === section.label ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>

            <div
              v-if="section.children?.length && expandedSection === section.label"
              :id="`admin-section-${section.label.replaceAll(' ', '-')}`"
              class="mt-1 space-y-1 pb-1 pl-8"
            >
              <button
                v-for="child in section.children.filter((c) => !c.hidden)"
                :key="child.label"
                type="button"
                class="block w-full truncate rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors"
                :class="selectedFeature === child.label ? 'bg-accent text-on-accent shadow-sm' : 'text-content-muted hover:bg-surface/70 hover:text-content'"
                @click="selectChild(section, child)"
              >
                {{ child.label }}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div v-if="selectedFeature === 'Pages'" class="min-w-0 p-6 sm:p-8">
        <AdminPagesView @exit="selectedFeature = 'Status'" />
      </div>
      <div v-else-if="selectedFeature === 'Navigation'" class="min-w-0 p-6 sm:p-8">
        <AdminMenusView @exit="selectedFeature = 'Status'" />
      </div>
      <div v-else-if="selectedFeature === 'Photos'" class="min-w-0 p-6 sm:p-8">
        <AdminPhotosView @exit="selectedFeature = 'Status'" />
      </div>
      <div v-else-if="selectedFeature === 'Documents'" class="min-w-0 p-6 sm:p-8">
        <AdminDocumentsView @exit="selectedFeature = 'Status'" />
      </div>
      <div v-else-if="selectedFeature === 'Access Requests'" class="min-w-0 p-6 sm:p-8">
        <AdminAccessRequestsView />
      </div>
      <div v-else-if="selectedFeature === 'Status'" class="min-w-0 p-6 sm:p-8">
        <AdminStatusView />
      </div>
      <div v-else-if="selectedFeature === 'Directory'" class="min-w-0 p-6 sm:p-8">
        <AdminDirectoryView />
        
        
      </div>
      <div v-else-if="selectedFeature === 'Login Accounts'" class="min-w-0 p-6 sm:p-8">
        <AdminLoginUsersView />
      </div>
      <div v-else-if="selectedFeature === 'Permissions'" class="min-w-0 p-6 sm:p-8">
        <AdminAccessControlView @exit="selectedFeature = 'Status'" />
      </div>      <div v-else-if="selectedFeature === 'Dues & Subscriptions'" class="min-w-0 p-6 sm:p-8">
        <AdminFinanceDuesView />
      </div>      <div v-else-if="selectedFeature === 'Reports'" class="min-w-0 p-6 sm:p-8">
        <AdminFinanceReportsView @select="selectedFeature = $event" />
      </div>      <div v-else-if="selectedFeature === 'Transaction Report'" class="min-w-0 p-6 sm:p-8">
        <AdminFinanceTransactionReportView @exit="selectedFeature = 'Reports'" />
      </div>      <div v-else-if="selectedFeature === 'Payment Processor'" class="min-w-0 p-6 sm:p-8">
        <AdminFinancePaymentProcessorView />
      </div>      <div v-else-if="selectedFeature === 'Logs'" class="min-w-0 p-6 sm:p-8">
        <AdminLogsView />
      </div>      <div v-else-if="selectedFeature === 'Archives'" class="min-w-0 p-6 sm:p-8">
        <AdminArchiveBrowserView />
      </div>      <div v-else-if="selectedFeature === 'Last Seen'" class="min-w-0 p-6 sm:p-8">
        <AdminLastSeenView />
      </div>      <div v-else-if="selectedFeature === 'Settings'" class="min-w-0 p-6 sm:p-8">
        <AdminSettingsView />
      </div>      <div v-else class="min-w-0 p-6 sm:p-8">
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
