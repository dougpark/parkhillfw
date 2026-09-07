<script setup lang="ts">
import { Menu } from 'lucide-vue-next';
</script>

<template>
  <div class="min-h-screen bg-[#f0f4f9] text-[#1f1f1f] font-sans">
    <header class="sticky top-0 z-20 bg-white border-b border-[#e1e3e1]">
      <div class="max-w-5xl mx-auto flex items-center justify-between px-4 py-3 sm:px-8">
        <h1 class="text-lg sm:text-xl font-semibold tracking-tight text-[#1a73e8]">
          Park Hill Neighborhood
        </h1>
        <!-- Admin menu placeholder; shown only to authorized editors/admins once auth UI exists -->
        <button
          type="button"
          class="p-2 rounded-full hover:bg-[#f0f4f9] transition-colors text-[#444746]"
          aria-label="Menu"
        >
          <Menu class="w-5 h-5" />
        </button>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6 sm:px-8">
      <router-view />
    </main>
  </div>
</template>
