<script setup lang="ts">
import { MessageCircle, Phone, X } from 'lucide-vue-next';
import { phoneHref, smsHref } from '@/lib/contact';

const props = defineProps<{
  phone: string;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-[#1f1f1f]/35 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Choose phone action"
      @click="emit('close')"
    >
      <div class="w-full max-w-sm rounded-3xl border border-theme-border bg-surface p-4 shadow-2xl" @click.stop>
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-content">What would you like to do?</p>
            <p class="mt-1 text-sm text-content-muted">{{ props.phone }}</p>
          </div>
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-muted hover:bg-surface-hover"
            aria-label="Close phone actions"
            @click="emit('close')"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <a
            :href="phoneHref(props.phone)"
            class="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-on-accent"
            @click="emit('close')"
          >
            <Phone class="h-5 w-5" aria-hidden="true" />
            Call
          </a>
          <a
            :href="smsHref(props.phone)"
            class="flex min-h-14 items-center justify-center gap-2 rounded-full border border-theme-border bg-surface px-4 text-sm font-medium text-content hover:bg-surface-hover"
            @click="emit('close')"
          >
            <MessageCircle class="h-5 w-5 text-accent" aria-hidden="true" />
            Text
          </a>
        </div>
      </div>
    </div>
  </Teleport>
</template>
