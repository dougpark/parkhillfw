<script setup lang="ts">
import { ref } from 'vue';
const fullName = ref('');
const streetAddress = ref('');
const isSubmitting = ref(false);
const submitted = ref(false);
const error = ref('');

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
    <div class="rounded-3xl border border-[#e1e3e1] bg-white p-6 shadow-sm sm:p-8">
      <template v-if="!submitted">
        <h2 class="text-2xl font-semibold tracking-tight">Connect your account</h2>
        <p class="mt-2 text-[#444746]">We couldn’t match your email automatically. Share your name and street address so an administrator can verify your directory entry.</p>
        <form class="mt-8 space-y-4" @submit.prevent="submitRequest">
          <label class="block text-sm font-medium">
            Full name
            <input v-model="fullName" required class="mt-2 w-full rounded-xl border border-[#e1e3e1] px-4 py-3 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30" autocomplete="name" />
          </label>
          <label class="block text-sm font-medium">
            Street address
            <input v-model="streetAddress" required class="mt-2 w-full rounded-xl border border-[#e1e3e1] px-4 py-3 focus:border-[#1a73e8] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/30" autocomplete="street-address" placeholder="1234 Example Terrace" />
          </label>
          <button type="submit" :disabled="isSubmitting" class="w-full rounded-full bg-[#1a73e8] px-6 py-3 font-medium text-white hover:opacity-90 disabled:opacity-60">
            {{ isSubmitting ? 'Submitting...' : 'Submit for review' }}
          </button>
        </form>
        <p v-if="error" class="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
      </template>
      <template v-else>
        <h2 class="text-2xl font-semibold tracking-tight">Request submitted</h2>
        <p class="mt-3 text-[#444746]">Your account is being reviewed. An administrator will review your name and address and connect your account to the directory if they can verify your household.</p>
      </template>
    </div>
  </section>
</template>
