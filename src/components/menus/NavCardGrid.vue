<script setup lang="ts">
import { menuIcon } from './menuIcons';
import type { NavNode } from './menuTree';

defineProps<{ items: NavNode[] }>();

function routeFor(node: NavNode): string {
  if (node.kind === 'page') return `/pages/${node.pageSlug}`;
  return `/menu/${node.slug}`;
}

const cardClass = 'group rounded-3xl border border-[#e1e3e1] bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/40';
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <component
      v-for="node in items"
      :key="node.id"
      :is="node.kind === 'link' ? 'a' : 'RouterLink'"
      v-bind="node.kind === 'link'
        ? { href: node.targetUrl, target: '_blank', rel: 'noopener noreferrer' }
        : { to: routeFor(node) }"
      :class="cardClass"
    >
      <div class="flex items-center gap-4">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e8f0fe] text-[#1a73e8]">
          <component :is="menuIcon(node.iconName, node.kind)" class="h-6 w-6" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-xl font-semibold text-[#1f1f1f]">{{ node.title }}</h3>
            <span v-if="node.isDraft" class="rounded-full bg-[#fff8e1] px-2 py-0.5 text-xs font-medium text-[#8a6116]">Draft</span>
          </div>
          <p v-if="node.description" class="mt-1 text-[#444746]">{{ node.description }}</p>
        </div>
      </div>
      <span class="mt-4 inline-block text-sm font-medium text-[#1a73e8] transition-transform group-hover:translate-x-1">Open <span aria-hidden="true">-&gt;</span></span>
    </component>
  </div>
</template>
