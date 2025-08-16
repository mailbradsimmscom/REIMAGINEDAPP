#!/usr/bin/env bash
set -euo pipefail

# Ensure parent directories exist
mkdir -p src/services/responder

# Overwrite responder.js with stricter cleanup logic
cat > src/services/responder/responder.js <<'JS'
// Centralized tone/formatting — stricter cleanup of numbered lists & bullets

function cleanText(s) {
  return (s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')   // trim trailing spaces at EOL
    .replace(/\n{3,}/g, '\n\n')   // collapse huge gaps
    .replace(/\s+,/g, ',')        // tidy " ,"
    .trim();
}

function splitIntoSentences(s) {
  return cleanText(s)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9\-\*])/)
    .filter(Boolean);
}

function stripLineMarkers(line) {
  return line
    .replace(/^\s*[-*•]\s+/, '')                 // -, *, •
    .replace(/^\s*\d{1,3}[.)]\s+/, '')           // "1. " or "2) "
    .replace(/^\s*\(\d{1,3}\)\s+/, '')           // "(3) "
    .replace(/^\s*\d{1,3}\s+-\s+/, '')           // "1 - "
    .trim();
}

function removeInlineEnumeratorsToBreaks(text) {
  return text
    .replace(/(^|\n)\s*\d{1,3}[.)]\s+/g, '$1')   // drop leading "1. " / "2) "
    .replace(/(^|\n)\s*[-*•]\s+/g, '$1');        // drop leading "-", "*", "•"
}

function toBullets(fromText, max = 6) {
  const prepped = removeInlineEnumeratorsToBreaks(cleanText(fromText));

  let parts = prepped.split(/\n+/).filter(Boolean);
  if (parts.length <= 1) {
    parts = splitIntoSentences(prepped);
  }

  const cleaned = parts
    .map(stripLineMarkers)
    .map(s => s.replace(/^\s*\d{1,3}[.)]$/, '').trim())
    .filter(s => s && s.length > 2);

  const seen = new Set();
  const uniq = [];
  for (const l of cleaned) {
    const k = l.toLowerCase();
    if (!seen.has(k)) { seen.add(k); uniq.push(l); }
  }
  return uniq.slice(0, max);
}

const templates = {
  base({ title, summary, bullets = [], cta, raw }) {
    return { title, summary, bullets, cta, raw };
  }
};

async function applyToneAndFormat(draft, opts = {}) {
  const text = typeof draft === 'string' ? draft : (draft.text || '');
  const cleaned = cleanText(text);

  const sentences = splitIntoSentences(cleaned);
  const summary = sentences.slice(0, 2).join(' ');

  const rest = cleaned.slice(summary.length).trim();
  const bullets = toBullets(rest, 6);

  const title = (opts.title || 'Answer').trim();
  const cta = opts.cta || null;

  return templates.base({
    title,
    summary,
    bullets,
    cta,
    raw: draft
  });
}

module.exports = { responder: { applyToneAndFormat } };
JS

echo "Responder updated. Nodemon will auto-reload."
