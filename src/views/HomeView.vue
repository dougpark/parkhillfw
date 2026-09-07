<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { BookOpen, Pencil, ShieldCheck } from 'lucide-vue-next';

interface AuthUser {
  isOwner?: boolean;
  isAdmin?: boolean;
  isPageEditor?: boolean;
  isDirectoryEditor?: boolean;
}

const user = ref<AuthUser | null>(null);

const baseCards = [
  {
    title: 'Directory',
    description: 'Search the neighborhood directory',
    to: '/directory',
    icon: BookOpen,
    color: 'bg-[#e8f0fe] text-[#1a73e8]',
  },
  {
    title: 'Edit My Household',
    description: 'Edit my household information',
    to: '/directory/edit',
    icon: Pencil,
    color: 'bg-[#e6f4ea] text-[#137333]',
  },
];

const canAdmin = (authUser: AuthUser) => Boolean(
  authUser.isOwner || authUser.isAdmin || authUser.isPageEditor || authUser.isDirectoryEditor
);

onMounted(async () => {
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json() as { user: AuthUser };
      user.value = data.user;
    }
  } catch {
    user.value = null;
  }
});
</script>

<template>
  <section class="space-y-8 py-4 sm:py-8">
    <div>
      <p class="text-sm font-medium uppercase tracking-wide text-[#1a73e8]">Park Hill Neighborhood</p>
      <h2 class="mt-2 text-3xl font-semibold tracking-tight text-[#1f1f1f]">Welcome home</h2>
      <p class="mt-2 max-w-xl text-[#444746]">Find neighborhood information and keep your household details current.</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-if="user && canAdmin(user)"
        to="/admin"
        class="group rounded-3xl border border-[#e1e3e1] bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40"
      >
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3e8fd] text-[#7c4dff]">
          <ShieldCheck class="h-6 w-6" />
        </div>
        <h3 class="mt-6 text-xl font-semibold text-[#1f1f1f]">Admin</h3>
        <p class="mt-2 text-[#444746]">Manage neighborhood content and access</p>
        <span class="mt-6 inline-block text-sm font-medium text-[#1a73e8] transition-transform group-hover:translate-x-1">Open <span aria-hidden="true">-&gt;</span></span>
      </RouterLink>
      <RouterLink
        v-for="card in baseCards"
        :key="card.title"
        :to="card.to"
        class="group rounded-3xl border border-[#e1e3e1] bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40"
      >
        <div :class="['flex h-12 w-12 items-center justify-center rounded-2xl', card.color]">
          <component :is="card.icon" class="h-6 w-6" />
        </div>
        <h3 class="mt-6 text-xl font-semibold text-[#1f1f1f]">{{ card.title }}</h3>
        <p class="mt-2 text-[#444746]">{{ card.description }}</p>
        <span class="mt-6 inline-block text-sm font-medium text-[#1a73e8] transition-transform group-hover:translate-x-1">Open <span aria-hidden="true">-&gt;</span></span>
      </RouterLink>
    </div>
  </section>
</template>
