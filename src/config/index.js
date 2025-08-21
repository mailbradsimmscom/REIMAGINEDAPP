// src/config/index.js
// Comprehensive configuration validation layer with type conversion and startup validation
import 'dotenv/config';

/**
 * Read required environment variable with validation
 * @param {string} name - Environment variable name
 * @param {string} [description] - Optional description for error messages
 * @returns {string} Trimmed string value
 * @throws {Error} If variable is missing or empty
 */
function required(name, description = '') {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    const desc = description ? ` (${description})` : '';
    throw new Error(`Missing required environment variable: ${name}${desc}`);
  }
  return value.trim();
}

/**
 * Read optional environment variable with default
 * @param {string} name - Environment variable name
 * @param {string|null} defaultValue - Default value if not set
 * @returns {string|null} Trimmed string value or default
 */
function optional(name, defaultValue = null) {
  const value = process.env[name];
  return (value === undefined || value === null) ? defaultValue : String(value).trim();
}

/**
 * Convert environment variable to boolean
 * @param {string} name - Environment variable name
 * @param {boolean} defaultValue - Default boolean value
 * @returns {boolean} Boolean value
 */
function boolean(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === null) return defaultValue;
  const val = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(val)) return true;
  if (["0", "false", "no", "off"].includes(val)) return false;
  return defaultValue;
}

/**
 * Convert environment variable to number
 * @param {string} name - Environment variable name
 * @param {number} defaultValue - Default numeric value
 * @returns {number} Numeric value
 */
