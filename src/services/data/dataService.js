const { supabaseAdapter } = require('./supabaseAdapter');

async function logInteraction({ question, answer, meta }) {
  try {
    return await supabaseAdapter.upsertInteraction({ question, answer, meta });
  } catch (e) {
    console.warn('[dataService] logInteraction failed:', e.message);
    return null;
  }
}

module.exports = { dataService: { logInteraction } };
