const { OpenAI } = require('openai');

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

async function complete({ prompt, system }) {
  const client = createClient();
  if (!client) {
    // Mock result — keeps dev flow unblocked if no key is present
    return { text: `MOCK: ${prompt.slice(0, 120)}...` };
  }

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt }
    ],
    temperature: 0.3
  });

  const text = resp.choices?.[0]?.message?.content || '';
  return { text };
}

module.exports = { openaiAdapter: { complete } };
