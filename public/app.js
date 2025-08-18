// public/app.js

// Hook the IDs that are already in your HTML (no changes to HTML required)
const form = document.getElementById('a');            // <form id="a">
const questionEl = document.getElementById('question');
const boatEl = document.getElementById('boat');
const apiModeEl = document.getElementById('apiMode');

const titleEl = document.getElementById('answer-title');
const summaryEl = document.getElementById('answer-summary');
const rawEl = document.getElementById('answer-raw');
const jsonEl = document.getElementById('answer-json');
const serverEl = document.getElementById('server');

// Show server origin
if (serverEl) serverEl.textContent = window.location.origin;

// Helper: POST JSON
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${t}`);
  }
  return res.json();
}

// Submit handler
if (form && questionEl) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const question = (questionEl.value || '').trim();
    const boat_id = (boatEl?.value || '').trim() || null;
    const useApi = !!apiModeEl?.checked;

    // Clear UI
    titleEl.textContent = '';
    summaryEl.textContent = '';
    rawEl.textContent = '';
    jsonEl.hidden = true;
    jsonEl.textContent = '';

    if (!question) {
      rawEl.textContent = 'Please enter a question.';
      return;
    }

    try {
      const endpoint = useApi ? '/bff/api/query' : '/bff/web/query';

      const payload = {
        question,
        boat_id: boat_id || undefined,
      };

      const data = await postJSON(endpoint, payload);

      // We intentionally do NOT add any extra UI sections.
      // Render only the model’s raw text as returned by the server.
      const rawText = data?.raw?.text || '';
      rawEl.textContent = rawText;

      if (useApi) {
        jsonEl.hidden = false;
        jsonEl.textContent = JSON.stringify(data, null, 2);
      }
    } catch (err) {
      console.error('[ask] error:', err);
      rawEl.textContent = err?.message || String(err);
    }
  });
} else {
  console.warn('[ui] form #a not found. Check your index.html form id.');
}
