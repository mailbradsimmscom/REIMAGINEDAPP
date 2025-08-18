// src/views/serializers.js

// Keep the web response minimal: just raw model text.
// (No title, summary, bullets, CTA injected by the UI layer.)
export function webSerializer(structured) {
  return {
    raw: structured?.raw || { text: '' },
  };
}

// API response includes raw text and references (useful for debugging),
 // but still no UI scaffolding fields added.
export function apiSerializer(structured) {
  const raw = structured?.raw || { text: '', references: [] };
  return { raw };
}

export default { webSerializer, apiSerializer };
