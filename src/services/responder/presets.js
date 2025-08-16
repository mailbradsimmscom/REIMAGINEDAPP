// src/services/responder/presets.js
// Tone presets: concise, coach, hands_on
export const TONES = {
  concise: {
    name: 'concise',
    style: 'Direct, minimal, sentence-case. Avoid filler. Short summary + tight bullets.',
    bulletsMax: 5,
    includeCta: false,
  },
  coach: {
    name: 'coach',
    style: 'Supportive, step-wise. Explain why and how. Gentle, encouraging tone.',
    bulletsMax: 7,
    includeCta: true,
  },
  hands_on: {
    name: 'hands_on',
    style: 'Procedural, checklists, tools/materials up front. Imperative voice.',
    bulletsMax: 9,
    includeCta: true,
  },
};

// Pick tone by name; fallback to 'concise'
export function pickTone(name) {
  const key = String(name || '').toLowerCase().replace('-', '_');
  return TONES[key] || TONES.concise;
}
