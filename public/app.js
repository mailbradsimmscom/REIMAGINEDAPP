// public/app.js

window.addEventListener('DOMContentLoaded', () => {
  // Find the form robustly
  let form = document.getElementById('ask-form')
          || document.querySelector('form')
          || (document.getElementById('question') && document.getElementById('question').closest('form'));

  const questionEl = document.getElementById('question');
  const boatEl     = document.getElementById('boat');
  const apiModeEl  = document.getElementById('apiMode');

  const titleEl    = document.getElementById('answer-title');
  const summaryEl  = document.getElementById('answer-summary');
  const rawEl      = document.getElementById('answer-raw');
  const jsonEl     = document.getElementById('answer-json');
  const serverEl   = document.getElementById('server');

  if (serverEl) {
    try { serverEl.textContent = window.location.origin; } catch (_) {}
  }

  if (!form) {
    console.warn('[ui] No form found. Available forms:', Array.from(document.forms).map(f => f.id || '(no id)'));
    return;
  }
  if (!(questionEl && boatEl && apiModeEl && titleEl && summaryEl && rawEl && jsonEl)) {
    console.warn('[ui] Missing expected elements');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const question = (questionEl.value || '').trim();
    if (!question) return;

    const boat_id = (boatEl.value || '').trim() || null;
    const endpoint = apiModeEl.checked ? '/bff/api/query' : '/bff/web/query';

    // Reset output
    titleEl.textContent = '…thinking';
    summaryEl.textContent = '';
    rawEl.innerHTML = '';
    jsonEl.hidden = true;
    jsonEl.textContent = '';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⬇️ No "tone" anymore — just question + optional boat
        body: JSON.stringify({ question, boat_id })
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }

      const data = await res.json();

      titleEl.textContent = data.title || 'Answer';
      summaryEl.textContent = data.summary || '';

      const md = (data.raw && data.raw.text) ? String(data.raw.text) : '';
      renderMarkdownInto(rawEl, md);

      if (apiModeEl.checked) {
        jsonEl.hidden = false;
        jsonEl.textContent = JSON.stringify(data, null, 2);
      }
    } catch (err) {
      titleEl.textContent = 'Error';
      summaryEl.textContent = err?.message || String(err);
    }
  });
});

// Minimal Markdown-ish rendering
function renderMarkdownInto(node, md) {
  const blocks = String(md)
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);

  const container = document.createElement('div');
  container.className = 'md';

  for (const b of blocks) {
    // **Heading**
    if (/^\*\*.+\*\*$/.test(b)) {
      const h = document.createElement('h3');
      h.textContent = b.replace(/^\*\*(.+)\*\*$/, '$1');
      container.appendChild(h);
      continue;
    }
    // 1. Numbered list
    if (/^(\d+\.\s+.+(\n)?)+$/m.test(b)) {
      const ol = document.createElement('ol');
      b.split('\n').forEach(line => {
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
    // • Bulleted list
    if (/^(•\s+.+(\n)?)+$/m.test(b)) {
      const ul = document.createElement('ul');
      b.split('\n').forEach(line => {
        const t = line.replace(/^•\s+/, '').trim();
        if (t) {
          const li = document.createElement('li');
          li.innerHTML = inlineMD(t);
          ul.appendChild(li);
        }
      });
      container.appendChild(ul);
      continue;
    }
    // Paragraph
    const p = document.createElement('p');
    p.innerHTML = inlineMD(b.replace(/\n/g, ' '));
    container.appendChild(p);
  }

  // Collapsible for long content
  node.innerHTML = '';
  if (container.textContent.length > 2000) {
    const clip = document.createElement('div');
    clip.className = 'clip';
    clip.appendChild(container);

    const btn = document.createElement('button');
    btn.className = 'more';
    btn.textContent = 'Show more';
    btn.onclick = () => {
      clip.classList.toggle('open');
      btn.textContent = clip.classList.contains('open') ? 'Show less' : 'Show more';
    };

    node.appendChild(clip);
    node.appendChild(btn);
  } else {
    node.appendChild(container);
  }
}

function inlineMD(s) {
  return String(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
