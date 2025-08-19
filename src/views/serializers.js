// src/views/serializers.js
// Serializers for different clients (web BFF vs verbose API)

export function webSerializer(structured) {
  // For web, keep it tight and display-focused
  const { title, summary, bullets, cta } = structured || {};
  return {
    title: title || 'Answer',
    summary: summary || null,
    bullets: Array.isArray(bullets) ? bullets : [],
    cta: cta || null,
  };
}

export function apiSerializer(structured) {
  // Verbose form: include raw and references
  return structured || {
    title: null,
    summary: null,
    bullets: [],
    cta: null,
    raw: { text: '', references: [] },
  };
}
