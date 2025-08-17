// public/app.js
const form = document.getElementById('ask-form');
const questionEl = document.getElementById('question');
const toneEl = document.getElementById('tone');
const boatEl = document.getElementById('boat');
const apiModeEl = document.getElementById('apiMode');

const titleEl = document.getElementById('answer-title');
const summaryEl = document.getElementById('answer-summary');
const rawEl = document.getElementById('answer-raw');
const jsonEl = document.getElementById('answer-json');
const serverEl = document.getElementById('server');

serverEl.textContent = window.location.origin;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = questionEl.value.trim();
  if (!question) return;

  const tone = toneEl.value;
  const boat_id = boatEl.value.trim() || null;
  const endpoint = apiModeEl.checked ? '/bff/api/query' : '/bff/web/query';

  titleEl.textContent = '…thinking';
  summaryEl.textContent = '';
  rawEl.innerHTML = '';
  jsonEl.hidden = true;
  jsonEl.textContent = '';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, tone, boat_id })
    });
    const data = await res.json();

    titleEl.textContent = data.title || 'Answer';
    summaryEl.textContent = data.summary || '';

    const md = (data.raw && data.raw.text) || '';
    renderMarkdownInto(rawEl, md);

    if (apiModeEl.checked) {
      jsonEl.hidden = false;
      jsonEl.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    titleEl.textContent = 'Error';
    summaryEl.textContent = err.message || String(err);
  }
});

// Minimal MD → HTML with lists, headings, bold, and paragraphs
function renderMarkdownInto(node, md) {
  const blocks = md.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const container = document.createElement('div');
  container.className = 'md';

  for (const b of blocks) {
    if (/^\*\*.+\*\*$/.test(b)) {
      const h = document.createElement('h3');
      h.textContent = b.replace(/^\*\*(.+)\*\*$/, '$1');
      container.appendChild(h);
      continue;
    }
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
    const p = document.createElement('p');
    p.innerHTML = inlineMD(b.replace(/\n/g, ' '));
    container.appendChild(p);
  }

  // Collapsible for very long content
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
  // bold
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return s;
}
