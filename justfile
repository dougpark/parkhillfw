# Justfile for Park Hill FW Directory Management

# Load a separate file into its own sub-namespace
# mod conversion 'conversion.justfile'


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
# Sync Commands
# ------------------------------------------------------------------------------

## Full mirror of Production D1 into Staging D1 (residents, users, content, everything)
## WARNING: wipes and replaces staging's directory/content data. Does not touch
## d1_migrations, sessions, magic_tokens, or magic_link_rate_limits (transient/security state).
sync-prod-to-staging-full:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "📦 Exporting Production D1 database (parkhillfw-db)..."
    bunx wrangler d1 export parkhillfw-db --env production --remote -y --output=./prod_full_dump.sql

    echo "🧼 Splitting into per-table data files..."
    rm -rf ./sync_tmp && mkdir -p ./sync_tmp
    for t in households residents children users user_login_emails household_favorites \
             access_requests activity_logs household_archive pages document_folders \
             documents photo_folders photo_events photos settings; do
        grep "^INSERT INTO \"$t\"" ./prod_full_dump.sql > "./sync_tmp/$t.sql" || true
    done

    # menus is self-referencing (parent_id -> menus.id): insert with parent_id NULL
    # first, then backfill via UPDATE so row order never violates the FK.
    grep "^INSERT INTO \"menus\"" ./prod_full_dump.sql \
        | sed -E 's/^(INSERT INTO "menus" \("id","parent_id"[^)]*\) VALUES\([0-9]+,)(NULL|[0-9]+)(,.*)$/\1NULL\3/' \
        > ./sync_tmp/menus_insert.sql
    grep "^INSERT INTO \"menus\"" ./prod_full_dump.sql \
        | sed -E 's/^INSERT INTO "menus" \("id","parent_id"[^)]*\) VALUES\(([0-9]+),(NULL|[0-9]+),.*$/\1 \2/' \
        | awk '$2 != "NULL" {print "UPDATE \"menus\" SET parent_id="$2" WHERE id="$1";"}' \
        > ./sync_tmp/menus_update.sql

    echo "🧹 Clearing staging tables that are about to be replaced..."
    bunx wrangler d1 execute parkhillfw-db-staging --env staging --remote -y --command \
        'DELETE FROM photos; DELETE FROM photo_events; DELETE FROM photo_folders; DELETE FROM documents; DELETE FROM document_folders; DELETE FROM menus; DELETE FROM pages; DELETE FROM household_archive; DELETE FROM activity_logs; DELETE FROM access_requests; DELETE FROM household_favorites; DELETE FROM user_login_emails; DELETE FROM users; DELETE FROM children; DELETE FROM residents; DELETE FROM households; DELETE FROM settings;'

    echo "📥 Importing Production data into Staging D1 (dependency order, one table per request)..."
    for t in households residents children users user_login_emails household_favorites \
             access_requests activity_logs household_archive pages; do
        if [ -s "./sync_tmp/$t.sql" ]; then
            bunx wrangler d1 execute parkhillfw-db-staging --env staging --remote -y --file="./sync_tmp/$t.sql"
        fi
    done
    bunx wrangler d1 execute parkhillfw-db-staging --env staging --remote -y --file="./sync_tmp/menus_insert.sql"
    if [ -s "./sync_tmp/menus_update.sql" ]; then
        bunx wrangler d1 execute parkhillfw-db-staging --env staging --remote -y --file="./sync_tmp/menus_update.sql"
    fi
    for t in document_folders documents photo_folders photo_events photos settings; do
        if [ -s "./sync_tmp/$t.sql" ]; then
            bunx wrangler d1 execute parkhillfw-db-staging --env staging --remote -y --file="./sync_tmp/$t.sql"
        fi
    done

    echo "🧹 Removing temporary files..."
    rm -rf ./prod_full_dump.sql ./sync_tmp
    echo "✅ Staging D1 fully mirrors Production (residents, users, directory content, etc.)!"

