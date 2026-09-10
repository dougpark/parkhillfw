<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-vue-next';
import BaseInput from '../components/ui/BaseInput.vue';
import FilterChip from '../components/ui/FilterChip.vue';

interface LoginUser {
  id: number;
  email: string;
  displayName: string;
  isSuspended: boolean;
  lastLoginAt: string | null;
  sessionCount: number;
  lastSeenAt: string | null;
}

interface SessionDetail {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  expiresAt: string;
}

interface LogEntry {
  id: number;
  category: string;
  action: string;
  details: string | null;
  createdAt: string;
  actorEmail: string | null;
  targetEmail: string | null;
}

const searchQuery = ref('');
const suspendedOnly = ref(false);
const sortBy = ref<'lastLogin' | 'sessions'>('lastLogin');
const loginUsers = ref<LoginUser[]>([]);
const expandedUserId = ref<number | null>(null);
const sessionsByUser = ref<Record<number, SessionDetail[]>>({});
const logQuery = ref('');
const logs = ref<LogEntry[]>([]);
const error = ref('');
const message = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadLoginUsers() {
  const params = new URLSearchParams();
  if (searchQuery.value.trim()) params.set('q', searchQuery.value.trim());
  const response = await fetch(`/api/admin/login-users?${params.toString()}`);
  if (!response.ok) throw new Error('Unable to load users.');
  loginUsers.value = await response.json() as LoginUser[];
}

async function loadLogs() {
  const params = new URLSearchParams({ category: 'user_management' });
  if (logQuery.value.trim()) params.set('q', logQuery.value.trim());
  const response = await fetch(`/api/admin/activity-logs?${params.toString()}`);
  if (!response.ok) return;
  logs.value = await response.json() as LogEntry[];
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadLoginUsers().catch((loadError) => { error.value = loadError instanceof Error ? loadError.message : 'Unable to load users.'; });
  }, 250);
}

async function toggleSessions(user: LoginUser) {
  if (expandedUserId.value === user.id) {
    expandedUserId.value = null;
    return;
  }
  expandedUserId.value = user.id;
  if (!sessionsByUser.value[user.id]) {
    const response = await fetch(`/api/admin/users/${user.id}/sessions`);
    if (response.ok) sessionsByUser.value[user.id] = await response.json() as SessionDetail[];
  }
}

async function revokeSession(user: LoginUser, session: SessionDetail) {
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/sessions/${session.id}`, { method: 'DELETE' });
  const data = await response.json() as { error?: string };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to revoke session.';
    return;
  }
  sessionsByUser.value[user.id] = (sessionsByUser.value[user.id] ?? []).filter((item) => item.id !== session.id);
  user.sessionCount = Math.max(0, user.sessionCount - 1);
  message.value = 'Session revoked.';
  loadLogs();
}

async function forceLogout(user: LoginUser) {
  if (!confirm(`Force logout ${user.displayName}? This immediately revokes all of their active sessions.`)) return;
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/force-logout`, { method: 'POST' });
  const data = await response.json() as { error?: string; sessionsRemoved?: number };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to force logout.';
    return;
  }
  user.sessionCount = 0;
  delete sessionsByUser.value[user.id];
  message.value = `Signed out of ${data.sessionsRemoved ?? 0} session(s).`;
  loadLogs();
}

