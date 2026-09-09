<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { LogIn, LogOut, Plus, Save, Trash2, X } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';

interface AuthUser {
  displayName: string;
  matched?: boolean;
}

const user = ref<AuthUser | null>(null);
const route = useRoute();
const router = useRouter();
const isAccountMenuOpen = ref(false);
const isAccountPanelOpen = ref(false);
const loginEmails = ref<string[]>([]);
const isLoadingEmails = ref(false);
const isSavingEmails = ref(false);
const emailPanelError = ref('');
const emailPanelSaved = ref(false);

async function openAccountPanel() {
  isAccountMenuOpen.value = false;
  isAccountPanelOpen.value = true;
  isLoadingEmails.value = true;
  emailPanelError.value = '';
  emailPanelSaved.value = false;
  try {
    const response = await fetch('/api/account/login-emails');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to load Login Emails.');
    loginEmails.value = data.emails;
  } catch (error) {
    emailPanelError.value = error instanceof Error ? error.message : 'Unable to load Login Emails.';
  } finally {
    isLoadingEmails.value = false;
  }
}

function toggleAccountMenu() {
  isAccountMenuOpen.value = !isAccountMenuOpen.value;
}

function addLoginEmail() {
  loginEmails.value.push('');
}

async function saveLoginEmails() {
  isSavingEmails.value = true;
  emailPanelError.value = '';
  emailPanelSaved.value = false;
  try {
    const response = await fetch('/api/account/login-emails', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: loginEmails.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to save Login Emails.');
    loginEmails.value = data.emails;
    emailPanelSaved.value = true;
  } catch (error) {
    emailPanelError.value = error instanceof Error ? error.message : 'Unable to save Login Emails.';
  } finally {
    isSavingEmails.value = false;
  }
}

async function switchAccount() {
  isAccountMenuOpen.value = false;
  await fetch('/api/auth/logout', { method: 'POST' });
  user.value = null;
  await router.push({ path: '/login', query: { switch: '1' } });
}
async function loadAuthUser() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      user.value = null;
      return;
    }
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
        <div class="relative flex items-center gap-2">
          <template v-if="user">
            <button
              type="button"
              class="max-w-32 truncate text-xs font-medium text-[#444746] underline decoration-[#c4c7c5] underline-offset-4 hover:text-[#1a73e8] sm:max-w-none sm:text-sm"
              :aria-expanded="isAccountMenuOpen"
              aria-haspopup="menu"
              @click="toggleAccountMenu"
            >{{ user.displayName }}</button>
            <div
              v-if="isAccountMenuOpen"
              class="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-[#e1e3e1] bg-white p-1.5 shadow-lg"
              role="menu"
            >
              <button
                type="button"
                class="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f0f4f9]"
                role="menuitem"
                @click="openAccountPanel"
              >
                Edit Emails
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f0f4f9]"
                role="menuitem"
                @click="switchAccount"
              >
                <LogOut class="h-4 w-4" />
                Logout
              </button>
            </div>
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

    <div v-if="isAccountPanelOpen" class="fixed inset-0 z-40 bg-[#1f1f1f]/20" @click="isAccountPanelOpen = false">
      <section
        class="absolute right-4 top-16 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#e1e3e1] bg-white p-5 shadow-xl sm:right-8"
        aria-label="Account settings"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="font-semibold">Login Emails</h2>
            <p class="mt-1 text-xs text-[#444746]">Private addresses used only to sign in.</p>
          </div>
          <button type="button" class="rounded-full p-1 text-[#444746] hover:bg-[#f0f4f9]" aria-label="Close account settings" @click="isAccountPanelOpen = false"><X class="h-4 w-4" /></button>
        </div>
        <p v-if="isLoadingEmails" class="py-6 text-sm text-[#444746]">Loading...</p>
        <div v-else class="mt-4 space-y-2">
          <div v-for="(_, index) in loginEmails" :key="index" class="flex items-center gap-2">
            <input v-model="loginEmails[index]" type="email" placeholder="work@example.com" class="min-w-0 flex-1 rounded-xl border border-[#e1e3e1] px-3 py-2 text-sm focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30" />
            <button type="button" class="rounded-full p-2 text-[#b3261e] hover:bg-red-50" aria-label="Remove Login Email" @click="loginEmails.splice(index, 1)"><Trash2 class="h-4 w-4" /></button>
          </div>
          <button type="button" class="inline-flex items-center gap-1 text-sm font-medium text-[#1a73e8]" @click="addLoginEmail"><Plus class="h-4 w-4" /> Add email</button>
          <p v-if="emailPanelError" class="rounded-xl bg-red-50 p-2 text-xs text-red-700">{{ emailPanelError }}</p>
          <p v-if="emailPanelSaved" class="rounded-xl bg-[#e6f4ea] p-2 text-xs text-[#137333]">Login Emails saved.</p>
          <button type="button" :disabled="isSavingEmails" class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60" @click="saveLoginEmails"><Save class="h-4 w-4" /> {{ isSavingEmails ? 'Saving...' : 'Save Login Emails' }}</button>
        </div>
      </section>
    </div>

    <main class="max-w-5xl mx-auto px-4 py-6 sm:px-8">
      <router-view />
    </main>
  </div>
</template>
