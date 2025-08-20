// src/config/env.js
import 'dotenv/config';

function req(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

// NEW: soft reader (no throw) for optional vars
function opt(name, def = null) {
  const v = process.env[name];
  return (v === undefined || v === null) ? def : String(v).trim();
}

function bool(name, def = true) {
  const v = process.env[name];
  if (v === undefined || v === null) return def;
  const val = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(val)) return true;
  if (["0", "false", "no", "off"].includes(val)) return false;
  return def;
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),

  // Required (keep your current guarantees)
  PINECONE_INDEX: req('PINECONE_INDEX'),
  OPENAI_API_KEY: req('OPENAI_API_KEY'),

  // Namespaces
  PINECONE_NAMESPACE: opt('PINECONE_NAMESPACE', 'boat-dev'),
  WORLD_NAMESPACE: opt('WORLD_NAMESPACE', 'world'),

  // Supabase is OPTIONAL for local/dev; FTS path will auto-fallback if missing
  SUPABASE_URL: opt('SUPABASE_URL', null),
  SUPABASE_SERVICE_ROLE_KEY: opt('SUPABASE_SERVICE_ROLE_KEY', null),

  // Embedding/config
  EMBEDDING_MODEL: opt('EMBEDDING_MODEL', 'text-embedding-3-large'),
  CHUNK_MAX_CHARS: Number(opt('CHUNK_MAX_CHARS', 3500)),
  CHUNK_OVERLAP: Number(opt('CHUNK_OVERLAP', 200)),

  // Retrieval feature flags (kept) 
  RETRIEVAL_ASSET_ENABLED: bool('RETRIEVAL_ASSET_ENABLED', true),
  RETRIEVAL_PLAYBOOK_ENABLED: bool('RETRIEVAL_PLAYBOOK_ENABLED', true),
  RETRIEVAL_VECTOR_ENABLED: bool('RETRIEVAL_VECTOR_ENABLED', true),
  RETRIEVAL_WEB_ENABLED: bool('RETRIEVAL_WEB_ENABLED', true),
  RETRIEVAL_TELEMETRY_ENABLED: bool('RETRIEVAL_TELEMETRY_ENABLED', true),

  // NEW flags
  RETRIEVAL_FTS_ENABLED: bool('RETRIEVAL_FTS_ENABLED', false),
  RETRIEVAL_PLAYBOOKS_MV_ENABLED: bool('RETRIEVAL_PLAYBOOKS_MV_ENABLED', false)
};

// Informative warnings (no crashes)
if ((!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) && ENV.RETRIEVAL_FTS_ENABLED) {
  console.warn('[env] RETRIEVAL_FTS_ENABLED=true but Supabase credentials are missing; FTS/RPC will fall back.');
}

// Hard safety: never write to world
if (ENV.PINECONE_NAMESPACE === ENV.WORLD_NAMESPACE || ENV.PINECONE_NAMESPACE === 'world') {
  throw new Error(`Unsafe namespace: PINECONE_NAMESPACE cannot equal 'world' (${ENV.PINECONE_NAMESPACE}).`);
}
