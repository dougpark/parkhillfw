<script setup lang="ts">
import { menuIcon } from './menuIcons';
import type { NavNode } from './menuTree';

defineProps<{ items: NavNode[] }>();

function routeFor(node: NavNode): string {
  if (node.kind === 'page') return `/pages/${node.pageSlug}`;
  return `/menu/${node.slug}`;
}

const cardClass = 'group rounded-3xl border border-theme-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/40';
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
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <component :is="menuIcon(node.iconName, node.kind)" class="h-6 w-6" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="truncate text-xl font-semibold text-content transition-colors group-hover:text-accent">{{ node.title }}</h3>
            <span v-if="node.isDraft" class="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">Draft</span>
          </div>
          <p v-if="node.description" class="mt-1 text-content-muted">{{ node.description }}</p>
        </div>
      </div>
    </component>
  </div>
</template>
