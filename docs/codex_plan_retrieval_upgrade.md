# Codex Plan Retrieval Upgrade

## Flag Defaults
- `RETRIEVAL_ASSET_ENABLED` defaults to `true`.
- `RETRIEVAL_PLAYBOOK_ENABLED` defaults to `true`.
- `RETRIEVAL_VECTOR_ENABLED` defaults to `true`.
- `RETRIEVAL_WEB_ENABLED` defaults to `true`.
- `RETRIEVAL_TELEMETRY_ENABLED` defaults to `true`.
- `RETRIEVAL_FTS_ENABLED` defaults to `false` and is only used after the FTS migration runs.

## Migration Command
Run the full-text search migration before enabling FTS retrieval:

```bash
psql -f migrations/20250101_add_fts.sql
```
After running the migration, set `RETRIEVAL_FTS_ENABLED=true` in `.env` if you want to use FTS.

## Test Commands
Run the test suite to verify retrieval behavior:

```bash
npm test
# or target the golden retrieval tests directly
node --test tests/retrieval_golden.test.js
```

## Phased Rollout
1. Run the migration in a maintenance window.
2. Deploy with `RETRIEVAL_FTS_ENABLED=false` to confirm baseline behavior.
3. Enable `RETRIEVAL_FTS_ENABLED=true` in development and run tests.
4. Promote to staging with FTS enabled and monitor telemetry.
5. Gradually roll out to production, enabling retrieval flags as needed and monitoring results.
