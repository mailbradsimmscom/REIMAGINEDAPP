import { supabaseAdapter } from './supabaseAdapter.js';

async function health() { return supabaseAdapter.health(); }
async function listDocuments(opts) { return supabaseAdapter.listDocuments(opts); }
async function listTopics() { return supabaseAdapter.listTopics(); }
async function saveFeedback(body) { return supabaseAdapter.saveFeedback(body); }
async function adminSummary() { return supabaseAdapter.adminSummary(); }

export const dataService = { health, listDocuments, listTopics, saveFeedback, adminSummary };

export default { dataService };
