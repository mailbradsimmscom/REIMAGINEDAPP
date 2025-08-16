#!/usr/bin/env bash
set -euo pipefail
mkdir -p golden
curl -s http://localhost:3000/health > golden/health.json
curl -s -X POST http://localhost:3000/api/query -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the watermaker maintenance schedule"}' > golden/query_api_watermaker.json
curl -s -X POST http://localhost:3000/bff/web/query -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the watermaker maintenance schedule"}' > golden/query_web_watermaker.json
for f in golden/*.json; do printf "%s  " "$f"; sha256sum "$f" | awk '{print $1}'; done
