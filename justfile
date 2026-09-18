# Justfile for Park Hill FW Directory Management

# Default recipe listing available commands
default:
    @just --list

# Seed local D1 database from CSV
seed-local:
    bun run scripts/run-seed-local.ts

# Seed remote (production) Cloudflare D1 database from CSV
seed-remote:
    bun run scripts/run-seed-remote.ts --remote

# Export local D1 database to directory-export.md
export-md-local:
    bun run scripts/export-full-directory-md.ts

# Export remote (production) Cloudflare D1 database to directory-export-remote.md
export-md-remote:
    bun run scripts/export-full-directory-md.ts --remote

# Seed local database and immediately export to Markdown
full-local: seed-local export-md-local

# Seed remote database and immediately export to Markdown
full-remote: seed-remote export-md-remote

# Count rows in remote production tables
count-directory-remote:
    bun run scripts/count-remote.ts --remote

# Count rows in local dev tables
count-directory-local:
    bun run scripts/count-local.ts --local

# count remote
count-remote:
    bun run wrangler d1 execute parkhillfw-db --remote --command " \
    SELECT 'households' AS table_name, COUNT(*) AS count FROM households \
    UNION ALL \
    SELECT 'residents' AS table_name, COUNT(*) AS count FROM residents \
    UNION ALL \
    SELECT 'children' AS table_name, COUNT(*) AS count FROM children; \
    "
# count local
count-local:
    bun run wrangler d1 execute parkhillfw-db --local --command " \
    SELECT 'households' AS table_name, COUNT(*) AS count FROM households \
    UNION ALL \
    SELECT 'residents' AS table_name, COUNT(*) AS count FROM residents \
    UNION ALL \
    SELECT 'children' AS table_name, COUNT(*) AS count FROM children; \
    "



# migrate -- remote
migrate-remote:
    bun x wrangler d1 migrations apply DB --remote
    date

# Reset directory confirmation & update timestamps (remote)
reset-reminders-remote:
    bun run scripts/reset-directory-reminders.ts --remote

# Reset directory confirmation & update timestamps (local)
reset-reminders-local:
    bun run scripts/reset-directory-reminders.ts

# Run wrangler local in dev mode
dev: build
    bunx wrangler dev

# build and deploy to remote
deploy: build
    bun run deploy
    date

# Build frontend assets into dist/
build:
    bun run build

# Toggle PS1 prompt between short folder name (\W) and full path (\w)
prompt:
	@if grep -q "export PS1=.*\\\\W" ~/.bashrc; then \
		sed -i 's/export PS1=.*\\W.*/export PS1="\\\[\\\e\[32m\\\]\\w\\\[\\\e\[0m\\\] \\\$$ "/' ~/.bashrc; \
		echo "Switched prompt to full path (\\w). Run 'source ~/.bashrc' to apply."; \
	else \
		sed -i '/export PS1=.*\\w/d' ~/.bashrc; \
		sed -i '/export PS1=.*\\W/d' ~/.bashrc; \
		echo 'export PS1="\[\e[32m\]\W\[\e[0m\] \$ "' >> ~/.bashrc; \
		echo "Switched prompt to short folder name (\\W). Run 'source ~/.bashrc' to apply."; \
	fi