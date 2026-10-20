#!/usr/bin/env bash
# HTTP smoke test for a deployed Zuryo instance (read-only: signs in as the seeded demo users and GETs pages).
# Usage: scripts/smoke.sh https://your-app.vercel.app
B="${1:?usage: smoke.sh <base-url>}"; B="${B%/}"; fail=0
J=$(mktemp -d)
check(){ # label expected actual
  if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; else echo "FAIL $1 (expected $2, got $3)"; fail=1; fi; }
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
login(){
  csrf=$(curl -s -c "$J/$1" "$B/api/auth/csrf" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).csrfToken))")
  curl -s -b "$J/$1" -c "$J/$1" -o /dev/null -X POST "$B/api/auth/callback/credentials" \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "email=$2" --data-urlencode "password=password123" --data-urlencode "role=$3" -d "json=true"; }
for p in / /how-it-works /sign-in; do check "public $p" 200 "$(code "$B$p")"; done
for p in /customer /trainer /operations; do check "anon $p redirects" 307 "$(code "$B$p")"; done
check "cron without token refused" 401 "$(code "$B/api/cron/session-lifecycle" -H 'Authorization: Bearer wrong')"
login c priya.sharma@demo.zuryo.example CUSTOMER; login t arjun.mehta@demo.zuryo.example TRAINER; login o neha.kapoor@demo.zuryo.example OPERATIONS
for p in /customer /customer/bookings /customer/bookings/new /customer/packages /customer/fitness /customer/notifications; do check "customer $p" 200 "$(code -b "$J/c" "$B$p")"; done
for p in /trainer /trainer/sessions /trainer/availability /trainer/notifications; do check "trainer $p" 200 "$(code -b "$J/t" "$B$p")"; done
for p in /operations /operations/bookings /operations/pricing /operations/trainers; do check "operations $p" 200 "$(code -b "$J/o" "$B$p")"; done
# role isolation: other roles' workspaces must not render (redirect or forbidden)
for r in "c:/operations" "c:/trainer" "t:/customer" "t:/operations" "o:/customer" "o:/trainer"; do
  c=$(code -b "$J/${r%%:*}" "$B${r#*:}"); case "$c" in 200) echo "FAIL isolation ${r} (got 200)"; fail=1;; *) echo "PASS isolation ${r} ($c)";; esac; done
rm -rf "$J"; exit $fail
