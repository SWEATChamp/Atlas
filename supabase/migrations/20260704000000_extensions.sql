-- ============================================================
-- MIGRATION 000: Extensions
-- Enables PostgreSQL extensions required by Atlas.
--   uuid-ossp  → deterministic UUID generation for seed data
--   pgcrypto   → AES encryption for OAuth tokens at rest
--   pg_trgm    → trigram similarity for fuzzy subject/chapter search
--   unaccent   → accent-insensitive text search
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
