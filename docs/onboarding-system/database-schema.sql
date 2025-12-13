-- ============================================================================
-- Onboarding System Database Schema
-- ============================================================================
-- This schema extends the existing AgentPod database with tables for:
-- 1. Knowledge base documents (templates, patterns, guides)
-- 2. Onboarding session tracking
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
    'workflow_pattern',    -- Multi-step workflow guides
    'best_practice'        -- General guidance and documentation
  )),
  
  -- Document metadata
  title TEXT NOT NULL,
  description TEXT,
  
  -- Main content (Markdown, JSON, or TypeScript depending on category)
  content TEXT NOT NULL,
  
  -- Tags for filtering and search (JSON array)
  -- Example: ["coding", "react", "frontend", "web"]
  tags TEXT,
  
  -- Project types this document applies to (JSON array)
  -- Example: ["web_app", "api_service"]
  -- NULL means applies to all project types
  applicable_to TEXT,
  
  -- Category-specific metadata (JSON object)
  -- For project_template: { "default_model": "...", "recommended_agents": [...] }
  -- For agent_pattern: { "mode": "subagent", "default_tools": {...} }
  -- For command_template: { "agent": "build", "subtask": false }
  metadata TEXT,
  
  -- Vector embedding for semantic search (optional, for future use)
  -- Store as BLOB (binary) - can be populated by embedding service
  embedding BLOB,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_knowledge_category 
  ON knowledge_documents(category);

CREATE INDEX IF NOT EXISTS idx_knowledge_updated 
  ON knowledge_documents(updated_at DESC);

-- ============================================================================
-- Table: onboarding_sessions
-- ============================================================================
-- Tracks onboarding sessions for each user/sandbox combination.
-- Stores gathered requirements and generated configuration.

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  -- Primary identifier
  id TEXT PRIMARY KEY,
  
  -- Foreign keys
  user_id TEXT NOT NULL,
  sandbox_id TEXT,
  
  -- Session status
  status TEXT NOT NULL DEFAULT 'started' CHECK(status IN (
    'started',      -- Session created, interview not begun
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
  --   "opencode_json": {...},           -- Contents of opencode.json
  --   "agents_md": "...",               -- Contents of AGENTS.md
  --   "agents": [                       -- Array of agent files
  --     { "name": "reviewer", "content": "..." }
  --   ],
  --   "commands": [                     -- Array of command files
  --     { "name": "test", "content": "..." }
  --   ],
  --   "tools": [                        -- Array of tool files
  --     { "name": "db", "content": "..." }
  --   ],
  --   "folder_structure": [...]         -- Recommended folders to create
  -- }
  generated_config TEXT,
  
  -- Error information (if status is 'failed')
  error_message TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  
  -- Foreign key constraints
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (sandbox_id) REFERENCES sandboxes(id) ON DELETE SET NULL
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
-- Sample Data: Project Templates
-- ============================================================================
-- These would be seeded from the knowledge-base/ markdown files

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
-- Triggers for updated_at
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS knowledge_documents_updated_at
  AFTER UPDATE ON knowledge_documents
  BEGIN
    UPDATE knowledge_documents 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS onboarding_sessions_updated_at
  AFTER UPDATE ON onboarding_sessions
  BEGIN
    UPDATE onboarding_sessions 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
  END;

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
WHERE os.status IN ('started', 'gathering', 'generating', 'applying');

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
