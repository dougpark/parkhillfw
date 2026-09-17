# parkhillfw

A mobile-first neighborhood directory and information site — built as a Cloudflare Workers app with a Vue 3 frontend, D1 database, and R2 file storage.

## Features

- **Directory** — searchable household/resident directory, imported from CSV, with list and detail views.
- **Pages** — a full markdown editor (with live preview, drag-and-drop and paste-to-upload attachments) for admin-authored content pages.
- **Menus** — nested folders of pages and links that drive site navigation, each independently public or members-only.
- **Info messages** — short, prioritized announcements shown on the homepage with optional start/end dates, color, and icon.
- **Document & photo library** — a Drive-style browser for documents and photo galleries, with shareable markdown links and an in-app viewer.
- **Auth** — passwordless email magic links (via Cloudflare Email) with long-lived browser sessions, plus role-based access (Owner, Admin, Page Editor, Directory Editor, User).

## Tech stack

| Layer      | Technology                                      |
| ---------- | ------------------------------------------------ |
| Runtime    | [Bun](https://bun.com)                            |
| Backend    | [Hono](https://hono.dev) on Cloudflare Workers    |
| Frontend   | Vue 3 (Composition API) + Vite                    |
| Styling    | Tailwind CSS v4                                   |
| Database   | Cloudflare D1 via [Drizzle ORM](https://orm.drizzle.team) |
| Storage    | Cloudflare R2                                     |
| Editor     | CodeMirror 6 + markdown-it                        |

## Getting started

### Prerequisites

- [Bun](https://bun.com) (used for all package management and scripts — no npm/pnpm/yarn)
- A Cloudflare account with Wrangler access to the project's D1 database and R2 bucket

### Install

```bash
bun install
```

### Run locally

Starts the Wrangler dev server (Workers/API) and the Vite dev server (frontend) together:

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Deploy

```bash
bun run deploy
```

### Test

```bash
bun test
```

## Database migrations

Schema lives in [`src/db/schema.ts`](src/db/schema.ts); migration SQL is generated with Drizzle Kit and applied with Wrangler.

```bash
bun run db:generate            # generate a new migration from schema changes
bun run db:migrate:local        # apply migrations to the local D1 database
bun run db:migrate:remote       # apply migrations to the production D1 database
```

## Project structure

```
src/
  index.ts          # Hono backend, exported for the Workers runtime
  main.ts, App.vue   # Vue app entry point
  components/        # Vue components, organized by feature
  views/              # Route-level views
  db/schema.ts        # Drizzle schema (D1)
  composables/         # Shared Vue composables
  lib/                 # Markdown rendering and other shared utilities
migrations/          # SQL migrations, committed to version control
scripts/             # One-off data import/export/seed scripts
docs/                # Feature and schema planning notes
```

## Repository-specific scripts

A [`justfile`](justfile) collects common one-off data tasks (seeding, exporting, and counting directory data locally or against production):

```bash
just seed-local        # seed the local D1 database from CSV
just export-md-local   # export the local directory to Markdown
just count-local       # count directory rows locally
just deploy             # build, deploy, and print a timestamp
```

Run `just` with no arguments to list every available recipe.
