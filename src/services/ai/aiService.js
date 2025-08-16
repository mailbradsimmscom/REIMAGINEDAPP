const { openaiAdapter } = require('./openaiAdapter');
const { buildSystemPrompt } = require('../../config/prompt');

async function answerQuestion(question, contextList = [], { metadata } = {}) {
  const contextBlock = contextList
    .map((c, i) => `# Context ${i + 1}\n${c.text || c.content || ''}`)
    .join('\n\n');

  const system = buildSystemPrompt();

  const prompt = [
    contextBlock ? `Use this context when helpful:\n${contextBlock}\n` : '',
    `User question: ${question}\n`,
    metadata ? `Metadata: ${JSON.stringify(metadata).slice(0, 800)}\n` : '',
    'Respond following the Response Style Policy exactly.'
  ].join('\n');

  const out = await openaiAdapter.complete({ prompt, system });
  // Return the raw text so the legacy layout comes through untouched
  return {
    text: out.text,
    references: contextList.map(c => c.source).filter(Boolean)
  };
}

module.exports = { aiService: { answerQuestion } };
