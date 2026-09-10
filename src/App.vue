<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Check, Clock, LogIn, LogOut, Palette, Plus, Save, Trash2, X } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from './composables/useTheme';
import modernLogo from '/modern-ph-logo.svg?raw';

interface AuthUser {
  displayName: string;
  lastActiveAt?: string | null;
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

const showLastActiveBanner = ref(false);
const lastActiveText = ref('');
let bannerTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

function dismissLastActiveBanner() {
  showLastActiveBanner.value = false;
  try {
    sessionStorage.setItem('last_active_banner_dismissed', 'true');
  } catch {
    // Ignore storage errors in restricted contexts
  }
  if (bannerTimeoutTimer) {
    clearTimeout(bannerTimeoutTimer);
    bannerTimeoutTimer = null;
  }
}

function formatLastActive(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeString = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `today at ${timeString}`;
  }
  if (isYesterday) {
    return `yesterday at ${timeString}`;
  }

  const dateFormatted = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${dateFormatted} at ${timeString}`;
}

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
  dismissLastActiveBanner();
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

    // Trigger last active banner if user was previously active, hasn't dismissed it in this session,
    // and the previous activity was at least 15 minutes ago.
    if (data.user?.lastActiveAt) {
      const alreadyDismissed = sessionStorage.getItem('last_active_banner_dismissed') === 'true';
      if (!alreadyDismissed && !showLastActiveBanner.value) {
        const lastActiveTime = new Date(data.user.lastActiveAt).getTime();
        const diffMs = Date.now() - lastActiveTime;
        if (diffMs > 15 * 60_000) {
          const formatted = formatLastActive(data.user.lastActiveAt);
          if (formatted) {
            lastActiveText.value = formatted;
            showLastActiveBanner.value = true;
            if (bannerTimeoutTimer) clearTimeout(bannerTimeoutTimer);
            bannerTimeoutTimer = setTimeout(() => {
              showLastActiveBanner.value = false;
              try {
                sessionStorage.setItem('last_active_banner_dismissed', 'true');
              } catch {}
            }, 20000); // Stay visible for 20 seconds for elderly users to comfortably read
          }
        }
      }
    }
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
                Edit Login Emails
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

    <Transition name="banner-fade">
      <div
        v-if="showLastActiveBanner && lastActiveText"
        class="border-b border-theme-border bg-surface-subtle px-4 py-3 text-sm text-content shadow-xs"
        role="status"
        aria-live="polite"
      >
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:px-4">
          <div class="flex items-center gap-2.5 min-w-0">
            <Clock class="h-4 w-4 shrink-0 text-accent" />
            <span class="truncate">
              Welcome back! You were last active <span class="font-semibold text-accent">{{ lastActiveText }}</span>.
            </span>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-full p-1 text-content-muted hover:bg-surface-hover hover:text-content"
            aria-label="Dismiss last active message"
            @click="dismissLastActiveBanner"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>
    </Transition>

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

.banner-fade-enter-active,
.banner-fade-leave-active {
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.banner-fade-enter-from,
.banner-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
