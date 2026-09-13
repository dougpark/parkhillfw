<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Save } from 'lucide-vue-next';
import BaseInput from '../components/ui/BaseInput.vue';

const adminEmail = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const saved = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/admin/settings');
    if (!response.ok) throw new Error('Unable to load settings.');
    const data = await response.json() as { adminEmail: string };
    adminEmail.value = data.adminEmail;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load settings.';
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail: adminEmail.value }),
    });
    const data = await response.json() as { error?: string; adminEmail: string };
    if (!response.ok) throw new Error(data.error ?? 'Unable to save settings.');
    adminEmail.value = data.adminEmail;
    saved.value = true;
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : 'Unable to save settings.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h3 class="text-xl font-semibold">Settings</h3>
    <p class="mt-1 text-sm text-content-muted">Site-wide configuration used across the app.</p>

    <p v-if="loading" class="mt-6 text-sm text-content-muted">Loading settings…</p>

    <div v-else class="mt-6 max-w-md space-y-4 rounded-2xl border border-theme-border bg-surface p-5">
      <div>
        <label class="mb-1 block text-sm font-medium text-content" for="admin-email">Admin Email</label>
        <BaseInput id="admin-email" v-model="adminEmail" type="email" placeholder="admin@example.com" />
        <p class="mt-1 text-xs text-content-muted">Used as the reply-to contact address on sign-in and access request emails.</p>
      </div>

      <p v-if="error" class="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
      <p v-if="saved" class="rounded-xl bg-success-subtle p-3 text-sm text-success">Settings saved.</p>

      <button
        type="button"
        class="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
        :disabled="saving"
        @click="save"
      >
        <Save class="h-4 w-4" />
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </div>
  </div>
</template>
