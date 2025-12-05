-- Management API Database Schema
-- SQLite database for storing projects, providers, and settings

-- =============================================================================
-- Projects Table
-- =============================================================================
-- Stores project metadata and links to Forgejo repos and Coolify containers
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Forgejo repository
  forgejo_repo_url TEXT NOT NULL,
  forgejo_repo_id INTEGER,
  forgejo_owner TEXT NOT NULL,
  
  -- Coolify container
  coolify_app_uuid TEXT NOT NULL,
  coolify_server_uuid TEXT NOT NULL,
  container_port INTEGER DEFAULT 4096,
  fqdn_url TEXT,  -- Public URL for the OpenCode container (e.g., https://opencode-myproject.superchotu.com)
  
  -- GitHub sync (optional)
  github_repo_url TEXT,
  github_sync_enabled INTEGER DEFAULT 0,
  github_sync_direction TEXT DEFAULT 'push', -- 'push', 'pull', 'bidirectional'
  last_sync_at TEXT,
  
  -- LLM configuration
  llm_provider TEXT,  -- NULL = use default provider
  
  -- Status
  status TEXT DEFAULT 'creating', -- 'creating', 'running', 'stopped', 'error'
  error_message TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Providers Table
-- =============================================================================
-- Stores LLM provider configurations
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,  -- 'openrouter', 'anthropic', 'openai', 'github-copilot', etc.
  name TEXT NOT NULL,
  type TEXT NOT NULL,   -- 'api_key', 'oauth'
  
  -- Credentials (encrypted in production)
  api_key TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TEXT,
  
  -- Configuration
  is_default INTEGER DEFAULT 0,
  is_configured INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Settings Table
-- =============================================================================
-- Key-value store for global settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_providers_is_default ON providers(is_default);

-- =============================================================================
-- Seed Data: Default Providers
-- =============================================================================
INSERT OR IGNORE INTO providers (id, name, type, is_configured, is_default) VALUES
  ('anthropic', 'Anthropic Claude', 'api_key', 0, 0),
  ('openai', 'OpenAI', 'api_key', 0, 0),
  ('openrouter', 'OpenRouter', 'api_key', 0, 0),
  ('github-copilot', 'GitHub Copilot', 'oauth', 0, 0),
  ('google', 'Google AI', 'api_key', 0, 0),
  ('amazon-bedrock', 'Amazon Bedrock', 'api_key', 0, 0);
