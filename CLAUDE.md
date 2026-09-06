# CLAUDE.md

## Project Overview
parkhillfw is a neighborhood directory and information site running on Cloudflare Workers, D1, and R2.

## Tech Stack & Runtime Constraints
• Package Manager & Runtime: Bun strictly (`bun install`, `bun test`, `bunx wrangler`). Do NOT use npm, pnpm, or yarn.
• Execution Environment: Cloudflare Workers (V8 Workers runtime, not Node.js).
• Backend Framework: Hono (configured for Cloudflare Workers export format).
• Frontend Framework: Vue 3 with Vite (Composition API only). Do NOT use React, Svelte, or Options API.
• Styling: Tailwind CSS v4 using the "Gemini-Modern" design system token definitions.
• Database & Storage: Cloudflare D1 (managed via Drizzle ORM) and Cloudflare R2.

## Key Commands
• bun install — Install dependencies.
• bun run dev — Start local full-stack development environment via `wrangler dev` / Vite HMR.
• bun run build — Build Vue 3 static frontend assets into `/dist`.
• bun run deploy — Deploy application and workers via `bunx wrangler deploy`.
• bun test — Run test suite using Bun's native test runner.

## Cloudflare & Environment Guidelines
• Bindings: Access D1 and R2 strictly through the Hono Cloudflare Workers environment context (`c.env.DB`, `c.env.BUCKET`).
• Static Asset Serving: Frontend static assets generated in `/dist` are served natively via Cloudflare Assets configuration in `wrangler.json`. Do not write manual file-streaming routes in Hono for standard static assets.

## Database & Migrations (D1 + Drizzle ORM)
• Schema Location: All database schemas MUST be defined in `src/db/schema.ts`.
• Client Access: Use `drizzle-orm/d1` initialized with the `c.env.DB` binding per request context.
• Schema Changes & Migration Workflow:
  1. Generate SQL migration: `bunx wrangler d1 migrations create <migration_name>`
  2. Execute migrations locally: `bunx wrangler d1 migrations apply DB --local`
  3. Execute migrations on production: `bunx wrangler d1 migrations apply DB --remote`
  4. Migration SQL files MUST be committed to version control in `./migrations`.

## Frontend Directives (Vue 3 + Composition API)
### Syntax & Architecture
• Component Scripting: Use strictly `<script setup lang="ts">` inside Single File Components (`.vue`).
• State Management: Use `ref()` for reactive primitives/arrays; use `reactive()` sparingly for explicit state objects.
• Directory Structure: Place components in `src/components/` organized by feature (`/directory`, `/news`, `/layout`, `/common`).
• Icons: Use `lucide-vue-next` or inline SVGs styled with Tailwind utility classes.

### Styling & Design Rules ("Gemini-Modern")
• Palette Tokens:
  - Surface/BG: `#ffffff`, `#f0f4f9`
  - Text: `#1f1f1f` (Primary), `#444746` (Subtext)
  - Accent: `#1a73e8` (Blue), `#7c4dff` (Purple), `#0b57d0` (Sparkle)
• Layout Principles:
  - High breathability padding (`p-6`, `p-8`).
  - Corner Radius: `rounded-xl` (12px) for cards/inputs; `rounded-3xl` (24px) for outer containers/modals.
  - Buttons: `bg-[#1a73e8] text-white px-6 py-3 rounded-full hover:opacity-90 transition-all font-medium`
• UI Reusability:
  - Check `src/components/ui` prior to creating new primitive UI elements.
  - Standardize buttons (`BaseButton.vue`), inputs (`BaseInput.vue`), and modals (`ModalShell.vue`).