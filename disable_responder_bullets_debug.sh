#!/usr/bin/env bash
set -euo pipefail

# Turn off the env flag if present
if grep -q '^DEBUG_RESPONDER=' .env 2>/dev/null; then
  sed -i 's/^DEBUG_RESPONDER=.*/DEBUG_RESPONDER=false/' .env
fi

# Remove the injected console.log, restoring the original line
sed -i "s|const bullets = toBullets(rest, 6); if (process.env.DEBUG_RESPONDER === 'true') { console.log('\\[responder\\] bullets:', bullets); }|const bullets = toBullets(rest, 6);|" src/services/responder/responder.js

echo "Disabled responder bullets debug. Restarting server recommended."
