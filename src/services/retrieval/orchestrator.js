// src/services/retrieval/orchestrator.js
// Coordinate asset and playbook retrieval for a question.

import { tokensFromQuestion, orQuery } from './query/normalize.js';
import { AssetSource } from './sources/AssetSource.js';
import { PlaybookSource } from './sources/PlaybookSource.js';
import { buildContextMix } from './mixerService.js';

/**
 * Run asset and playbook searches then build a context block.
 * Falls back to buildContextMix when both searches return nothing.
 *
 * @param {string} question
 * @param {object} [opts]
 * @param {number} [opts.limit=3]
 * @returns {Promise<object>} retrieval result object
 */
export async function runRetrieval(question = '', { limit = 3 } = {}) {
  const tokens = tokensFromQuestion(question);
  const fts = orQuery(tokens);
  const meta = {
    mode: 'direct',
    tokens,
    asset_rows: 0,
    playbook_rows: 0,
    asset_selected: 0,
    playbook_selected: 0
  };

  if (!fts) {
    const legacy = await buildContextMix({ question });
    legacy.meta = { ...(legacy.meta || {}), mode: 'legacy-fallback' };
    return legacy;
  }

  const [assetsRaw, playbooksRaw] = await Promise.all([
    AssetSource(fts, { limit }),
    PlaybookSource(fts, { limit })
  ]);

  meta.asset_rows = assetsRaw.length;
  meta.playbook_rows = playbooksRaw.length;

  if (!assetsRaw.length && !playbooksRaw.length) {
    const legacy = await buildContextMix({ question });
    legacy.meta = { ...(legacy.meta || {}), mode: 'legacy-fallback' };
    return legacy;
  }

  const assets = assetsRaw
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);

  const playbooks = playbooksRaw
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);

  meta.asset_selected = assets.length;
  meta.playbook_selected = playbooks.length;

  const references = [
    ...assets.map(a => ({ id: a.id, source: a.source || 'asset', score: a.score })),
    ...playbooks.map(p => ({ id: p.id, source: p.source || 'playbook', score: p.score }))
  ];

  const contextParts = [];
  for (const a of assets) {
    const txt = [a.manufacturer, a.model, a.description].filter(Boolean).join(' ');
    if (txt) contextParts.push(txt);
  }
  for (const p of playbooks) {
    const txt = [p.title, p.summary].filter(Boolean).join(' - ');
    if (txt) contextParts.push(txt);
  }

  const contextText = contextParts.join('\n\n');

  return { contextText, references, assets, playbooks, webSnippets: [], meta };
}

export { runRetrieval as retrievalOrchestrator };
export default runRetrieval;

