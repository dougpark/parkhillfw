<script setup lang="ts">
import { ChevronRight, Home } from 'lucide-vue-next';

// A crumb without `to` is handled in the parent via the crumbClick event, for
// views whose levels are internal state rather than routes.
defineProps<{
  trail?: Array<{ to?: string; title: string }>;
  current: string;
}>();

defineEmits<{ crumbClick: [index: number] }>();
</script>

<template>
  <nav class="flex flex-wrap items-center gap-1 text-sm text-content-muted" aria-label="Breadcrumb">
    <RouterLink to="/home" class="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-app-bg">
      <Home class="h-4 w-4" />
      Home
    </RouterLink>
    <template v-for="(crumb, index) in trail ?? []" :key="crumb.title">
      <ChevronRight class="h-4 w-4" aria-hidden="true" />
      <RouterLink v-if="crumb.to" :to="crumb.to" class="rounded-full px-2 py-1 hover:bg-app-bg">{{ crumb.title }}</RouterLink>
      <button v-else type="button" class="rounded-full px-2 py-1 hover:bg-app-bg" @click="$emit('crumbClick', index)">{{ crumb.title }}</button>
    </template>
    <ChevronRight class="h-4 w-4" aria-hidden="true" />
    <span class="px-2 py-1 font-medium text-content">{{ current }}</span>
  </nav>
</template>
