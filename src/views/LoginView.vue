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
    <div class="rounded-3xl border border-[#e1e3e1] bg-white p-6 shadow-sm sm:p-8">
      <div class="mb-8">
        <div class="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1a73e8]/10 text-[#1a73e8]">
          <Mail class="h-5 w-5" />
        </div>
        <h2 class="text-2xl font-semibold tracking-tight">Sign in to Park Hill</h2>
        <p class="mt-2 text-[#444746]">Enter your email and we’ll send you a secure sign-in link.</p>
      </div>
      <form class="space-y-4" @submit.prevent="requestLink">
        <label class="block text-sm font-medium text-[#1f1f1f]">
          Email address
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-2 w-full rounded-xl border border-[#e1e3e1] px-4 py-3 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="submit"
          :disabled="isSending"
          class="w-full rounded-full bg-[#1a73e8] px-6 py-3 font-medium text-white transition-all hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {{ isSending ? 'Sending...' : 'Send sign-in link' }}
        </button>
      </form>
      <p v-if="message" class="mt-5 rounded-xl bg-[#e8f0fe] p-3 text-sm text-[#0b57d0]">{{ message }}</p>
      <p v-if="error" class="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    </div>
  </section>
</template>