## Full mirror of Production D1 into local Dev D1 (residents, users, content, everything)
## WARNING: wipes and replaces the local dev D1 data (.wrangler/state, --local only).
## Does not touch d1_migrations, sessions, magic_tokens, or magic_link_rate_limits.
sync-prod-to-local-full:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "📦 Exporting Production D1 database (parkhillfw-db)..."
    bunx wrangler d1 export parkhillfw-db --env production --remote -y --output=./prod_full_dump.sql

    echo "🧼 Splitting into per-table data files..."
    rm -rf ./sync_tmp && mkdir -p ./sync_tmp
    for t in households residents children users user_login_emails household_favorites \
             access_requests activity_logs household_archive pages document_folders \
             documents photo_folders photo_events photos settings; do
        grep "^INSERT INTO \"$t\"" ./prod_full_dump.sql > "./sync_tmp/$t.sql" || true
    done

    # menus is self-referencing (parent_id -> menus.id): insert with parent_id NULL
    # first, then backfill via UPDATE so row order never violates the FK.
    grep "^INSERT INTO \"menus\"" ./prod_full_dump.sql \
        | sed -E 's/^(INSERT INTO "menus" \("id","parent_id"[^)]*\) VALUES\([0-9]+,)(NULL|[0-9]+)(,.*)$/\1NULL\3/' \
        > ./sync_tmp/menus_insert.sql
    grep "^INSERT INTO \"menus\"" ./prod_full_dump.sql \
        | sed -E 's/^INSERT INTO "menus" \("id","parent_id"[^)]*\) VALUES\(([0-9]+),(NULL|[0-9]+),.*$/\1 \2/' \
        | awk '$2 != "NULL" {print "UPDATE \"menus\" SET parent_id="$2" WHERE id="$1";"}' \
        > ./sync_tmp/menus_update.sql

    echo "🧹 Clearing local dev tables that are about to be replaced..."
    bunx wrangler d1 execute DB --local -y --command \
        'DELETE FROM photos; DELETE FROM photo_events; DELETE FROM photo_folders; DELETE FROM documents; DELETE FROM document_folders; DELETE FROM menus; DELETE FROM pages; DELETE FROM household_archive; DELETE FROM activity_logs; DELETE FROM access_requests; DELETE FROM household_favorites; DELETE FROM user_login_emails; DELETE FROM users; DELETE FROM children; DELETE FROM residents; DELETE FROM households; DELETE FROM settings;'

    echo "📥 Importing Production data into local Dev D1 (dependency order, one table per request)..."
    for t in households residents children users user_login_emails household_favorites \
             access_requests activity_logs household_archive pages; do
        if [ -s "./sync_tmp/$t.sql" ]; then
            bunx wrangler d1 execute DB --local -y --file="./sync_tmp/$t.sql"
        fi
    done
    bunx wrangler d1 execute DB --local -y --file="./sync_tmp/menus_insert.sql"
    if [ -s "./sync_tmp/menus_update.sql" ]; then
        bunx wrangler d1 execute DB --local -y --file="./sync_tmp/menus_update.sql"
    fi
    for t in document_folders documents photo_folders photo_events photos settings; do
        if [ -s "./sync_tmp/$t.sql" ]; then
            bunx wrangler d1 execute DB --local -y --file="./sync_tmp/$t.sql"
        fi
    done

    echo "🧹 Removing temporary files..."
    rm -rf ./prod_full_dump.sql ./sync_tmp
    echo "✅ Local Dev D1 fully mirrors Production (residents, users, directory content, etc.)!"

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

