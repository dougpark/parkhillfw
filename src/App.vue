<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Check, LogIn, LogOut, Palette, Plus, Save, Trash2, X } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from './composables/useTheme';
import modernLogo from '/modern-ph-logo.svg?raw';

interface AuthUser {
  displayName: string;
  matched?: boolean;
}

const user = ref<AuthUser | null>(null);
const route = useRoute();
const router = useRouter();
const navbarLogo = modernLogo.replace('viewBox="0 0 512.000000 512.000000"', 'viewBox="145 45 220 300"');
const { theme, themeOptions, applyTheme } = useTheme();
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
  <div class="min-h-screen bg-app-bg text-content font-sans" @click="isAccountMenuOpen = false">
    <header class="sticky top-0 z-20 border-b border-theme-border bg-surface">
      <div class="max-w-5xl mx-auto flex items-center justify-between px-4 py-3 sm:px-8">
        <RouterLink
          to="/home"
          class="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-accent sm:text-xl"
          aria-label="Go to directory"
        >
          <span class="themed-logo h-10 w-10 shrink-0" aria-hidden="true" v-html="navbarLogo" />
          <span class="truncate">Park Hill Neighborhood</span>
        </RouterLink>
        <div class="relative flex items-center gap-2" @click.stop>
          <template v-if="user">
            <button
              type="button"
              class="max-w-32 truncate text-xs font-medium text-content-muted underline decoration-theme-border underline-offset-4 hover:text-accent sm:max-w-none sm:text-sm"
              :aria-expanded="isAccountMenuOpen"
              aria-haspopup="menu"
              @click="toggleAccountMenu"
            >{{ user.displayName }}</button>
            <div
              v-if="isAccountMenuOpen"
              class="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-theme-border bg-surface p-1.5 shadow-lg"
              role="menu"
            >
              <button
                type="button"
                class="block w-full rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitem"
                @click="openAccountPanel"
              >
                Edit Emails
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitem"
                @click="switchAccount"
              >
                <LogOut class="h-4 w-4" />
                Logout
              </button>
              <div class="my-1 border-t border-theme-border" />
              <div class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-content-muted">
                <Palette class="h-3.5 w-3.5" />
                Color theme
              </div>
              <button
                v-for="option in themeOptions"
                :key="option.name"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content hover:bg-surface-hover"
                role="menuitemradio"
                :aria-checked="theme === option.name"
                @click="applyTheme(option.name)"
              >
                <span class="flex shrink-0 overflow-hidden rounded-full border border-theme-border" aria-hidden="true">
                  <span v-for="color in option.colors" :key="color" class="h-3.5 w-2.5" :style="{ backgroundColor: color }" />
                </span>
                <span class="flex-1">{{ option.label }}</span>
                <Check v-if="theme === option.name" class="h-4 w-4 text-accent" />
              </button>
            </div>
          </template>
          <RouterLink
            v-else
            to="/login"
            class="rounded-full p-2 text-content-muted transition-colors hover:bg-surface-hover"
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
        class="absolute right-4 top-16 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-theme-border bg-surface p-5 shadow-xl sm:right-8"
        aria-label="Account settings"
        @click.stop
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="font-semibold">Login Emails</h2>
            <p class="mt-1 text-xs text-content-muted">Private addresses used only to sign in.</p>
          </div>
          <button type="button" class="rounded-full p-1 text-content-muted hover:bg-surface-hover" aria-label="Close account settings" @click="isAccountPanelOpen = false"><X class="h-4 w-4" /></button>
        </div>
        <p v-if="isLoadingEmails" class="py-6 text-sm text-content-muted">Loading...</p>
        <div v-else class="mt-4 space-y-2">
          <div v-for="(_, index) in loginEmails" :key="index" class="flex items-center gap-2">
            <input v-model="loginEmails[index]" type="email" placeholder="work@example.com" class="min-w-0 flex-1 rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <button type="button" class="rounded-full p-2 text-danger hover:bg-danger-subtle" aria-label="Remove Login Email" @click="loginEmails.splice(index, 1)"><Trash2 class="h-4 w-4" /></button>
          </div>
          <button type="button" class="inline-flex items-center gap-1 text-sm font-medium text-accent" @click="addLoginEmail"><Plus class="h-4 w-4" /> Add email</button>
          <p v-if="emailPanelError" class="rounded-xl bg-danger-subtle p-2 text-xs text-danger">{{ emailPanelError }}</p>
          <p v-if="emailPanelSaved" class="rounded-xl bg-success-subtle p-2 text-xs text-success">Login Emails saved.</p>
          <button type="button" :disabled="isSavingEmails" class="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60" @click="saveLoginEmails"><Save class="h-4 w-4" /> {{ isSavingEmails ? 'Saving...' : 'Save Login Emails' }}</button>
        </div>
      </section>
    </div>

    <main class="max-w-5xl mx-auto px-4 py-6 sm:px-8">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.themed-logo :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
