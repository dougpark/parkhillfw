# Load local environment variables for local runs
# set dotenv-filename := ".dev.vars"

# Default command: List all available recipes
default:
  @just --list

# ------------------------------------------------------------------------------
# Build Commands
# ------------------------------------------------------------------------------

# Build frontend assets into dist/
build:
    bun run build

# ------------------------------------------------------------------------------
# LOCAL DEVELOPMENT
# ------------------------------------------------------------------------------

# Start local worker dev server against local D1
dev: build
  bunx wrangler dev

# Execute local D1 migrations
migrate-local:
  bunx wrangler d1 execute portal-db-staging --local --file=./schema.sql

# ------------------------------------------------------------------------------
# STAGING COMMANDS
# ------------------------------------------------------------------------------

# Deploy application to Cloudflare Staging
deploy-staging: build
  bunx wrangler deploy --env staging

# Run schema migrations against Staging D1
migrate-staging:
  bunx wrangler d1 execute portal-db-staging --env staging --file=./schema.sql

# Tail live log stream from Staging
logs-staging:
  bunx wrangler tail --env staging

# ------------------------------------------------------------------------------
# PRODUCTION COMMANDS
# ------------------------------------------------------------------------------

# Deploy application to Cloudflare Production
deploy-prod: build
  bunx wrangler deploy --env production

# Run schema migrations against Production D1
migrate-prod:
  bunx wrangler d1 execute portal-db-prod --env production --file=./schema.sql

# Tail live log stream from Production
logs-prod:
  bunx wrangler tail --env production

# ------------------------------------------------------------------------------
# DATA SYNC: PRODUCTION TO STAGING
# ------------------------------------------------------------------------------

# Dump Production D1 data and overwrite Staging D1
sync-prod-to-staging:
  @echo "⚠️ Fetching Production D1 database dump..."
  bunx wrangler d1 export portal-db-prod --env production --remote --output=./prod_dump.sql
  @echo "🧹 Wiping and applying schema to Staging D1..."
  bunx wrangler d1 execute portal-db-staging --env staging --remote --command="PRAGMA foreign_keys = OFF;"
  bunx wrangler d1 execute portal-db-staging --env staging --remote --file=./schema.sql
  @echo "📥 Importing Production data into Staging..."
  bunx wrangler d1 execute portal-db-staging --env staging --remote --file=./prod_dump.sql
  @echo "🧼 Cleaning up temporary export file..."
  rm ./prod_dump.sql
  @echo "✅ Production data successfully synced to Staging D1!"

# ------------------------------------------------------------------------------
# Helper Commands
# ------------------------------------------------------------------------------

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