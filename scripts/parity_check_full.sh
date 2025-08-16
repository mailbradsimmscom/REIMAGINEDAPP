#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:3000"
TOKEN_HEADER=()
if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  TOKEN_HEADER=(-H "x-admin-token: ${ADMIN_TOKEN}")
fi

echo "== Root =="
curl -sf "$BASE/" && echo

echo "== Health / Ready =="
curl -sf "$BASE/health" && echo
curl -sf "$BASE/ready" && echo

echo "== API Query =="
curl -sf -X POST "$BASE/api/query" -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the watermaker maintenance schedule"}' && echo

echo "== BFF (web / ios) =="
curl -sf -X POST "$BASE/bff/web/query" -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the watermaker maintenance schedule"}' && echo
curl -sf -X POST "$BASE/bff/ios/query" -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the watermaker maintenance schedule"}' && echo

echo "== Admin =="
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin" && echo
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/pinecone" && echo
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/world/settings" && echo

echo "== Debug =="
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/debug/keyword?q=watermaker" && echo
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/debug/textsearch?q=membrane" && echo

echo "== Public legacy =="
curl -sf "$BASE/documents" && echo
curl -sf "$BASE/topics" && echo
curl -sf "$BASE/playbooks" && echo

echo "== Feedback (POST) =="
curl -sf -X POST "$BASE/feedback" -H 'Content-Type: application/json' \
  -d '{"message":"great answer","rating":5}' && echo
