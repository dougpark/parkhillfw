<script setup lang="ts">
import { CreditCard, ExternalLink } from 'lucide-vue-next';
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight">Payment Processor</h2>
      <p class="mt-2 text-content-muted">Manage payment processors, dues pricing &amp; reports</p>
    </div>

    <div class="space-y-3">
      <a
        href="https://dashboard.stripe.com"
        target="_blank"
        rel="noopener noreferrer"
        class="flex w-full items-center gap-4 rounded-2xl border border-theme-border bg-surface p-5 text-left shadow-sm transition-colors hover:bg-app-bg"
      >
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <CreditCard class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-content">Stripe Dashboard</span>
          <span class="mt-0.5 block text-xs text-content-muted">Login with your Stripe administrator email</span>
        </span>
        <ExternalLink class="h-5 w-5 shrink-0 text-content-muted" />
      </a>
    </div>

    <p class="text-xs text-content-muted">Additional link and info cards will be added in the future.</p>
  </section>
</template>
