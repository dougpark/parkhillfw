<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const fullName = ref('');
const streetAddress = ref('');
const isSubmitting = ref(false);
const submitted = ref(false);
const error = ref('');

async function switchAccount() {
  await fetch('/api/auth/logout', { method: 'POST' });
  await router.push({ path: '/login', query: { switch: '1' } });
}

async function submitRequest() {
  isSubmitting.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/access-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: fullName.value, streetAddress: streetAddress.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to submit your request.');
    submitted.value = true;
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to submit your request.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-md py-10 sm:py-16">
    <div class="rounded-3xl border border-theme-border bg-surface p-6 shadow-sm sm:p-8">
      <template v-if="!submitted">
        <h2 class="text-2xl font-semibold tracking-tight">Connect your account</h2>
        <p class="mt-2 text-content-muted">We couldn’t match your email automatically. Share your name and street address so an administrator can verify your directory entry.</p>
        <form class="mt-8 space-y-4" @submit.prevent="submitRequest">
          <label class="block text-sm font-medium">
            Full name
            <input v-model="fullName" required class="mt-2 w-full rounded-xl border border-theme-border px-4 py-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" autocomplete="name" />
          </label>
          <label class="block text-sm font-medium">
            Street address
            <input v-model="streetAddress" required class="mt-2 w-full rounded-xl border border-theme-border px-4 py-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30" autocomplete="street-address" placeholder="1234 Example Terrace" />
          </label>
          <div class="flex flex-col gap-3 sm:flex-row-reverse">
            <button type="submit" :disabled="isSubmitting" class="flex-1 rounded-full bg-accent px-6 py-3 font-medium text-on-accent hover:opacity-90 disabled:opacity-60">
              {{ isSubmitting ? 'Submitting...' : 'Submit for review' }}
            </button>
            <button type="button" :disabled="isSubmitting" class="flex-1 rounded-full border border-accent px-6 py-3 font-medium text-accent hover:bg-accent/10 disabled:opacity-60" @click="switchAccount">
              Use a different email
            </button>
          </div>
        </form>
        <p v-if="error" class="mt-5 rounded-xl bg-danger-subtle p-3 text-sm text-danger">{{ error }}</p>
      </template>
      <template v-else>
        <h2 class="text-2xl font-semibold tracking-tight">Request submitted</h2>
        <p class="mt-3 text-content-muted">Your account is being reviewed. An administrator will review your name and address and connect your account to the directory if they can verify your household.</p>
        <button type="button" class="mt-6 rounded-full border border-accent px-6 py-3 font-medium text-accent hover:bg-accent/10" @click="switchAccount">Use a different email</button>
      </template>
    </div>
  </section>
</template>
