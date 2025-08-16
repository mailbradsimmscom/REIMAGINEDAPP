#!/usr/bin/env bash
set -euo pipefail

# Ensure the env flag exists
if ! grep -q '^DEBUG_RESPONDER=' .env 2>/dev/null; then
  echo 'DEBUG_RESPONDER=true' >> .env
else
  sed -i 's/^DEBUG_RESPONDER=.*/DEBUG_RESPONDER=true/' .env
fi

# Inject a conditional console.log after bullets calculation
# Replaces:  const bullets = toBullets(rest, 6);
# With:      const bullets = toBullets(rest, 6); if (process.env.DEBUG_RESPONDER === 'true') { console.log('[responder] bullets:', bullets); }
sed -i "s|const bullets = toBullets(rest, 6);|const bullets = toBullets(rest, 6); if (process.env.DEBUG_RESPONDER === 'true') { console.log('[responder] bullets:', bullets); }|" src/services/responder/responder.js

echo "Enabled responder bullets debug. Restarting server recommended."
