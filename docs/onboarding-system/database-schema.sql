-- ============================================================================
-- Onboarding System Database Schema
-- ============================================================================
-- This schema extends the existing AgentPod database with tables for:
-- 1. Knowledge base documents (templates, patterns, guides)
-- 2. Onboarding session tracking
-- 3. Vector embeddings for semantic search (via sqlite-vec)
-- ============================================================================

-- ============================================================================
-- Table: knowledge_documents
-- ============================================================================
-- Stores all knowledge base content including project templates, agent patterns,
-- command templates, tool templates, and best practices.

CREATE TABLE IF NOT EXISTS knowledge_documents (
  -- Primary identifier
  id TEXT PRIMARY KEY,
  
  -- Document categorization
  category TEXT NOT NULL CHECK(category IN (
    'project_template',    -- Full project setup templates
    'agent_pattern',       -- Reusable agent definitions (.opencode/agent/*.md)
    'command_template',    -- Reusable command definitions (.opencode/command/*.md)
    'tool_template',       -- Reusable tool definitions (.opencode/tool/*.ts)
    'plugin_template',     -- Reusable plugin definitions (.opencode/plugin/*.ts)
    'mcp_template',        -- MCP server configurations
    'workflow_pattern',    -- Multi-step workflow guides
    'best_practice',       -- General guidance and documentation
    'provider_guide'       -- Provider setup instructions
  )),
  
  -- Document metadata
  title TEXT NOT NULL,
  description TEXT,
  
  -- Main content (Markdown, JSON, or TypeScript depending on category)
  content TEXT NOT NULL,
  
  -- Tags for filtering and search (JSON array)
  -- Example: ["coding", "react", "frontend", "web"]
  tags TEXT DEFAULT '[]',
  
  -- Project types this document applies to (JSON array)
  -- Example: ["web_app", "api_service"]
  -- NULL means applies to all project types
  applicable_to TEXT,
  
  -- Category-specific metadata (JSON object)
  -- For project_template: { "default_model": "...", "recommended_agents": [...] }
  -- For agent_pattern: { "mode": "subagent", "default_tools": {...} }
  -- For command_template: { "agent": "build", "subtask": false }
  metadata TEXT DEFAULT '{}',
  
  -- Embedding status for semantic search
  -- pending: needs embedding generation
  -- processing: embedding being generated
  -- completed: embedding ready for search
  -- failed: embedding generation failed
  embedding_status TEXT DEFAULT 'pending' CHECK(embedding_status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  
  -- Versioning
  version INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_knowledge_category 
  ON knowledge_documents(category);

CREATE INDEX IF NOT EXISTS idx_knowledge_updated 
  ON knowledge_documents(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_status
  ON knowledge_documents(embedding_status);

-- ============================================================================
-- Virtual Table: knowledge_embeddings (sqlite-vec)
-- ============================================================================
-- Stores vector embeddings for semantic search using sqlite-vec extension.
-- This is a virtual table that must be created after loading the extension.
--
-- Note: This CREATE statement is for documentation. The actual creation
-- happens in code after loading the sqlite-vec extension:
--
-- db.loadExtension('vec0');
-- db.exec(`
--   CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_embeddings USING vec0(
--     document_id TEXT PRIMARY KEY,
--     embedding float[1536]
--   );
-- `);

-- ============================================================================
-- Table: onboarding_sessions
-- ============================================================================
-- Tracks onboarding sessions for each sandbox.
-- Each sandbox can have one onboarding session.
-- Stores gathered requirements and generated configuration.

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  -- Primary identifier
  id TEXT PRIMARY KEY,
  
  -- Foreign keys
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  sandbox_id TEXT REFERENCES sandboxes(id) ON DELETE SET NULL,
  
  -- Session status
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending',      -- Session created, waiting for user to start
    'started',      -- User clicked "Start Setup"
    'gathering',    -- Actively collecting requirements from user
    'generating',   -- Creating configuration based on requirements
    'applying',     -- Writing configuration files to workspace
    'completed',    -- Successfully finished
    'skipped',      -- User chose to skip onboarding
    'failed'        -- Error occurred during onboarding
  )),
  
  -- Project information gathered during interview
  project_type TEXT,           -- "web_app", "book_publishing", "api_service", etc.
  project_name TEXT,           -- User-provided project name
  project_description TEXT,    -- Brief description of the project
  
  -- All gathered requirements (JSON object)
  -- Structure varies by project type, example:
  -- {
  --   "framework": "react",
  --   "language": "typescript", 
  --   "team_size": "solo",
  --   "experience_level": "intermediate",
  --   "tools": ["github", "vscode"],
  --   "goals": ["build mvp", "learn react"]
  -- }
  gathered_requirements TEXT,
  
  -- Generated configuration (JSON object)
  -- {
  --   "opencodeJson": {...},           -- Contents of opencode.json
  --   "agentsMd": "...",               -- Contents of AGENTS.md
  --   "agents": [                       -- Array of agent files
  --     { "name": "reviewer", "content": "..." }
  --   ],
  --   "commands": [                     -- Array of command files
  --     { "name": "test", "content": "..." }
  --   ],
  --   "tools": [                        -- Array of tool files
  --     { "name": "db", "content": "..." }
  --   ],
  --   "plugins": [                      -- Array of plugin files
  --     { "name": "logger", "content": "..." }
  --   ],
  --   "folderStructure": [...]         -- Recommended folders to create
  -- }
  generated_config TEXT,
  
  -- Selected models
  selected_model TEXT,         -- Primary model (e.g., "anthropic/claude-sonnet-4")
  selected_small_model TEXT,   -- Fast model (e.g., "anthropic/claude-haiku")
  
  -- Error information (if status is 'failed')
  error_message TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  
  -- Each sandbox can only have one onboarding session
  UNIQUE(sandbox_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_onboarding_user 
  ON onboarding_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_sandbox 
  ON onboarding_sessions(sandbox_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_status 
  ON onboarding_sessions(status);

CREATE INDEX IF NOT EXISTS idx_onboarding_created 
  ON onboarding_sessions(created_at DESC);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS knowledge_documents_updated_at
  AFTER UPDATE ON knowledge_documents
  BEGIN
    UPDATE knowledge_documents 
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS onboarding_sessions_updated_at
  AFTER UPDATE ON onboarding_sessions
  BEGIN
    UPDATE onboarding_sessions 
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
  END;

-- ============================================================================
-- Sample Data: Project Templates
-- ============================================================================
-- These would be seeded from the knowledge-base/ markdown files using
-- the seed:knowledge script.

-- Web Application Template
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'tpl_web_app',
  'project_template',
  'Web Application',
  'Full-stack web application with modern frontend framework',
  '-- Content loaded from knowledge-base/project-templates/web-app.md --',
  '["coding", "web", "frontend", "backend", "fullstack"]',
  NULL,
  '{"default_model": "anthropic/claude-sonnet-4-20250514", "recommended_agents": ["code-reviewer", "technical-writer"]}'
);

-- API Service Template
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'tpl_api_service',
  'project_template',
  'API Service',
  'Backend API service with REST or GraphQL endpoints',
  '-- Content loaded from knowledge-base/project-templates/api-service.md --',
  '["coding", "backend", "api", "rest", "graphql"]',
  NULL,
  '{"default_model": "anthropic/claude-sonnet-4-20250514", "recommended_agents": ["code-reviewer", "qa-engineer"]}'
);

-- Book Publishing Template
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'tpl_book_publishing',
  'project_template',
  'Book Publishing',
  'Book writing and publishing workflow',
  '-- Content loaded from knowledge-base/project-templates/book-publishing.md --',
  '["writing", "publishing", "book", "creative"]',
  NULL,
  '{"default_model": "anthropic/claude-sonnet-4-20250514", "recommended_agents": ["editor", "researcher"]}'
);

-- ============================================================================
-- Sample Data: Agent Patterns
-- ============================================================================

-- Code Reviewer Agent
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'agent_code_reviewer',
  'agent_pattern',
  'Code Reviewer',
  'Reviews code for quality, security, and best practices',
  '-- Content loaded from knowledge-base/agent-patterns/code-reviewer.md --',
  '["coding", "review", "quality"]',
  '["web_app", "api_service", "mobile_app"]',
  '{"mode": "subagent", "default_tools": {"write": false, "edit": false, "bash": false}}'
);

-- Editor Agent
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'agent_editor',
  'agent_pattern',
  'Editor',
  'Reviews and improves written content',
  '-- Content loaded from knowledge-base/agent-patterns/editor.md --',
  '["writing", "editing", "content"]',
  '["book_publishing", "social_media", "research_project"]',
  '{"mode": "subagent", "default_tools": {"write": true, "edit": true, "bash": false}}'
);

-- Researcher Agent
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'agent_researcher',
  'agent_pattern',
  'Researcher',
  'Conducts research and summarizes findings',
  '-- Content loaded from knowledge-base/agent-patterns/researcher.md --',
  '["research", "analysis", "summarization"]',
  NULL,
  '{"mode": "subagent", "default_tools": {"write": true, "edit": true, "bash": false, "webfetch": true}}'
);

-- ============================================================================
-- Sample Data: Command Templates
-- ============================================================================

-- Review Command
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'cmd_review',
  'command_template',
  'Review',
  'Review code changes or content',
  '-- Content loaded from knowledge-base/command-templates/review.md --',
  '["review", "quality"]',
  NULL,
  '{"agent": "plan", "subtask": false}'
);

-- Test Command
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'cmd_test',
  'command_template',
  'Test',
  'Run tests and analyze results',
  '-- Content loaded from knowledge-base/command-templates/test.md --',
  '["testing", "quality", "ci"]',
  '["web_app", "api_service", "mobile_app"]',
  '{"agent": "build", "subtask": false}'
);

-- Plan Command
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'cmd_plan',
  'command_template',
  'Plan',
  'Create implementation plan for a feature',
  '-- Content loaded from knowledge-base/command-templates/plan.md --',
  '["planning", "architecture"]',
  NULL,
  '{"agent": "plan", "subtask": false}'
);

-- ============================================================================
-- Sample Data: Provider Guides
-- ============================================================================

-- Anthropic Setup Guide
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'guide_anthropic',
  'provider_guide',
  'Anthropic Setup Guide',
  'How to set up Anthropic as your AI provider',
  '# Setting up Anthropic

Anthropic provides Claude, one of the most capable AI models available.

## Steps

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in to your account
3. Navigate to "API Keys" in the sidebar
4. Click "Create Key" and give it a name
5. Copy the API key (it starts with "sk-ant-")
6. Paste it in AgentPod Settings > Providers > Anthropic

## Pricing

- Claude Sonnet 4: $3/M input, $15/M output
- Claude Haiku: $0.25/M input, $1.25/M output

## Free Credits

New accounts receive $5 in free credits.

[Sign up](https://console.anthropic.com/signup) | [Pricing](https://anthropic.com/pricing)',
  '["anthropic", "claude", "provider", "setup"]',
  NULL,
  '{"signupUrl": "https://console.anthropic.com/signup", "pricingUrl": "https://anthropic.com/pricing", "freeCredits": "$5"}'
);

-- OpenAI Setup Guide
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'guide_openai',
  'provider_guide',
  'OpenAI Setup Guide',
  'How to set up OpenAI as your AI provider',
  '# Setting up OpenAI

OpenAI provides GPT-4 and other powerful models.

## Steps

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in to your account
3. Navigate to "API Keys" in the sidebar
4. Click "Create new secret key"
5. Copy the API key (it starts with "sk-")
6. Paste it in AgentPod Settings > Providers > OpenAI

## Pricing

- GPT-4o: $5/M input, $15/M output
- GPT-4o-mini: $0.15/M input, $0.60/M output

[Sign up](https://platform.openai.com/signup) | [Pricing](https://openai.com/pricing)',
  '["openai", "gpt", "provider", "setup"]',
  NULL,
  '{"signupUrl": "https://platform.openai.com/signup", "pricingUrl": "https://openai.com/pricing"}'
);

-- Google AI Setup Guide
INSERT OR IGNORE INTO knowledge_documents (
  id, category, title, description, content, tags, applicable_to, metadata
) VALUES (
  'guide_google',
  'provider_guide',
  'Google AI Setup Guide',
  'How to set up Google AI as your AI provider',
  '# Setting up Google AI

Google provides Gemini models with excellent multimodal capabilities.

## Steps

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "Get API key" in the sidebar
4. Create a new API key or use an existing one
5. Copy the API key
6. Paste it in AgentPod Settings > Providers > Google

## Pricing

- Gemini 2.0 Pro: $1.25/M input, $5/M output
- Gemini 2.0 Flash: $0.075/M input, $0.30/M output

## Free Tier

Google offers a free tier with rate limits.

[Sign up](https://aistudio.google.com) | [Pricing](https://ai.google.dev/pricing)',
  '["google", "gemini", "provider", "setup"]',
  NULL,
  '{"signupUrl": "https://aistudio.google.com", "pricingUrl": "https://ai.google.dev/pricing", "freeCredits": "Free tier available"}'
);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- View: Active onboarding sessions
CREATE VIEW IF NOT EXISTS v_active_onboarding AS
SELECT 
  os.id,
  os.user_id,
  os.sandbox_id,
  os.status,
  os.project_type,
  os.created_at,
  os.updated_at
FROM onboarding_sessions os
WHERE os.status IN ('pending', 'started', 'gathering', 'generating', 'applying');

-- View: Knowledge documents by category
CREATE VIEW IF NOT EXISTS v_knowledge_by_category AS
SELECT 
  category,
  COUNT(*) as document_count,
  MAX(updated_at) as last_updated
FROM knowledge_documents
GROUP BY category;

-- View: Project templates with metadata
CREATE VIEW IF NOT EXISTS v_project_templates AS
SELECT 
  id,
  title,
  description,
  tags,
  json_extract(metadata, '$.default_model') as default_model,
  json_extract(metadata, '$.recommended_agents') as recommended_agents,
  updated_at
FROM knowledge_documents
WHERE category = 'project_template';

-- View: Documents pending embedding
CREATE VIEW IF NOT EXISTS v_pending_embeddings AS
SELECT 
  id,
  category,
  title,
  LENGTH(content) as content_length,
  created_at
FROM knowledge_documents
WHERE embedding_status = 'pending'
ORDER BY created_at;
