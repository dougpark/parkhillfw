#!/usr/bin/env bash
# Owner-protection negative tests against the local D1 database.
set -u

PORT=8799
BASE="http://127.0.0.1:${PORT}"
fail=0

sql() { bun x wrangler d1 execute DB --local --command "$1" >/dev/null 2>&1; }

boot() {
  bun x wrangler dev --port "$PORT" --var DEV_BYPASS_AUTH:true --var "DEV_BYPASS_ROLE:$1" >/tmp/wrangler-neg.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -sf "${BASE}/api/health" >/dev/null 2>&1 && return
    sleep 1
  done
}

shutdown() { kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; }

check() { # name method path body want
  local got
  if [[ -n "$4" ]]; then
    got=$(curl -s -o /dev/null -w '%{http_code}' -X "$2" -H 'Content-Type: application/json' -d "$4" "${BASE}$3")
  else
    got=$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "${BASE}$3")
  fi
  if [[ "$got" == "$5" ]]; then echo "  ok   $1 -> $got"; else echo "  FAIL $1 -> $got (want $5)"; fail=1; fi
}

sql "insert or ignore into users (id, email, link_status) values (2, 'smoke-test@example.com', 'unlinked')"
sql "update users set is_owner = 1, is_admin = 1 where id = 1"
sql "update users set is_owner = 0, is_admin = 0, is_page_editor = 0, is_directory_editor = 0 where id = 2"

echo "== actor: admin (non-owner), target: Owner account (id 1)"
boot admin
check "grant isOwner to id 2"        PUT    /api/admin/users/2/permissions '{"field":"isOwner","value":true}' 403
check "change Owner's isAdmin"       PUT    /api/admin/users/1/permissions '{"field":"isAdmin","value":false}' 403
check "clear Owner's permissions"    POST   /api/admin/users/1/permissions/clear '' 403
check "edit Owner's login emails"    PUT    /api/admin/users/1/login-emails '{"alternateEmails":["takeover@example.com"]}' 403
check "list Owner's sessions"        GET    /api/admin/users/1/sessions '' 403
check "revoke Owner's session"       DELETE /api/admin/users/1/sessions/0 '' 403
check "suspend Owner"                PUT    /api/admin/users/1/suspend '{"suspended":true}' 403
check "force-logout Owner"           POST   /api/admin/users/1/force-logout '' 403
check "magic link to Owner"          POST   /api/admin/users/1/send-magic-link '' 403
check "non-owner target still ok"    PUT    /api/admin/users/2/permissions '{"field":"isPageEditor","value":true}' 200
shutdown

echo "== actor: owner"
boot owner
check "self-revoke own Owner flag"   PUT /api/admin/users/1/permissions '{"field":"isOwner","value":false}' 409
check "self-clear own Owner access"  POST /api/admin/users/1/permissions/clear '' 409
check "grant Owner to id 2"          PUT /api/admin/users/2/permissions '{"field":"isOwner","value":true}' 200
shutdown

# Make id 2 the only Owner so removing it must trip the last-Owner guard.
sql "update users set is_owner = 0 where id = 1"
boot owner
check "remove the last Owner"        PUT /api/admin/users/2/permissions '{"field":"isOwner","value":false}' 409
shutdown

sql "update users set is_owner = 1, is_admin = 1 where id = 1"
sql "delete from users where id = 2"

exit "$fail"
