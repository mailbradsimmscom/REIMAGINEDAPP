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
const feedbackEl = document.getElementById('feedback');
const thumbUpBtn = document.getElementById('thumbUp');

let lastQuestion = null;
let lastBoatId = null;
let lastStructured = null;

// Show server origin
if (serverEl) serverEl.textContent = window.location.origin;

// --- Minimal markdown renderer ---
// We *do not* change content meaning; we just convert simple markdown to HTML.
function inlineMD(s) {
  // bold **text**
  return String(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdownInto(node, md) {
  const text = String(md || '').trim();
  node.innerHTML = '';

  if (!text) return;

  // Split by blank lines into blocks
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const container = document.createElement('div');
  container.className = 'md';

  for (const block of blocks) {
    // Headings that are a single bold line
    if (/^\*\*[^*]+\*\*$/.test(block)) {
      const h = document.createElement('h3');
      h.innerHTML = inlineMD(block).replace(/^<strong>|<\/strong>$/g, '');
      container.appendChild(h);
      continue;
    }

    // Ordered list (lines starting with "N. ")
    if (/^(\d+\.\s+.+(\n)?)+$/m.test(block)) {
      const ol = document.createElement('ol');
      block.split('\n').forEach(line => {
        const m = line.match(/^(\d+)\.\s+(.*)$/);
        if (m) {
          const li = document.createElement('li');
          li.innerHTML = inlineMD(m[2]);
          ol.appendChild(li);
        }
      });
      container.appendChild(ol);
      continue;
    }

    // Bulleted list (lines starting with "• " or "- ")
    if (/^([•\-]\s+.+(\n)?)+$/m.test(block)) {
      const ul = document.createElement('ul');
      block.split('\n').forEach(line => {
        const m = line.match(/^[•\-]\s+(.*)$/);
        if (m) {
          const li = document.createElement('li');
          li.innerHTML = inlineMD(m[1]);
          ul.appendChild(li);
        }
      });
      container.appendChild(ul);
      continue;
    }

    // Fallback paragraph
    const p = document.createElement('p');
    p.innerHTML = inlineMD(block.replace(/\n/g, ' '));
    container.appendChild(p);
  }

  node.appendChild(container);
}

// --- Submit handler ---
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const question = (questionEl?.value || '').trim();
    if (!question) return;

    const boat_id = (boatEl?.value || '').trim() || null;
    const endpoint = apiModeEl?.checked ? '/bff/api/query' : '/bff/web/query';

    // UI: thinking state (do not clear the question)
    titleEl.textContent = '…thinking';
    summaryEl.textContent = '';
    rawEl.innerHTML = '';
    jsonEl.hidden = true;
    jsonEl.textContent = '';
    if (feedbackEl) feedbackEl.hidden = true;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, boat_id })
      });

      // If server returns non-200, surface a readable error
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const data = await res.json();

      titleEl.textContent = data.title || 'Answer';
      summaryEl.textContent = data.summary || '';

      const md = data?.raw?.text || data?._structured?.raw?.text || '';
      renderMarkdownInto(rawEl, md);

      lastQuestion = question;
      lastBoatId = boat_id;
      lastStructured = data?._structured || data || null;
      if (feedbackEl) feedbackEl.hidden = false;

      if (apiModeEl?.checked) {
        jsonEl.hidden = false;
        jsonEl.textContent = JSON.stringify(data, null, 2);
      }
    } catch (err) {
      console.error('[ask] error:', err);
      titleEl.textContent = 'Error';
      summaryEl.textContent = err?.message || String(err);
    }
  });
} else {
  console.warn('[ui] form #a not found. Check your index.html form id.');
}

if (thumbUpBtn) {
  thumbUpBtn.addEventListener('click', async () => {
    if (!lastQuestion || !lastStructured) return;
    const evidence_ids = Array.isArray(lastStructured?.raw?.references)
      ? lastStructured.raw.references.map(r => r.id).filter(Boolean)
      : [];
    try {
      await fetch('/qa/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: lastQuestion,
          boat_id: lastBoatId,
          thumb: 'up',
          structured: lastStructured,
          evidence_ids
        })
      });
    } catch (err) {
      console.error('[feedback] error:', err);
    }
  });
}
