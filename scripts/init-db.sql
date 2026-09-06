-- Enable required Postgres extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- pgvector for AI embeddings (requires pgvector image or manual install)
-- CREATE EXTENSION IF NOT EXISTS vector;
