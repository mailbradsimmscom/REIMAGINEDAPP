export function sanitizeMetadata(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (v === null || v === undefined) continue;

    if (Array.isArray(v)) {
      const arr = v.map(x => (x === null || x === undefined ? '' : String(x))).filter(s => s.length > 0);
      if (arr.length) out[k] = arr;
      continue;
    }

    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[k] = v;
      continue;
    }
    // drop objects/other unsupported types
  }
  return out;
}
