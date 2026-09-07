<script setup lang="ts">
import { Check } from 'lucide-vue-next';

defineProps<{
  modelValue: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
}>();
</script>

<template>
  <label
    :class="[
      'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium cursor-pointer transition-all select-none',
      modelValue
        ? 'border-[#1a73e8] bg-[#1a73e8] text-white shadow-sm'
        : 'border-[#e1e3e1] bg-white text-[#444746] hover:bg-[#f0f4f9]'
    ]"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      class="sr-only"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <Check v-if="modelValue" class="h-4 w-4" aria-hidden="true" />
    <slot />
  </label>
</template>
