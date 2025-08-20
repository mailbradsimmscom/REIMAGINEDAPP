import 'dotenv/config';
console.log('URL =', process.env.SUPABASE_URL || null);
console.log('SRK_LEN =', (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length);
console.log('FTS =', process.env.RETRIEVAL_FTS_ENABLED || null);
console.log('ASSET =', process.env.RETRIEVAL_ASSET_ENABLED || null);
console.log('PLAYBOOK =', process.env.RETRIEVAL_PLAYBOOK_ENABLED || null);
console.log('WEB =', process.env.RETRIEVAL_WEB_ENABLED || null);
console.log('TELEMETRY =', process.env.RETRIEVAL_TELEMETRY_ENABLED || null);
