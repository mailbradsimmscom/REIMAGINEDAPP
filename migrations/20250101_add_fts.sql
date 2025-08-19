-- Enable full-text search for documents
ALTER TABLE documents
  ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) STORED;

CREATE INDEX documents_fts_idx ON documents USING gin (fts);

-- Enable full-text search for system_knowledge
ALTER TABLE system_knowledge
  ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) STORED;

CREATE INDEX system_knowledge_fts_idx ON system_knowledge USING gin (fts);
