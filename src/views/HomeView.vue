<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { BookOpen, DollarSign, Pencil, ShieldCheck } from 'lucide-vue-next';
import NavCardGrid from '../components/menus/NavCardGrid.vue';
import type { NavNode } from '../components/menus/menuTree';

interface AuthUser {
  isOwner?: boolean;
  isAdmin?: boolean;
  isPageEditor?: boolean;
  isDirectoryEditor?: boolean;
}

const user = ref<AuthUser | null>(null);
const pendingRequests = ref(0);
// Fetched at runtime instead of a static `?raw` import — that pattern is unreliable
// for public/ assets when this view is loaded via the router's lazy import().
const heroLogo = ref('');
const navItems = ref<NavNode[]>([]);

const baseCards = [
  {
    title: 'Directory',
    description: 'Search the neighborhood directory',
    to: '/directory',
    icon: BookOpen,
    color: 'bg-accent/10 text-accent',
  },
  {
    title: 'Edit My Household',
    description: 'Edit my household information',
    to: '/directory/edit',
    icon: Pencil,
    color: 'bg-success-subtle text-success',
  },
  {
    title: 'Pay Dues',
    description: 'Secure online payments for membership & security',
    to: '/dues/pay',
    icon: DollarSign,
    color: 'bg-success-subtle text-success',
  },
];

const canAdmin = (authUser: AuthUser) => Boolean(
  authUser.isOwner || authUser.isAdmin || authUser.isPageEditor || authUser.isDirectoryEditor
);

onMounted(async () => {
  try {
    const logoResponse = await fetch('/modern-ph-logo-clear.svg');
    if (logoResponse.ok) heroLogo.value = await logoResponse.text();
  } catch {
    heroLogo.value = '';
  }

  try {
    const navResponse = await fetch('/api/nav');
    if (navResponse.ok) navItems.value = ((await navResponse.json()) as { items: NavNode[] }).items;
  } catch {
    navItems.value = [];
  }

  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json() as { user: AuthUser };
      user.value = data.user;
      if (canAdmin(data.user)) {
        const countResponse = await fetch('/api/admin/access-requests/count');
        if (countResponse.ok) {
          const countData = await countResponse.json() as { count: number };
          pendingRequests.value = countData.count;
        }
      }
    }
  } catch {
    user.value = null;
  }
});
</script>

<template>
  <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden opacity-5"
  >
    <div class="hero-watermark w-[600px] max-w-none select-none md:w-[800px] lg:w-[1000px]" v-html="heroLogo" />
  </div>

  <section class="relative z-10 space-y-8 py-4 sm:py-8">
    <div>
      <h2 class="mt-2 text-3xl font-semibold tracking-tight text-content">Welcome home</h2>
      <p class="mt-2 max-w-xl text-content-muted">Find neighborhood information and keep your household details current.</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="card in baseCards"
        :key="card.title"
        :to="card.to"
        class="group rounded-3xl border border-theme-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <div class="flex items-center gap-4">
          <div :class="['flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', card.color]">
            <component :is="card.icon" class="h-6 w-6" />
          </div>
          <div>
            <h3 class="text-xl font-semibold text-content transition-colors group-hover:text-accent">{{ card.title }}</h3>
            <p class="mt-1 text-content-muted">{{ card.description }}</p>
          </div>
        </div>
      </RouterLink>
      <RouterLink
        v-if="user && canAdmin(user)"
        to="/admin"
        class="group rounded-3xl border border-theme-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-secondary/10 text-accent-secondary">
            <ShieldCheck class="h-6 w-6" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-xl font-semibold text-content transition-colors group-hover:text-accent">Admin</h3>
              <span v-if="pendingRequests" class="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-semibold text-warning">{{ pendingRequests }} review{{ pendingRequests === 1 ? '' : 's' }}</span>
            </div>
            <p class="mt-1 text-content-muted">Manage neighborhood content</p>
          </div>
        </div>
      </RouterLink>
    </div>

    <NavCardGrid v-if="navItems.length" :items="navItems" />
  </section>
</template>

<style scoped>
.hero-watermark :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
.hero-watermark :deep(g) {
  fill: #14532d;
}
</style>