async function toggleSuspend(user: LoginUser) {
  const nextValue = !user.isSuspended;
  if (nextValue && !confirm(`Suspend ${user.displayName}? They will be immediately signed out and unable to sign in.`)) return;
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/suspend`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suspended: nextValue }),
  });
  const data = await response.json() as { error?: string; isSuspended?: boolean };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to update suspension status.';
    return;
  }
  user.isSuspended = Boolean(data.isSuspended);
  if (user.isSuspended) {
    user.sessionCount = 0;
    delete sessionsByUser.value[user.id];
  }
  message.value = user.isSuspended ? 'Account suspended.' : 'Account reinstated.';
  loadLogs();
}

async function sendMagicLink(user: LoginUser) {
  error.value = '';
  message.value = '';
  const response = await fetch(`/api/admin/users/${user.id}/send-magic-link`, { method: 'POST' });
  const data = await response.json() as { error?: string };
  if (!response.ok) {
    error.value = data.error ?? 'Unable to send sign-in link.';
    return;
  }
  message.value = `Sign-in link sent to ${user.email}.`;
  loadLogs();
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function formatDetails(entry: LogEntry): string {
  switch (entry.action) {
    case 'suspend': return 'suspended the account';
    case 'unsuspend': return 'reinstated the account';
    case 'force_logout': return 'forced logout';
    case 'revoke_session': return 'revoked a session';
    case 'magic_link_dispatch': return 'sent a sign-in link';
    default: return entry.action;
  }
}

const visibleUsers = computed(() => {
  let rows = suspendedOnly.value ? loginUsers.value.filter((user) => user.isSuspended) : loginUsers.value;
  rows = [...rows].sort((left, right) => sortBy.value === 'sessions'
    ? right.sessionCount - left.sessionCount
    : (right.lastLoginAt ? new Date(right.lastLoginAt).getTime() : 0) - (left.lastLoginAt ? new Date(left.lastLoginAt).getTime() : 0));
  return rows;
});

onMounted(() => {
  loadLoginUsers().catch((loadError) => { error.value = loadError instanceof Error ? loadError.message : 'Unable to load users.'; });
  loadLogs();
});
</script>

<template>
  <section class="space-y-8">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Login Users</h2>
      <p class="mt-2 text-content-muted">Manage login account status, sessions, and sign-in links.</p>
    </div>

    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="message" class="rounded-xl bg-success-subtle p-3 text-sm text-success">{{ message }}</p>

    <div class="flex flex-wrap items-center gap-3">
      <BaseInput v-model="searchQuery" placeholder="Search users by name or email..." class="max-w-sm" @update:model-value="scheduleSearch" />
      <FilterChip v-model="suspendedOnly">Suspended only</FilterChip>
      <select v-model="sortBy" class="rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm">
        <option value="lastLogin">Sort: Last login</option>
        <option value="sessions">Sort: Active sessions</option>
      </select>
    </div>

    <div class="space-y-3">
      <p v-if="!visibleUsers.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No matching users.</p>
      <div v-for="user in visibleUsers" :key="user.id" class="rounded-3xl border border-theme-border bg-surface p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="font-medium text-content">{{ user.displayName }}</p>
            <p class="text-xs text-content-muted">{{ user.email }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-4 text-xs text-content-muted">
            <span :class="user.isSuspended ? 'rounded-full bg-danger-subtle px-2 py-0.5 text-danger' : 'rounded-full bg-success-subtle px-2 py-0.5 text-success'">
              {{ user.isSuspended ? 'Suspended' : 'Active' }}
            </span>
            <span>Last login: {{ formatDate(user.lastLoginAt) }}</span>
            <button type="button" class="inline-flex items-center gap-1 hover:text-accent" @click="toggleSessions(user)">
              <component :is="expandedUserId === user.id ? ChevronDown : ChevronRight" class="h-3.5 w-3.5" />
              {{ user.sessionCount }} active session{{ user.sessionCount === 1 ? '' : 's' }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium hover:bg-app-bg" @click="sendMagicLink(user)">
              Send Magic Link
            </button>
            <button type="button" class="rounded-full border border-theme-border px-3 py-1.5 text-sm font-medium hover:bg-app-bg" @click="forceLogout(user)">
              Force Logout
            </button>
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-sm font-medium"
              :class="user.isSuspended ? 'border border-accent text-accent hover:bg-accent/10' : 'border border-danger text-danger hover:bg-danger-subtle'"
              @click="toggleSuspend(user)"
            >
              {{ user.isSuspended ? 'Unsuspend' : 'Suspend' }}
            </button>
          </div>
        </div>

        <div v-if="expandedUserId === user.id" class="mt-4 space-y-2 border-t border-theme-border pt-4">
          <p v-if="!sessionsByUser[user.id]?.length" class="text-sm text-content-muted">No active sessions.</p>
          <div v-for="session in sessionsByUser[user.id]" :key="session.id" class="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-app-bg px-4 py-2 text-sm">
            <span class="text-content-muted">
              {{ session.userAgent ?? 'Unknown device' }}
              <span v-if="session.ipAddress"> · {{ session.ipAddress }}</span>
              <span> · Last seen {{ formatDate(session.lastSeenAt) }}</span>
            </span>
            <button type="button" class="rounded-full p-1.5 text-danger hover:bg-danger-subtle" aria-label="Revoke this session" title="Revoke this session" @click="revokeSession(user, session)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <h3 class="text-lg font-semibold">Activity Log</h3>
      <BaseInput v-model="logQuery" placeholder="Search activity log..." @update:model-value="loadLogs" />
      <p v-if="!logs.length" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No login user activity yet.</p>
      <ul v-else class="divide-y divide-theme-border rounded-3xl border border-theme-border bg-surface">
        <li v-for="entry in logs" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
          <span>
            <span class="font-medium text-content">{{ entry.actorEmail ?? 'Unknown' }}</span>
            <span class="text-content-muted"> {{ formatDetails(entry) }} for </span>
            <span class="font-medium text-content">{{ entry.targetEmail ?? 'Unknown' }}</span>
          </span>
          <span class="text-xs text-content-muted">{{ new Date(entry.createdAt).toLocaleString() }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
