<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <div class="relative">
    <Search class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444746]" />
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      type="text"
      :placeholder="placeholder ?? 'Search...'"
      class="w-full rounded-xl border border-[#e1e3e1] bg-white pl-11 pr-4 py-3 text-[#1f1f1f] placeholder:text-[#444746] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40 focus:border-[#1a73e8] transition-all"
    />
  </div>
</template>
