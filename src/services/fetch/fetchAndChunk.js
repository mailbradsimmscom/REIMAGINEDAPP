import { chunkText } from '../../utils/chunk.js';

export async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
    const { default: pdfParse } = await import('pdf-parse');
    const buffer = Buffer.from(await res.arrayBuffer());
    const data = await pdfParse(buffer);
    return { text: data.text, source: 'manual' };
  }
  const html = await res.text();
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  $('script, style, nav').remove();
  return { text: $('body').text(), source: 'oem' };
}

export async function fetchAndChunk(url, maxChars, overlap) {
  const { text, source } = await fetchText(url);
  const chunks = chunkText(text, maxChars, overlap);
  return chunks.map(t => ({ text: t, metadata: { url, source } }));
}
