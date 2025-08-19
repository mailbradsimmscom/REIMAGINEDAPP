import 'dotenv/config';

function req(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing required env: ${name}`);
  return v.trim();
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
  PINECONE_INDEX: req('PINECONE_INDEX'),
  PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE?.trim() ?? 'boat-dev',
  WORLD_NAMESPACE: process.env.WORLD_NAMESPACE?.trim() ?? 'world',
  SUPABASE_URL: req('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: req('SUPABASE_SERVICE_ROLE_KEY'),
  OPENAI_API_KEY: req('OPENAI_API_KEY'),
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-large',
  CHUNK_MAX_CHARS: Number(process.env.CHUNK_MAX_CHARS || 3500),
  CHUNK_OVERLAP: Number(process.env.CHUNK_OVERLAP || 200),

  // Retrieval feature flags
  RETRIEVAL_SQL_ENABLED: bool('RETRIEVAL_SQL_ENABLED', true),
  RETRIEVAL_VECTOR_ENABLED: bool('RETRIEVAL_VECTOR_ENABLED', true),
  RETRIEVAL_WORLD_ENABLED: bool('RETRIEVAL_WORLD_ENABLED', true),
  RETRIEVAL_TELEMETRY_ENABLED: bool('RETRIEVAL_TELEMETRY_ENABLED', true)
};

// Hard safety: never write to world
if (ENV.PINECONE_NAMESPACE === ENV.WORLD_NAMESPACE || ENV.PINECONE_NAMESPACE === 'world') {
  throw new Error(`Unsafe namespace: PINECONE_NAMESPACE cannot equal 'world' (${ENV.PINECONE_NAMESPACE}).`);
}
