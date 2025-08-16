#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:3000"
TOKEN_HEADER=()
if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  TOKEN_HEADER=(-H "x-admin-token: ${ADMIN_TOKEN}")
fi

echo "== Admin: Supabase =="
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/supabase" && echo

echo "== Documents =="
curl -sf "$BASE/documents" && echo

echo "== Topics =="
curl -sf "$BASE/topics" && echo

echo "== Feedback insert (200 even if table missing will show error payload) =="
curl -sf -X POST "$BASE/feedback" -H 'Content-Type: application/json' \
  -d '{"message":"great answer","rating":5,"question":"Q?","answer":"A!","meta":{"route":"test"}}' && echo
