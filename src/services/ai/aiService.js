const { openaiAdapter } = require('./openaiAdapter');

async function answerQuestion(question, contextList = [], { metadata } = {}) {
  const contextBlock = contextList
    .map((c, i) => `# Context ${i + 1}\n${c.text || c.content || ''}`)
    .join('\n\n');

  const system = [
    'You are a precise, helpful assistant.',
    'Respond concisely, using active voice.',
    'Do not invent facts; if unsure, say so briefly.'
  ].join(' ');

  const prompt = [
    contextBlock ? `Use this context:\n${contextBlock}\n` : '',
    `Question: ${question}\n`,
    metadata ? `Metadata: ${JSON.stringify(metadata).slice(0, 500)}\n` : '',
    'Answer clearly and directly.'
  ].join('\n');

  const out = await openaiAdapter.complete({ prompt, system });
  return {
    text: out.text,
    references: contextList.map(c => c.source).filter(Boolean)
  };
}

module.exports = { aiService: { answerQuestion } };
