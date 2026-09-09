<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, Save, Trash2 } from 'lucide-vue-next';

interface AdminUser {
  id: number;
  email: string;
  alternateEmails: string[];
  isOwner: boolean | null;
  isAdmin: boolean | null;
  isPageEditor: boolean | null;
  isDirectoryEditor: boolean | null;
}

const users = ref<AdminUser[]>([]);
const error = ref('');
const savedUserId = ref<number | null>(null);
const inputClass = 'w-full rounded-xl border border-theme-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

async function loadUsers() {
  const response = await fetch('/api/admin/users');
  if (!response.ok) throw new Error('Unable to load users.');
  users.value = await response.json();
}

async function saveEmails(user: AdminUser) {
  error.value = '';
  savedUserId.value = null;
  const response = await fetch(`/api/admin/users/${user.id}/login-emails`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alternateEmails: user.alternateEmails }),
  });
  const data = await response.json();
  if (!response.ok) {
    error.value = data.error ?? 'Unable to save login emails.';
    return;
  }
  user.alternateEmails = data.alternateEmails;
  savedUserId.value = user.id;
}

function addEmail(user: AdminUser) {
  user.alternateEmails.push('');
}

onMounted(() => loadUsers().catch((loadError) => { error.value = loadError instanceof Error ? loadError.message : 'Unable to load users.'; }));
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Users</h2>
      <p class="mt-2 text-content-muted">Manage account access and private Login Emails. Alternate Login Emails are used for sign-in only and never appear in the directory.</p>
    </div>
    <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    <p v-if="!users.length && !error" class="rounded-3xl border border-theme-border bg-surface p-6 text-content-muted">No users found.</p>
    <div v-for="user in users" :key="user.id" class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 class="font-semibold text-content">{{ user.email }}</h3>
          <p class="mt-1 text-xs text-content-muted">{{ [user.isOwner && 'Owner', user.isAdmin && 'Admin', user.isPageEditor && 'Page editor', user.isDirectoryEditor && 'Directory editor'].filter(Boolean).join(' · ') || 'Standard user' }}</p>
        </div>
        <button type="button" class="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90" @click="saveEmails(user)">
          <Save class="h-4 w-4" /> Save
        </button>
      </div>
      <div class="mt-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h4 class="text-sm font-medium">Alternate Login Emails</h4>
            <p class="mt-1 text-xs text-content-muted">Private sign-in addresses such as a work email.</p>
          </div>
          <button type="button" class="inline-flex items-center gap-1 rounded-full border border-accent px-3 py-1.5 text-sm font-medium text-accent" @click="addEmail(user)">
            <Plus class="h-4 w-4" /> Add
          </button>
        </div>
        <div v-if="user.alternateEmails.length" class="mt-3 space-y-2">
          <div v-for="(_, index) in user.alternateEmails" :key="`${user.id}-${index}`" class="flex items-center gap-2">
            <input v-model="user.alternateEmails[index]" type="email" placeholder="work@example.com" :class="inputClass" />
            <button type="button" class="rounded-full p-2 text-danger hover:bg-danger-subtle" aria-label="Remove login email" title="Remove login email" @click="user.alternateEmails.splice(index, 1)">
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
        <p v-else class="mt-3 text-sm text-content-muted">No alternate Login Emails.</p>
        <p v-if="savedUserId === user.id" class="mt-3 text-sm text-success">Login Emails saved.</p>
      </div>
    </div>
  </section>
</template>
