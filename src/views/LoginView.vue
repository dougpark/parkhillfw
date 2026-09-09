<script setup lang="ts">
import { ref } from 'vue';
import { Mail } from 'lucide-vue-next';

const email = ref('');
const isSending = ref(false);
const message = ref('');
const error = ref('');

async function requestLink() {
  isSending.value = true;
  message.value = '';
  error.value = '';
  try {
    const response = await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to send sign-in link.');
    message.value = data.message;
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to send sign-in link.';
  } finally {
    isSending.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-md py-10 sm:py-16">
    <div class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm sm:p-8">
      <div class="mb-8">
        <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Mail class="h-5 w-5" />
        </div>
        <h2 class="text-2xl font-semibold tracking-tight">Sign in to Park Hill</h2>
        <p class="mt-2 text-content-muted">Enter your email and we’ll send you a secure sign-in link.</p>
      </div>
      <form class="space-y-4" @submit.prevent="requestLink">
        <label class="block text-sm font-medium text-content">
          Email address
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-2 w-full rounded-xl border border-theme-border px-4 py-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="submit"
          :disabled="isSending"
          class="w-full rounded-full bg-accent px-6 py-3 font-medium text-on-accent transition-all hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {{ isSending ? 'Sending...' : 'Send sign-in link' }}
        </button>
      </form>
      <p v-if="message" class="mt-5 rounded-xl bg-accent/10 p-3 text-sm text-accent">{{ message }}</p>
      <p v-if="error" class="mt-5 rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
    </div>
  </section>
</template>
