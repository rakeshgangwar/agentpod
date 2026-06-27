-- =============================================================================
-- PostgreSQL Extensions Initialization
-- =============================================================================
-- This script runs automatically when the PostgreSQL container starts
-- for the first time. It enables required extensions.
--
-- File naming: Scripts are executed in alphabetical order (01-, 02-, etc.)
-- =============================================================================

-- Enable pgvector extension for vector similarity search
-- Used by knowledge_documents table for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for fuzzy text search (optional, useful for search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
