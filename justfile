# Justfile for Park Hill FW Directory Management

# Default recipe listing available commands
default:
    @just --list

# ------------------------------------------------------------------------------
# Build Commands
# ------------------------------------------------------------------------------

# Build frontend assets into dist/
build:
    bun run build

# ------------------------------------------------------------------------------
# Local Development Commands
# ------------------------------------------------------------------------------

# Run D1 migrations against Local Dev database
# migrate-local:
#    bun x wrangler d1 migrations apply DB --local
#    date

# Run D1 migrations against Local Dev
migrate-local:
    bun run db:migrate:local
    date

# Run wrangler local in dev mode
dev: build
    bunx wrangler dev

# ------------------------------------------------------------------------------
# Staging Commands
# ------------------------------------------------------------------------------

# NEW Run D1 migrations against Staging
migrate-staging:
    bun run db:migrate:staging
    date

# NEW Build and deploy to Staging
deploy-staging: build
    bun run deploy:staging
    date

# Tail live log stream from Staging
logs-staging:
    bunx wrangler tail --env staging

# ------------------------------------------------------------------------------
# Production Commands
# ------------------------------------------------------------------------------

# OLD - build and deploy to remote
deploy: build
    bun run deploy
    date

# OLD - migrate -- remote
migrate-remote:
    bun x wrangler d1 migrations apply DB --remote
    date

# NEW Build and deploy to Production
deploy-prod: build
    bun run deploy:prod
    date

# NEW Run D1 migrations against Production
migrate-prod:
    bun run db:migrate:prod
    date

# Tail live log stream from Production
logs-prod:
    bunx wrangler tail --env production

# ------------------------------------------------------------------------------
# Utility Commands
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