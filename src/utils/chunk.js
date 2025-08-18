export function chunkText(
  text,
  maxChars = Number(process.env.CHUNK_MAX_CHARS || 3500),
  overlap  = Number(process.env.CHUNK_OVERLAP   || 200)
) {
  if (!text) return [];
  const cleaned = String(text).replace(/\r/g, '').trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const paras = cleaned.split(/\n\s*\n/);
  const chunks = [];
  let buf = '';

  const sliceWithOverlap = (s) => {
    let i = 0;
    while (i < s.length) {
      const end = Math.min(s.length, i + maxChars);
      chunks.push(s.slice(i, end));
      i = end - overlap;
      if (i < 0) i = 0;
      if (i >= s.length) break;
    }
  };

  for (const p of paras) {
    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else {
      if (buf) sliceWithOverlap(buf);
      if (p.length > maxChars) {
        sliceWithOverlap(p);
        buf = '';
      } else {
        buf = p;
      }
    }
  }
  if (buf) sliceWithOverlap(buf);
  return chunks;
}
