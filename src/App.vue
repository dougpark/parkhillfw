<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { LogIn, Pencil, ShieldCheck } from 'lucide-vue-next';
import { useRoute } from 'vue-router';

interface AuthUser {
  displayName: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isPageEditor?: boolean;
  isDirectoryEditor?: boolean;
  matched?: boolean;
}

const user = ref<AuthUser | null>(null);
const route = useRoute();

const canAdmin = (authUser: AuthUser) => Boolean(
  authUser.isOwner || authUser.isAdmin || authUser.isPageEditor || authUser.isDirectoryEditor
);

async function loadAuthUser() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) return;
    const data = await response.json() as { user: AuthUser; matched: boolean };
    user.value = { ...data.user, matched: data.matched };
  } catch {
    user.value = null;
  }
}

onMounted(loadAuthUser);
watch(() => route.fullPath, loadAuthUser);
</script>

<template>
  <div class="min-h-screen bg-[#f0f4f9] text-[#1f1f1f] font-sans">
    <header class="sticky top-0 z-20 bg-white border-b border-[#e1e3e1]">
      <div class="max-w-5xl mx-auto flex items-center justify-between px-4 py-3 sm:px-8">
        <h1 class="text-lg sm:text-xl font-semibold tracking-tight text-[#1a73e8]">
          Park Hill Neighborhood
        </h1>
        <div class="flex items-center gap-2">
          <template v-if="user">
            <span class="max-w-32 truncate text-xs font-medium text-[#444746] sm:max-w-none sm:text-sm">{{ user.displayName }}</span>
            <RouterLink
              v-if="user.matched"
              to="/directory/edit"
              class="rounded-full p-2 text-[#444746] transition-colors hover:bg-[#f0f4f9]"
              aria-label="Edit directory"
              title="Edit directory"
            >
              <Pencil class="h-4 w-4" />
            </RouterLink>
            <RouterLink
              v-if="canAdmin(user)"
              to="/admin"
              class="inline-flex items-center gap-1.5 rounded-full bg-[#1a73e8] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <ShieldCheck class="h-4 w-4" />
              <span>Admin</span>
            </RouterLink>
          </template>
          <RouterLink
            v-else
            to="/login"
            class="rounded-full p-2 text-[#444746] transition-colors hover:bg-[#f0f4f9]"
            aria-label="Sign in"
            title="Sign in"
          >
            <LogIn class="h-5 w-5" />
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6 sm:px-8">
      <router-view />
    </main>
  </div>
</template>
