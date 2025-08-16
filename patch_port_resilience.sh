#!/usr/bin/env bash
set -euo pipefail

# 1) Comment out any existing app.listen(...) lines
#    (safe: we keep the old code, but it won't run)
cp index.js index.js.bak.$(date +%s)
sed -i 's/^\(.*app\.listen(.*\)/\/\/ \1/' index.js

# 2) Append a robust, auto-fallback listener to the end of index.js
cat >> index.js <<'JS'

// ---- resilient server listen (appends by patch_port_resilience.sh) ----
const __PORT_DEFINED__ = typeof PORT !== 'undefined';
const __PORT__ = __PORT_DEFINED__ ? PORT : (process.env.PORT || 3000);

(function start(p){
  const srv = app.listen(p, () => console.log(`[server] listening on http://localhost:${p}`));
  srv.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const next = (Number(p) || 3000) + 1;
      console.warn(`[server] port ${p} in use, retrying on ${next}…`);
      start(next);
    } else {
      throw err;
    }
  });
})(__PORT__);
// ----------------------------------------------------------------------
JS

echo "Patched index.js for resilient port binding."