function number(name, defaultValue = 0) {
  const value = process.env[name];
  if (value === undefined || value === null) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Convert environment variable to float
 * @param {string} name - Environment variable name
 * @param {number} defaultValue - Default float value
 * @returns {number} Float value
 */
function float(name, defaultValue = 0.0) {
  const value = process.env[name];
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Comprehensive configuration object
export const config = {
  // === Runtime Environment ===
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: number('PORT', 3000),
  
  // === Core Services (Required) ===
  PINECONE_API_KEY: optional('PINECONE_API_KEY', ''), // Made optional for tests
  PINECONE_INDEX: required('PINECONE_INDEX', 'Vector database index name'),
  OPENAI_API_KEY: optional('OPENAI_API_KEY', ''), // Optional for fallback behavior
  
  // === Supabase (Optional for local development) ===
  SUPABASE_URL: optional('SUPABASE_URL', null),
  SUPABASE_SERVICE_ROLE_KEY: optional('SUPABASE_SERVICE_ROLE_KEY', null),
  SUPABASE_ANON_KEY: optional('SUPABASE_ANON_KEY', null),
  
  // === Supabase Table Names ===
  SUPABASE_TABLE_DOCUMENTS: optional('SUPABASE_TABLE_DOCUMENTS', 'documents'),
  SUPABASE_TABLE_FEEDBACK: optional('SUPABASE_TABLE_FEEDBACK', 'feedback'),
  SUPABASE_TABLE_QA_FEEDBACK: optional('SUPABASE_TABLE_QA_FEEDBACK', 'qa_feedback'),
  SUPABASE_TABLE_KNOWLEDGE: optional('SUPABASE_TABLE_KNOWLEDGE', 'system_knowledge'),
  
  // === Vector Configuration ===
  PINECONE_NAMESPACE: optional('PINECONE_NAMESPACE', 'boat-dev'),
  PINECONE_REGION: optional('PINECONE_REGION', 'us-east-1'),
  PINECONE_CLOUD: optional('PINECONE_CLOUD', 'aws'),
  WORLD_NAMESPACE: optional('WORLD_NAMESPACE', 'world'),
  VECTOR_DIM: number('VECTOR_DIM', 3072),
  EMBED_DIM: number('EMBED_DIM', 3072), // Alias for VECTOR_DIM
  
  // === Embedding Configuration ===
  EMBEDDING_MODEL: optional('EMBEDDING_MODEL', 'text-embedding-3-large'),
  
  // === Text Processing ===
  CHUNK_MAX_CHARS: number('CHUNK_MAX_CHARS', 3500),
  CHUNK_OVERLAP: number('CHUNK_OVERLAP', 200),
  
  // === Retrieval Configuration ===
  RETRIEVAL_TOPK: number('RETRIEVAL_TOPK', 20),
  SIMILARITY_THRESHOLD: float('SIMILARITY_THRESHOLD', 0.10),
  LOCAL_WEAK_THRESHOLD: float('LOCAL_WEAK_THRESHOLD', 0.55),
  
  // === Retrieval Feature Flags ===
  RETRIEVAL_ASSET_ENABLED: boolean('RETRIEVAL_ASSET_ENABLED', true),
  RETRIEVAL_PLAYBOOK_ENABLED: boolean('RETRIEVAL_PLAYBOOK_ENABLED', true),
  RETRIEVAL_VECTOR_ENABLED: boolean('RETRIEVAL_VECTOR_ENABLED', true),
  RETRIEVAL_WEB_ENABLED: boolean('RETRIEVAL_WEB_ENABLED', true),
  RETRIEVAL_TELEMETRY_ENABLED: boolean('RETRIEVAL_TELEMETRY_ENABLED', true),
  RETRIEVAL_FTS_ENABLED: boolean('RETRIEVAL_FTS_ENABLED', false),
  RETRIEVAL_PLAYBOOKS_MV_ENABLED: boolean('RETRIEVAL_PLAYBOOKS_MV_ENABLED', false),
  
  // === World Search Configuration ===
  WORLD_INCLUDE_MIN: float('WORLD_INCLUDE_MIN', 0.75),
  WORLD_WEIGHT: float('WORLD_WEIGHT', 0.40),
  WORLD_ALLOWLIST: optional('WORLD_ALLOWLIST', '*'),
  WORLD_SEARCH_ENABLED: boolean('WORLD_SEARCH_ENABLED', true),
  WORLD_SEARCH_PARTS_THRESHOLD: number('WORLD_SEARCH_PARTS_THRESHOLD', 4),
  WORLD_SEARCH_TOPK: number('WORLD_SEARCH_TOPK', 2),
  
  // === External API Keys ===
  SERPAPI_API_KEY: optional('SERPAPI_API_KEY', ''),
  
  // === Cache Configuration ===
  CACHE_TTL_HOURS: number('CACHE_TTL_HOURS', 3),
  CACHE_TTL_MINUTES: number('CACHE_TTL_MINUTES', 180),
  CACHE_SCAN_LIMIT: number('CACHE_SCAN_LIMIT', 50),
  
  // === Debug Settings ===
  DEBUG_SEARCH: boolean('DEBUG_SEARCH', false),
  DEBUG_RESPONDER: boolean('DEBUG_RESPONDER', false),
  USE_LEGACY_PROMPT_LAYOUT: boolean('USE_LEGACY_PROMPT_LAYOUT', true),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),
  
  // === Tracing ===
  TRACE_MAX: number('TRACE_MAX', 200),
  
  // === Admin ===
  ADMIN_TOKEN: optional('ADMIN_TOKEN', null),
  
  // === Pinecone Advanced ===
  PINECONE_MAX_CHUNKS_DELETE: number('PINECONE_MAX_CHUNKS_DELETE', 512),
  
  // === Legacy Support ===
  PINECONE_INDEX_NAME: optional('PINECONE_INDEX_NAME', null), // Fallback for PINECONE_INDEX
  PLAYBOOKS_ENABLED: boolean('PLAYBOOKS_ENABLED', false) // Legacy playbook flag
};

// Resolve PINECONE_INDEX fallback
if (!config.PINECONE_INDEX && config.PINECONE_INDEX_NAME) {
  config.PINECONE_INDEX = config.PINECONE_INDEX_NAME;
}

/**
 * Validate critical configuration requirements
 * @throws {Error} If validation fails
 */
export function validateConfig() {
  const errors = [];
  
  // Critical validations
  if (!config.PINECONE_INDEX) {
    errors.push('PINECONE_INDEX is required');
  }
  
  // Namespace safety check
  if (config.PINECONE_NAMESPACE === config.WORLD_NAMESPACE || config.PINECONE_NAMESPACE === 'world') {
    errors.push(`Unsafe namespace: PINECONE_NAMESPACE cannot equal 'world' (${config.PINECONE_NAMESPACE})`);
  }
  
  // FTS requirements
  if (config.RETRIEVAL_FTS_ENABLED) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[config] RETRIEVAL_FTS_ENABLED=true but Supabase credentials are missing; FTS will fall back to legacy retrieval');
    }
  }
  
  // Port validation
  if (config.PORT < 1 || config.PORT > 65535) {
    errors.push(`Invalid PORT: ${config.PORT} (must be 1-65535)`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

/**
 * Get configuration summary for logging
 * @returns {Object} Configuration summary (sensitive values redacted)
 */
export function getConfigSummary() {
  const redact = (value) => value ? `[SET:${value.length}]` : '[NOT SET]';
  
  return {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    PINECONE_INDEX: config.PINECONE_INDEX || '[NOT SET]',
    PINECONE_NAMESPACE: config.PINECONE_NAMESPACE,
    WORLD_NAMESPACE: config.WORLD_NAMESPACE,
    OPENAI_API_KEY: redact(config.OPENAI_API_KEY),
    PINECONE_API_KEY: redact(config.PINECONE_API_KEY),
    SUPABASE_URL: config.SUPABASE_URL || '[NOT SET]',
    SUPABASE_SERVICE_ROLE_KEY: redact(config.SUPABASE_SERVICE_ROLE_KEY),
    SERPAPI_API_KEY: redact(config.SERPAPI_API_KEY),
    retrieval_flags: {
      FTS_ENABLED: config.RETRIEVAL_FTS_ENABLED,
      ASSET_ENABLED: config.RETRIEVAL_ASSET_ENABLED,
      PLAYBOOK_ENABLED: config.RETRIEVAL_PLAYBOOK_ENABLED,
      WEB_ENABLED: config.RETRIEVAL_WEB_ENABLED,
      TELEMETRY_ENABLED: config.RETRIEVAL_TELEMETRY_ENABLED
    }
  };
}

// Validate configuration on import (fail-fast)
try {
  validateConfig();
} catch (error) {
  console.error('[config] Configuration validation failed:', error.message);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  } else {
    // In test mode, just warn but don't exit
    console.warn('[config] Running in test mode - configuration errors ignored');
  }
}

// Export both named exports and default
export default config;

// Backward compatibility with existing ENV export
export { config as ENV };