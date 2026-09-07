<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Home, LogIn, LogOut } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';

interface AuthUser {
  displayName: string;
  matched?: boolean;
}

const user = ref<AuthUser | null>(null);
const route = useRoute();
const router = useRouter();

async function switchAccount() {
  await fetch('/api/auth/logout', { method: 'POST' });
  user.value = null;
  await router.push({ path: '/login', query: { switch: '1' } });
}
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
        <RouterLink
          to="/home"
          class="text-lg sm:text-xl font-semibold tracking-tight text-[#1a73e8]"
          aria-label="Go to directory"
        >
          Park Hill Neighborhood
        </RouterLink>
        <div class="flex items-center gap-2">
          <template v-if="user">
            <span class="max-w-32 truncate text-xs font-medium text-[#444746] sm:max-w-none sm:text-sm">{{ user.displayName }}</span>
            <button
              type="button"
              class="rounded-full p-2 text-[#444746] transition-colors hover:bg-[#f0f4f9]"
              aria-label="Switch account"
              title="Switch account"
              @click="switchAccount"
            >
              <LogOut class="h-4 w-4" />
            </button>
            <RouterLink
              v-if="user.matched"
              to="/home"
              class="inline-flex items-center gap-1.5 rounded-full border border-[#1a73e8] px-3 py-1.5 text-sm font-medium text-[#1a73e8] transition-colors hover:bg-[#e8f0fe]"
              aria-label="Home"
              title="Home"
            >
              <Home class="h-4 w-4" />
              <span>Home</span>
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
