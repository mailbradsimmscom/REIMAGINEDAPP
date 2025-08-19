import { chunkText } from '../../utils/chunk.js';

export async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
    const { default: pdfParse } = await import('pdf-parse');
    const buffer = Buffer.from(await res.arrayBuffer());
    const data = await pdfParse(buffer);
    return data.text;
  }
  const html = await res.text();
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  return $('body').text();
}

export async function fetchAndChunk(url, maxChars, overlap) {
  const text = await fetchText(url);
  return chunkText(text, maxChars, overlap);
}
