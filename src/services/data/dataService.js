const { supabaseAdapter } = require('./supabaseAdapter');

async function health() { return supabaseAdapter.health(); }
async function listDocuments(opts) { return supabaseAdapter.listDocuments(opts); }
async function listTopics() { return supabaseAdapter.listTopics(); }
async function saveFeedback(body) { return supabaseAdapter.saveFeedback(body); }
async function adminSummary() { return supabaseAdapter.adminSummary(); }

module.exports = { dataService: { health, listDocuments, listTopics, saveFeedback, adminSummary } };
