# Copilot Instructions for parkhillfw

## Project context
- This repo is a neighborhood directory and information site built on Cloudflare Workers, Hono, Vue 3, D1, and R2.
- Use Bun for all package commands and runtime tasks: `bun install`, `bun run dev`, `bun run build`, `bun test`, and `bunx wrangler ...`.
- Do not use npm, pnpm, or yarn.
- Treat this as a Cloudflare Workers app, not a Node app.

## Architecture constraints
- Backend: Hono exported for Cloudflare Workers runtime.
- Frontend: Vue 3 with Composition API only.
- Styling: Tailwind CSS v4 with the Gemini-Modern design system tokens and spacing patterns.
- Database schema lives in `src/db/schema.ts`; access D1 via `c.env.DB` in each request context.
- Static frontend assets are built into `dist/` and served through the Cloudflare asset config; do not build custom file-streaming routes for normal static files.

## Product and UX expectations
- Mobile-first UI with desktop support.
- Keep visible behavior simple, explicit, and easy to verify.
- Prefer minimal, direct UI changes over broad refactors.
- When adjusting a card or list view, preserve the desktop/mobile distinction and only change the affected behavior.
- For search and filtering, keep the current controls predictable: text search plus explicit boolean filters should compose cleanly.
- When a field is blank, hide the label and value together rather than displaying empty placeholders.

## Workflow expectations
- Start by understanding the request and the affected screen before editing.
- Prefer the smallest patch that fixes the root cause.
- For UI bugs, validate the visible behavior and edge cases before claiming completion.
- If the task involves multiple rounds of iteration, compact or reset the conversation before it becomes too long.
- Repeat the same code path only when necessary; encode project conventions once instead of rediscovering them each session.

## Project-specific conventions
- Use `ref()` for reactive primitives and arrays; use `reactive()` sparingly for explicit state objects.
- Components should use `<script setup lang="ts">` and stay in the relevant feature folder under `src/components/` or `src/views/`.
- Keep directory-related work aligned with the existing domain models and the data schema in `docs/intent.md` and `src/db/schema.ts`.
- Prefer file references and concrete acceptance criteria in prompts instead of vague design requests.

## Verification
- Verify with the smallest relevant command after edits.
- Prefer targeted checks such as `bun test` or a build when appropriate.
- Do not claim a fix is complete without running the relevant verification step and reporting the result.

## Prompting pattern for this repo
Use prompts shaped like:
- feature or screen name
- exact behavior to change
- acceptance criteria
- edge cases or exclusions
- validation expectation

Example:
- “Update the mobile directory card.”
- “Hide the M:/H: phone labels when the number is blank.”
- “Keep desktop rendering unchanged.”
- “Verify the card still renders correctly with both values present.”
