<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const status = ref('Verifying your sign-in link...');
const error = ref('');

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  if (!token) {
    error.value = 'This sign-in link is missing its token.';
    return;
  }

  try {
    const response = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'This sign-in link is invalid or expired.');
    await router.replace(data.matched ? '/directory' : '/access-request');
  } catch (verificationError) {
    error.value = verificationError instanceof Error ? verificationError.message : 'Unable to verify sign-in link.';
  }
});
</script>

<template>
  <section class="mx-auto max-w-md py-16 text-center">
    <div class="rounded-3xl border border-[#e1e3e1] bg-white p-8 shadow-sm">
      <p v-if="!error" class="text-[#444746]">{{ status }}</p>
      <div v-else>
        <h2 class="text-xl font-semibold">Sign-in link unavailable</h2>
        <p class="mt-2 text-[#444746]">{{ error }}</p>
        <RouterLink to="/login" class="mt-6 inline-flex rounded-full bg-[#1a73e8] px-6 py-3 font-medium text-white">Request a new link</RouterLink>
      </div>
    </div>
  </section>
</template>
