<script setup lang="ts">
import { Clock } from 'lucide-vue-next';
</script>

<template>
  <section class="flex flex-col items-center justify-center gap-4 py-24 text-center">
    <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
      <Clock class="h-8 w-8" />
    </div>
    <h2 class="text-3xl font-semibold tracking-tight text-content">Coming Soon...</h2>
    <p class="max-w-md text-content-muted">This feature isn't available yet. Check back soon.</p>
  </section>
</template>
