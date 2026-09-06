<script setup lang="ts">
import { ref, onMounted } from 'vue';

const status = ref('Connecting...');

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    status.value = data.status === 'ok' ? 'Connected to Cloudflare Worker' : 'Error';
  } catch {
    status.value = 'Failed to connect to backend';
  }
});
</script>

<template>
  <div class="min-h-screen bg-[#f0f4f9] text-[#1f1f1f] p-8 font-sans">
    <div class="max-w-3xl mx-auto bg-white border border-[#e1e3e1] rounded-3xl p-6 shadow-sm">
      <h1 class="text-2xl font-semibold tracking-tight text-[#1a73e8]">Park Hill Neighborhood Directory</h1>
      <p class="mt-2 text-[#444746]">Backend Status: <span class="font-mono font-medium">{{ status }}</span></p>
    </div>
  </div>
</template>