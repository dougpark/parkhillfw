<script setup lang="ts">
import { Clock } from 'lucide-vue-next';
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Payment Processor</h2>
      <p class="mt-2 text-content-muted">Manage payment processors, dues pricing &amp; reports</p>
    </div>

    <div class="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-theme-border bg-surface-subtle py-16 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Clock class="h-7 w-7" />
      </div>
      <h3 class="text-xl font-semibold text-content">Coming Soon</h3>
      <p class="max-w-md text-content-muted">Payment processor configuration isn't available yet. Check back soon.</p>
    </div>
  </section>
</template>
