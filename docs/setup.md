# Project Setup

1. Copy the provided example environment file:
   ```bash
   cp .env.example .env
   ```
2. Fill in `.env` with the appropriate secrets for your environment.
3. Run the full-text search migration before enabling FTS retrieval:
   ```bash
   psql -f migrations/20250101_add_fts.sql
   ```
   After running the migration, set `RETRIEVAL_FTS_ENABLED=true` in `.env` if you want to use FTS.

The example file includes placeholders for search configuration and API keys. Replace these placeholders with your actual values before running the application.