## Wipes all "Pay Dues" test data for LOCAL DEV ONLY: deletes every Stripe customer
## referenced by a local household (deleting a Stripe customer cascades to cancel
## their subscriptions too), then clears the local subscriptions/payments tables and
## unlinks households.stripe_customer_id so the Pay Dues flow starts fresh for every
## household. Only touches customer IDs recorded in the LOCAL dev D1 — dev and staging
## share one Stripe sandbox, but staging's own test customers/subscriptions live under
## different IDs recorded in staging's D1, so this cannot affect staging.
reset-dues-local:
    #!/usr/bin/env bash
    set -euo pipefail
    STRIPE_SECRET_KEY=$(grep '^STRIPE_SECRET_KEY=' .dev.vars | cut -d= -f2-)
    if [ -z "$STRIPE_SECRET_KEY" ]; then
        echo "❌ STRIPE_SECRET_KEY not found in .dev.vars"; exit 1
    fi

    echo "🔎 Finding Stripe customers referenced by local dev households..."
    CUSTOMER_IDS=$(bunx wrangler d1 execute DB --local -y --json \
        --command "SELECT stripe_customer_id FROM households WHERE stripe_customer_id IS NOT NULL;" \
        | bun -e 'const data = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(data[0].results.map((r) => r.stripe_customer_id).join("\n"));')

    if [ -z "$CUSTOMER_IDS" ]; then
        echo "ℹ️  No Stripe customers found on local households — nothing to delete on Stripe's side."
    else
        echo "🗑️  Deleting Stripe customers (this cascades to cancel their subscriptions)..."
        for id in $CUSTOMER_IDS; do
            echo "   - $id"
            stripe customers delete "$id" --api-key "$STRIPE_SECRET_KEY" --confirm || echo "     (already gone, skipping)"
        done
    fi

    echo "🧹 Clearing local dev subscriptions/payments and unlinking households..."
    bunx wrangler d1 execute DB --local -y --command \
        "DELETE FROM payments; DELETE FROM subscriptions; UPDATE households SET stripe_customer_id = NULL;"

    echo "✅ Local dev Pay Dues test data cleared — households now look brand-new to Stripe."

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

## Wipes all "Pay Dues" test data for STAGING ONLY: deletes every Stripe customer
## referenced by a staging household (deleting a Stripe customer cascades to cancel
## their subscriptions too), then clears staging's subscriptions/payments tables and
## unlinks households.stripe_customer_id. WARNING: runs against the remote staging
## D1 database and the shared Stripe sandbox — only touches customer IDs recorded in
## staging's own D1, so local dev's test data is untouched.
reset-dues-staging:
    #!/usr/bin/env bash
    set -euo pipefail
    STRIPE_SECRET_KEY=$(grep '^STRIPE_SECRET_KEY=' .dev.vars | cut -d= -f2-)
    if [ -z "$STRIPE_SECRET_KEY" ]; then
        echo "❌ STRIPE_SECRET_KEY not found in .dev.vars"; exit 1
    fi

    echo "🔎 Finding Stripe customers referenced by staging households..."
    CUSTOMER_IDS=$(bunx wrangler d1 execute parkhillfw-db-staging --env staging --remote -y --json \
        --command "SELECT stripe_customer_id FROM households WHERE stripe_customer_id IS NOT NULL;" \
        | bun -e 'const data = JSON.parse(require("fs").readFileSync(0, "utf8")); console.log(data[0].results.map((r) => r.stripe_customer_id).join("\n"));')

    if [ -z "$CUSTOMER_IDS" ]; then
        echo "ℹ️  No Stripe customers found on staging households — nothing to delete on Stripe's side."
    else
        echo "🗑️  Deleting Stripe customers (this cascades to cancel their subscriptions)..."
        for id in $CUSTOMER_IDS; do
            echo "   - $id"
            stripe customers delete "$id" --api-key "$STRIPE_SECRET_KEY" --confirm || echo "     (already gone, skipping)"
        done
    fi

    echo "🧹 Clearing staging subscriptions/payments and unlinking households..."
    bunx wrangler d1 execute parkhillfw-db-staging --env staging --remote -y --command \
        "DELETE FROM payments; DELETE FROM subscriptions; UPDATE households SET stripe_customer_id = NULL;"

    echo "✅ Staging Pay Dues test data cleared — households now look brand-new to Stripe."

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