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
  llm_provider TEXT,  -- Provider ID: 'zai', 'anthropic', etc. NULL = use default
  llm_model TEXT,     -- Model ID: 'glm-4.6', 'claude-3-5-sonnet', etc.
  
  -- Status
  status TEXT DEFAULT 'creating', -- 'creating', 'running', 'stopped', 'error'
  error_message TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Provider Credentials Table
-- =============================================================================
-- Stores encrypted LLM provider credentials (global, shared across all projects)
-- Credentials are encrypted using AES-256-GCM before storage
CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  provider_id TEXT NOT NULL UNIQUE,  -- 'anthropic', 'openai', 'github-copilot', etc.
  auth_type TEXT NOT NULL CHECK(auth_type IN ('api_key', 'oauth', 'device_flow')),
  
  -- All credential fields are encrypted before storage
  -- API Key authentication
  api_key_encrypted TEXT,
  
  -- OAuth/Device Flow authentication
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TEXT,
  
  -- OAuth metadata
  oauth_provider TEXT,  -- 'github', 'opencode-zen', etc.
  oauth_scopes TEXT,    -- JSON array of granted scopes
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- OAuth State Table
-- =============================================================================
-- Temporary storage for OAuth device flow state (pending authorizations)
CREATE TABLE IF NOT EXISTS oauth_state (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  device_code TEXT NOT NULL,
  user_code TEXT NOT NULL,
  verification_uri TEXT NOT NULL,
  interval_seconds INTEGER DEFAULT 5,
  expires_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired', 'error')),
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Providers Table (Legacy - kept for backwards compatibility, will be deprecated)
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
-- User OpenCode Config Table
-- =============================================================================
-- Stores user's global OpenCode settings (opencode.json content)
-- Applied via OPENCODE_CONFIG environment variable
CREATE TABLE IF NOT EXISTS user_opencode_config (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL UNIQUE,
  
  -- opencode.json content (Layer 3)
  -- Stored as JSON string
  settings TEXT NOT NULL DEFAULT '{}',
  
  -- AGENTS.md content (optional global instructions)
  agents_md TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- User OpenCode Files Table
-- =============================================================================
-- Stores user's global agents, commands, tools, and plugins
-- Applied via OPENCODE_CONFIG_DIR environment variable
CREATE TABLE IF NOT EXISTS user_opencode_files (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  
  -- File type: 'agent', 'command', 'tool', 'plugin'
  type TEXT NOT NULL CHECK(type IN ('agent', 'command', 'tool', 'plugin')),
  
  -- Filename without extension (e.g., 'reviewer', 'deploy')
  name TEXT NOT NULL,
  
  -- File extension: 'md' for agents/commands, 'ts' or 'js' for tools/plugins
  extension TEXT NOT NULL CHECK(extension IN ('md', 'ts', 'js')),
  
  -- File content
  content TEXT NOT NULL,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  -- Unique constraint: one file per type/name per user
  UNIQUE(user_id, type, name)
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_providers_is_default ON providers(is_default);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_provider_id ON provider_credentials(provider_id);
CREATE INDEX IF NOT EXISTS idx_oauth_state_provider_id ON oauth_state(provider_id);
CREATE INDEX IF NOT EXISTS idx_oauth_state_status ON oauth_state(status);
CREATE INDEX IF NOT EXISTS idx_user_opencode_config_user_id ON user_opencode_config(user_id);
CREATE INDEX IF NOT EXISTS idx_user_opencode_files_user_id ON user_opencode_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_opencode_files_type ON user_opencode_files(user_id, type);

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
