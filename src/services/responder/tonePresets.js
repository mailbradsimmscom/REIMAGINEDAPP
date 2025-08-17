// src/services/responder/tonePresets.js
// Central place for tone/voice shaping used by composeResponse.
// Safe defaults mirror your “skipper—practical, stepwise, safety-first” voice.

export const TONES = {
  skipper: {
    name: 'Practical Skipper',
    style: {
      bulletsPrefix: '• ',
      includeTools: true,
      includeSteps: true,
      includeSafety: true,
      concise: true,
    },
    headings: {
      nutshell: 'In a nutshell',
      tools: 'Tools & Materials',
      steps: 'Step-by-step',
      safety: '⚠️ Safety',
      specs: 'Specs & Notes',
      aftercare: 'Dispose / Aftercare',
      next: 'What’s next',
      refs: 'References'
    }
  },
  coach: {
    name: 'Supportive Coach',
    style: {
      bulletsPrefix: '• ',
      includeTools: false,
      includeSteps: true,
      includeSafety: true,
      concise: true,
      warmer: true
    },
    headings: {
      nutshell: 'TL;DR',
      steps: 'Try this',
      safety: 'Heads-up',
      next: 'Next best step',
      refs: 'References'
    }
  },
  tech: {
    name: 'Technical',
    style: {
      bulletsPrefix: '– ',
      includeTools: true,
      includeSteps: true,
      includeSafety: true,
      concise: false
    },
    headings: {
      nutshell: 'Summary',
      tools: 'Required',
      steps: 'Procedure',
      safety: 'Safety',
      specs: 'Specifications',
      refs: 'References'
    }
  },
  brief: {
    name: 'Brief',
    style: {
      bulletsPrefix: '• ',
      includeTools: false,
      includeSteps: false,
      includeSafety: true,
      concise: true
    },
    headings: {
      nutshell: 'Summary',
      safety: 'Safety',
      refs: 'References'
    }
  }
};

export function selectTone(toneKey) {
  if (!toneKey) return TONES.skipper;
  const key = String(toneKey).toLowerCase();
  return TONES[key] || TONES.skipper;
}

