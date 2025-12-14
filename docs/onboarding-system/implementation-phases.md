# Implementation Phases

Step-by-step guide to implementing the Onboarding Agent System for AgentPod.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | OpenCode (native agent) | Already integrated, consistent UX |
| **First message trigger** | UI prompt | User clicks "Start Setup" in UI, sends first message |
| **Provider detection** | Assume from configured providers | Use existing `provider_credentials` table |
| **No providers fallback** | Offer help getting API key | Guide user through setup |
| **Model info source** | models.dev API | Always up-to-date, already integrated |
| **Provider storage** | Both DB + sandbox env vars | DB for Management API, env vars for container |
| **Onboarding scope** | Once per sandbox | Each sandbox can have different setup |
| **Post-onboarding** | `@workspace` agent | Replaces `@onboarding`, helps maintain workspace |
| **Re-onboarding** | Ask user preference | Wipe vs merge existing config |
| **Vector search** | sqlite-vec in Phase 1 | Future-proof for semantic search |
| **Knowledge seeding** | Manual command | `pnpm seed:knowledge`, automated later |
| **Testing approach** | TDD (Red-Green-Refactor) | Tests written before implementation |

## Overview

The implementation is divided into 4 phases:

| Phase | Focus | Effort | Dependencies |
|-------|-------|--------|--------------|
| Phase 1 | Database, Vector Search & Services | 3-4 days | None |
| Phase 2 | MCP Server & API Routes | 2-3 days | Phase 1 |
| Phase 3 | Container Integration | 2-3 days | Phase 2 |
| Phase 4 | Frontend & Polish | 2-3 days | Phase 3 |

**Total Estimated Effort:** 9-13 days

## Existing Infrastructure

These components already exist and will be leveraged:

| Component | Location | Purpose |
|-----------|----------|---------|
| `models-dev.ts` | `apps/api/src/services/` | Fetches provider/model data from models.dev |
| `providers.ts` routes | `apps/api/src/routes/` | Provider CRUD, configured status, OAuth |
| `provider_credentials` table | Migration 2 | Stores encrypted API keys |
| `user_preferences` table | Migration 16 | User settings |
| `sandboxes` table | Migration 13 | Sandbox metadata with user association |
| `sandbox-manager.ts` | `apps/api/src/services/` | Manages sandbox lifecycle |

---

## Phase 1: Database, Vector Search & Services

### 1.1 Install sqlite-vec Extension

**Goal:** Enable vector search capabilities in SQLite for semantic knowledge search.

**Dependencies:**
```bash
pnpm add sqlite-vec -F api
```

**File:** `apps/api/src/db/vector.ts`

```typescript
import { db } from './index.ts';

/**
 * Initialize sqlite-vec extension for vector search
 * Must be called after database initialization
 */
export function initVectorSearch(): void {
  // Load the sqlite-vec extension
  db.loadExtension('vec0');
  
  // Create virtual table for knowledge embeddings
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_embeddings USING vec0(
      document_id TEXT PRIMARY KEY,
      embedding float[1536]
    );
  `);
}

/**
 * Search for similar documents using vector similarity
 */
export function vectorSearch(
  embedding: number[],
  limit: number = 10,
  threshold: number = 0.5
): Array<{ document_id: string; distance: number }> {
  const stmt = db.prepare(`
    SELECT document_id, distance
    FROM knowledge_embeddings
    WHERE distance < ?
    ORDER BY distance
    LIMIT ?
  `);
  
  return stmt.all(embedding, threshold, limit) as Array<{
    document_id: string;
    distance: number;
  }>;
}

/**
 * Insert or update document embedding
 */
export function upsertEmbedding(documentId: string, embedding: number[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO knowledge_embeddings (document_id, embedding)
    VALUES (?, ?)
  `);
  stmt.run(documentId, new Float32Array(embedding));
}
```

**Checklist:**
- [ ] Write tests for vector.ts (RED)
- [ ] Install sqlite-vec package
- [ ] Implement vector.ts functions (GREEN)
- [ ] Refactor if needed

### 1.2 Add Database Migration (Migration 19)

**File:** `apps/api/src/db/migrations.ts`

Add migration 19 for onboarding system tables:

```typescript
// Migration 19: Add onboarding system tables
// Stores knowledge base documents and onboarding session tracking
{
  version: 19,
  name: 'add_onboarding_system_tables',
  up: () => {
    // Knowledge documents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL CHECK(category IN (
          'project_template',
          'agent_pattern',
          'command_template',
          'tool_template',
          'plugin_template',
          'mcp_template',
          'workflow_pattern',
          'best_practice',
          'provider_guide'
        )),
        title TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        applicable_to TEXT,
        metadata TEXT DEFAULT '{}',
        embedding_status TEXT DEFAULT 'pending' CHECK(embedding_status IN (
          'pending', 'processing', 'completed', 'failed'
        )),
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_knowledge_category 
        ON knowledge_documents(category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_updated 
        ON knowledge_documents(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_status
        ON knowledge_documents(embedding_status);
    `);
    
    // Onboarding sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS onboarding_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        sandbox_id TEXT REFERENCES sandboxes(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending',
          'started',
          'gathering',
          'generating',
          'applying',
          'completed',
          'skipped',
          'failed'
        )),
        project_type TEXT,
        project_name TEXT,
        project_description TEXT,
        gathered_requirements TEXT,
        generated_config TEXT,
        selected_model TEXT,
        selected_small_model TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        UNIQUE(sandbox_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_onboarding_user 
        ON onboarding_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_onboarding_sandbox 
        ON onboarding_sessions(sandbox_id);
      CREATE INDEX IF NOT EXISTS idx_onboarding_status 
        ON onboarding_sessions(status);
    `);
    
    // Triggers for updated_at
    db.exec(`
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
    `);
  },
  down: () => {
    db.exec('DROP TRIGGER IF EXISTS onboarding_sessions_updated_at');
    db.exec('DROP TRIGGER IF EXISTS knowledge_documents_updated_at');
    db.exec('DROP TABLE IF EXISTS onboarding_sessions');
    db.exec('DROP TABLE IF EXISTS knowledge_documents');
    db.exec('DROP TABLE IF EXISTS knowledge_embeddings');
  },
},
```

**Checklist:**
- [ ] Write migration tests (RED)
- [ ] Add migration to migrations array (GREEN)
- [ ] Run migration and verify tables created
- [ ] Test rollback works correctly

### 1.3 Create TypeScript Types

**File:** `packages/types/src/onboarding.ts`

```typescript
// =============================================================================
// Knowledge Document Types
// =============================================================================

export type KnowledgeCategory = 
  | 'project_template'
  | 'agent_pattern'
  | 'command_template'
  | 'tool_template'
  | 'plugin_template'
  | 'mcp_template'
  | 'workflow_pattern'
  | 'best_practice'
  | 'provider_guide';

export type EmbeddingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeDocument {
  id: string;
  category: KnowledgeCategory;
  title: string;
  description: string | null;
  content: string;
  tags: string[];
  applicableTo: string[] | null;
  metadata: Record<string, unknown>;
  embeddingStatus: EmbeddingStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSearchParams {
  query?: string;
  category?: KnowledgeCategory;
  tags?: string[];
  applicableTo?: string;
  limit?: number;
  useSemanticSearch?: boolean;
}

export interface KnowledgeSearchResult extends KnowledgeDocument {
  relevanceScore?: number;
}

// =============================================================================
// Onboarding Session Types
// =============================================================================

export type OnboardingStatus = 
  | 'pending'
  | 'started'
  | 'gathering'
  | 'generating'
  | 'applying'
  | 'completed'
  | 'skipped'
  | 'failed';

export interface OnboardingSession {
  id: string;
  userId: string;
  sandboxId: string | null;
  status: OnboardingStatus;
  projectType: string | null;
  projectName: string | null;
  projectDescription: string | null;
  gatheredRequirements: GatheredRequirements | null;
  generatedConfig: GeneratedConfig | null;
  selectedModel: string | null;
  selectedSmallModel: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface GatheredRequirements {
  projectType: string;
  framework?: string;
  language?: string;
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
  teamSize?: 'solo' | 'small' | 'large';
  tools?: string[];
  goals?: string[];
  preferences?: Record<string, unknown>;
}

export interface GeneratedConfig {
  opencodeJson: OpencodeJsonConfig;
  agentsMd: string;
  agents: Array<{ name: string; content: string }>;
  commands: Array<{ name: string; content: string }>;
  tools: Array<{ name: string; content: string }>;
  plugins: Array<{ name: string; content: string }>;
  folderStructure: string[];
}

export interface OpencodeJsonConfig {
  $schema: string;
  model: string;
  small_model?: string;
  mcp?: Record<string, McpServerConfig>;
  agent?: Record<string, AgentConfig>;
  command?: Record<string, CommandConfig>;
  permission?: PermissionConfig;
  formatter?: Record<string, FormatterConfig>;
  instructions?: string[];
}

export interface McpServerConfig {
  type: 'local' | 'remote';
  url?: string;
  command?: string[];
  headers?: Record<string, string>;
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export interface AgentConfig {
  description: string;
  mode?: 'primary' | 'subagent' | 'all';
  model?: string;
  temperature?: number;
  maxSteps?: number;
  tools?: Record<string, boolean>;
  permission?: Record<string, string>;
}

export interface CommandConfig {
  description: string;
  template?: string;
  agent?: string;
  subtask?: boolean;
  model?: string;
}

export interface PermissionConfig {
  edit?: string;
  bash?: string | Record<string, string>;
  webfetch?: string;
  doom_loop?: string;
  external_directory?: string;
}

export interface FormatterConfig {
  command: string[];
  extensions: string[];
  environment?: Record<string, string>;
  disabled?: boolean;
}

// =============================================================================
// Model Selection Types
// =============================================================================

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  tier: 'premium' | 'fast' | 'specialized';
  context: number;
  maxOutput: number;
  pricing: {
    input: number;
    output: number;
  };
  capabilities: {
    tools: boolean;
    image: boolean;
    video: boolean;
    streaming: boolean;
  };
}

export interface ModelRecommendation {
  primary: string;
  fast: string;
  reasoning: string;
}

export interface AvailableModelsResponse {
  hasConfiguredProviders: boolean;
  configuredProviders: string[];
  models: AvailableModel[];
  recommendations: ModelRecommendation;
}

export interface ProviderSetupGuide {
  provider: string;
  name: string;
  steps: string[];
  signupUrl: string;
  pricingUrl: string;
  freeCredits?: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface CreateOnboardingSessionParams {
  sandboxId: string;
}

export interface UpdateOnboardingSessionParams {
  status?: OnboardingStatus;
  projectType?: string;
  projectName?: string;
  projectDescription?: string;
  gatheredRequirements?: GatheredRequirements;
  generatedConfig?: GeneratedConfig;
  selectedModel?: string;
  selectedSmallModel?: string;
  errorMessage?: string;
}

export interface OnboardingStatusResponse {
  needsOnboarding: boolean;
  activeSession: OnboardingSession | null;
}
```

**Checklist:**
- [ ] Create types file
- [ ] Export from `packages/types/src/index.ts`
- [ ] Run type check to verify no errors

### 1.4 Create Knowledge Service

**File:** `apps/api/src/services/knowledge-service.ts`

```typescript
import { db } from '../db/index.ts';
import { nanoid } from 'nanoid';
import { vectorSearch, upsertEmbedding } from '../db/vector.ts';
import type {
  KnowledgeDocument,
  KnowledgeSearchParams,
  KnowledgeSearchResult,
  KnowledgeCategory,
} from '@agentpod/types';

export class KnowledgeService {
  /**
   * Search knowledge documents with optional semantic search
   */
  async search(params: KnowledgeSearchParams): Promise<KnowledgeSearchResult[]> {
    const { 
      query, 
      category, 
      tags, 
      applicableTo, 
      limit = 10,
      useSemanticSearch = false 
    } = params;
    
    // If semantic search is enabled and we have a query, use vector search
    if (useSemanticSearch && query) {
      return this.semanticSearch(query, { category, tags, applicableTo, limit });
    }
    
    // Fall back to keyword search
    return this.keywordSearch({ query, category, tags, applicableTo, limit });
  }

  /**
   * Keyword-based search
   */
  private async keywordSearch(params: Omit<KnowledgeSearchParams, 'useSemanticSearch'>): Promise<KnowledgeSearchResult[]> {
    const { query, category, tags, applicableTo, limit = 10 } = params;
    
    let sql = 'SELECT * FROM knowledge_documents WHERE 1=1';
    const bindings: unknown[] = [];
    
    if (category) {
      sql += ' AND category = ?';
      bindings.push(category);
    }
    
    if (tags && tags.length > 0) {
      const tagConditions = tags.map(() => "tags LIKE ?").join(' OR ');
      sql += ` AND (${tagConditions})`;
      tags.forEach(tag => bindings.push(`%"${tag}"%`));
    }
    
    if (applicableTo) {
      sql += ' AND (applicable_to IS NULL OR applicable_to LIKE ?)';
      bindings.push(`%"${applicableTo}"%`);
    }
    
    if (query) {
      sql += ' AND (title LIKE ? OR description LIKE ? OR content LIKE ?)';
      const searchPattern = `%${query}%`;
      bindings.push(searchPattern, searchPattern, searchPattern);
    }
    
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    bindings.push(limit);
    
    const stmt = db.prepare(sql);
    const rows = stmt.all(...bindings) as any[];
    
    return rows.map(row => this.rowToDocument(row));
  }

  /**
   * Semantic search using vector embeddings
   */
  private async semanticSearch(
    query: string,
    filters: Omit<KnowledgeSearchParams, 'query' | 'useSemanticSearch'>
  ): Promise<KnowledgeSearchResult[]> {
    // TODO: Generate embedding for query using AI provider
    // For now, fall back to keyword search
    console.warn('Semantic search not yet implemented, falling back to keyword search');
    return this.keywordSearch({ query, ...filters });
  }

  /**
   * Get a single document by ID
   */
  async getById(id: string): Promise<KnowledgeDocument | null> {
    const stmt = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToDocument(row) : null;
  }

  /**
   * Get documents by category
   */
  async getByCategory(category: KnowledgeCategory): Promise<KnowledgeDocument[]> {
    const stmt = db.prepare(
      'SELECT * FROM knowledge_documents WHERE category = ? ORDER BY title'
    );
    const rows = stmt.all(category) as any[];
    return rows.map(row => this.rowToDocument(row));
  }

  /**
   * Create a new document
   */
  async create(doc: Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'embeddingStatus'>): Promise<KnowledgeDocument> {
    const prefixMap: Record<string, string> = {
      'project_template': 'tpl',
      'agent_pattern': 'agent',
      'command_template': 'cmd',
      'tool_template': 'tool',
      'plugin_template': 'plugin',
      'mcp_template': 'mcp',
      'workflow_pattern': 'wf',
      'best_practice': 'bp',
      'provider_guide': 'guide',
    };
    const prefix = prefixMap[doc.category] || 'doc';
    const id = `${prefix}_${nanoid(10)}`;
    
    const stmt = db.prepare(`
      INSERT INTO knowledge_documents 
      (id, category, title, description, content, tags, applicable_to, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      doc.category,
      doc.title,
      doc.description,
      doc.content,
      JSON.stringify(doc.tags),
      doc.applicableTo ? JSON.stringify(doc.applicableTo) : null,
      JSON.stringify(doc.metadata)
    );
    
    return this.getById(id) as Promise<KnowledgeDocument>;
  }

  /**
   * Update an existing document
   */
  async update(id: string, updates: Partial<KnowledgeDocument>): Promise<KnowledgeDocument | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const fields: string[] = [];
    const values: unknown[] = [];
    
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
      fields.push('version = version + 1');
      fields.push("embedding_status = 'pending'"); // Re-embed on content change
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.applicableTo !== undefined) {
      fields.push('applicable_to = ?');
      values.push(updates.applicableTo ? JSON.stringify(updates.applicableTo) : null);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }
    
    if (fields.length === 0) return existing;
    
    values.push(id);
    const stmt = db.prepare(
      `UPDATE knowledge_documents SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);
    
    return this.getById(id);
  }

  /**
   * Delete a document
   */
  async delete(id: string): Promise<boolean> {
    const stmt = db.prepare('DELETE FROM knowledge_documents WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * List all project types (templates)
   */
  async listProjectTypes(): Promise<Array<{ id: string; title: string; description: string; tags: string[] }>> {
    const templates = await this.getByCategory('project_template');
    return templates.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      tags: t.tags,
    }));
  }

  /**
   * Get provider setup guide
   */
  async getProviderGuide(providerId: string): Promise<KnowledgeDocument | null> {
    const stmt = db.prepare(`
      SELECT * FROM knowledge_documents 
      WHERE category = 'provider_guide' AND id = ?
    `);
    const row = stmt.get(`guide_${providerId}`) as any;
    return row ? this.rowToDocument(row) : null;
  }

  /**
   * Convert database row to document type
   */
  private rowToDocument(row: any): KnowledgeDocument {
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      description: row.description,
      content: row.content,
      tags: row.tags ? JSON.parse(row.tags) : [],
      applicableTo: row.applicable_to ? JSON.parse(row.applicable_to) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      embeddingStatus: row.embedding_status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const knowledgeService = new KnowledgeService();
```

**Checklist:**
- [ ] Write tests for knowledge-service.ts (RED)
- [ ] Implement service methods (GREEN)
- [ ] Refactor for cleaner code

### 1.5 Create Onboarding Service

**File:** `apps/api/src/services/onboarding-service.ts`

```typescript
import { db } from '../db/index.ts';
import { nanoid } from 'nanoid';
import type {
  OnboardingSession,
  OnboardingStatus,
  CreateOnboardingSessionParams,
  UpdateOnboardingSessionParams,
} from '@agentpod/types';

export class OnboardingService {
  /**
   * Check if sandbox needs onboarding
   */
  async needsOnboarding(sandboxId: string): Promise<boolean> {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM onboarding_sessions 
      WHERE sandbox_id = ? AND status IN ('completed', 'skipped')
    `);
    const result = stmt.get(sandboxId) as { count: number };
    return result.count === 0;
  }

  /**
   * Get active session for sandbox (if any)
   */
  async getActiveSession(sandboxId: string): Promise<OnboardingSession | null> {
    const stmt = db.prepare(`
      SELECT * FROM onboarding_sessions 
      WHERE sandbox_id = ? AND status NOT IN ('completed', 'skipped', 'failed')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(sandboxId) as any;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * Get session for sandbox (any status)
   */
  async getSessionBySandboxId(sandboxId: string): Promise<OnboardingSession | null> {
    const stmt = db.prepare(`
      SELECT * FROM onboarding_sessions 
      WHERE sandbox_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(sandboxId) as any;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * Create a new onboarding session
   */
  async createSession(userId: string, params: CreateOnboardingSessionParams): Promise<OnboardingSession> {
    const id = `onb_${nanoid(12)}`;
    
    const stmt = db.prepare(`
      INSERT INTO onboarding_sessions (id, user_id, sandbox_id, status)
      VALUES (?, ?, ?, 'pending')
    `);
    
    stmt.run(id, userId, params.sandboxId);
    
    return this.getSessionById(id) as Promise<OnboardingSession>;
  }

  /**
   * Get session by ID
   */
  async getSessionById(id: string): Promise<OnboardingSession | null> {
    const stmt = db.prepare('SELECT * FROM onboarding_sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * Update session
   */
  async updateSession(id: string, updates: UpdateOnboardingSessionParams): Promise<OnboardingSession | null> {
    const existing = await this.getSessionById(id);
    if (!existing) return null;
    
    const fields: string[] = [];
    const values: unknown[] = [];
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
      
      if (updates.status === 'completed' || updates.status === 'skipped') {
        fields.push("completed_at = datetime('now')");
      }
    }
    if (updates.projectType !== undefined) {
      fields.push('project_type = ?');
      values.push(updates.projectType);
    }
    if (updates.projectName !== undefined) {
      fields.push('project_name = ?');
      values.push(updates.projectName);
    }
    if (updates.projectDescription !== undefined) {
      fields.push('project_description = ?');
      values.push(updates.projectDescription);
    }
    if (updates.gatheredRequirements !== undefined) {
      fields.push('gathered_requirements = ?');
      values.push(JSON.stringify(updates.gatheredRequirements));
    }
    if (updates.generatedConfig !== undefined) {
      fields.push('generated_config = ?');
      values.push(JSON.stringify(updates.generatedConfig));
    }
    if (updates.selectedModel !== undefined) {
      fields.push('selected_model = ?');
      values.push(updates.selectedModel);
    }
    if (updates.selectedSmallModel !== undefined) {
      fields.push('selected_small_model = ?');
      values.push(updates.selectedSmallModel);
    }
    if (updates.errorMessage !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.errorMessage);
    }
    
    if (fields.length === 0) return existing;
    
    values.push(id);
    const stmt = db.prepare(
      `UPDATE onboarding_sessions SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);
    
    return this.getSessionById(id);
  }

  /**
   * Start onboarding (transition from pending to started)
   */
  async startSession(id: string): Promise<OnboardingSession | null> {
    return this.updateSession(id, { status: 'started' });
  }

  /**
   * Skip onboarding for a session
   */
  async skipSession(id: string): Promise<OnboardingSession | null> {
    return this.updateSession(id, { status: 'skipped' });
  }

  /**
   * Mark session as complete
   */
  async completeSession(id: string): Promise<OnboardingSession | null> {
    return this.updateSession(id, { status: 'completed' });
  }

  /**
   * Mark session as failed
   */
  async failSession(id: string, errorMessage: string): Promise<OnboardingSession | null> {
    return this.updateSession(id, { 
      status: 'failed', 
      errorMessage 
    });
  }

  /**
   * Reset session for re-onboarding
   * @param mode 'wipe' to start fresh, 'merge' to keep existing config
   */
  async resetSession(id: string, mode: 'wipe' | 'merge'): Promise<OnboardingSession | null> {
    const existing = await this.getSessionById(id);
    if (!existing) return null;
    
    if (mode === 'wipe') {
      return this.updateSession(id, {
        status: 'pending',
        projectType: undefined,
        projectName: undefined,
        projectDescription: undefined,
        gatheredRequirements: undefined,
        generatedConfig: undefined,
        errorMessage: undefined,
      });
    } else {
      // Merge mode: keep gathered info but reset status
      return this.updateSession(id, {
        status: 'pending',
        errorMessage: undefined,
      });
    }
  }

  /**
   * Get user's onboarding history across all sandboxes
   */
  async getUserHistory(userId: string): Promise<OnboardingSession[]> {
    const stmt = db.prepare(`
      SELECT * FROM onboarding_sessions 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(row => this.rowToSession(row));
  }

  /**
   * Convert database row to session type
   */
  private rowToSession(row: any): OnboardingSession {
    return {
      id: row.id,
      userId: row.user_id,
      sandboxId: row.sandbox_id,
      status: row.status,
      projectType: row.project_type,
      projectName: row.project_name,
      projectDescription: row.project_description,
      gatheredRequirements: row.gathered_requirements 
        ? JSON.parse(row.gathered_requirements) 
        : null,
      generatedConfig: row.generated_config 
        ? JSON.parse(row.generated_config) 
        : null,
      selectedModel: row.selected_model,
      selectedSmallModel: row.selected_small_model,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}

export const onboardingService = new OnboardingService();
```

**Checklist:**
- [ ] Write tests for onboarding-service.ts (RED)
- [ ] Implement service methods (GREEN)
- [ ] Test session lifecycle (create -> start -> update -> complete)
- [ ] Test reset functionality (wipe vs merge)

### 1.6 Create Model Selection Service

**File:** `apps/api/src/services/model-selection-service.ts`

```typescript
import { modelsDev } from './models-dev.ts';
import { getConfiguredProviderIds } from '../models/provider-credentials.ts';
import type {
  AvailableModel,
  AvailableModelsResponse,
  ProviderSetupGuide,
} from '@agentpod/types';

// Model tier classification based on capabilities and pricing
const MODEL_TIERS: Record<string, 'premium' | 'fast' | 'specialized'> = {
  // Premium tier - best quality
  'claude-sonnet-4': 'premium',
  'claude-3-5-sonnet': 'premium',
  'gpt-4o': 'premium',
  'gpt-4-turbo': 'premium',
  'gemini-2.0-pro': 'premium',
  'gemini-1.5-pro': 'premium',
  
  // Fast tier - quick responses
  'claude-haiku': 'fast',
  'claude-3-haiku': 'fast',
  'gpt-4o-mini': 'fast',
  'gpt-3.5-turbo': 'fast',
  'gemini-2.0-flash': 'fast',
  'gemini-1.5-flash': 'fast',
  
  // Specialized tier
  'deepseek-coder': 'specialized',
  'codestral': 'specialized',
};

// Provider setup guides (hardcoded for popular providers)
const PROVIDER_GUIDES: Record<string, ProviderSetupGuide> = {
  anthropic: {
    provider: 'anthropic',
    name: 'Anthropic',
    steps: [
      '1. Go to https://console.anthropic.com',
      '2. Sign up or log in to your account',
      '3. Navigate to "API Keys" in the sidebar',
      '4. Click "Create Key" and give it a name',
      '5. Copy the API key (it starts with "sk-ant-")',
      '6. Paste it in AgentPod Settings > Providers > Anthropic',
    ],
    signupUrl: 'https://console.anthropic.com/signup',
    pricingUrl: 'https://anthropic.com/pricing',
    freeCredits: '$5 free credits for new accounts',
  },
  openai: {
    provider: 'openai',
    name: 'OpenAI',
    steps: [
      '1. Go to https://platform.openai.com',
      '2. Sign up or log in to your account',
      '3. Navigate to "API Keys" in the sidebar',
      '4. Click "Create new secret key"',
      '5. Copy the API key (it starts with "sk-")',
      '6. Paste it in AgentPod Settings > Providers > OpenAI',
    ],
    signupUrl: 'https://platform.openai.com/signup',
    pricingUrl: 'https://openai.com/pricing',
  },
  google: {
    provider: 'google',
    name: 'Google AI',
    steps: [
      '1. Go to https://aistudio.google.com',
      '2. Sign in with your Google account',
      '3. Click "Get API key" in the sidebar',
      '4. Create a new API key or use an existing one',
      '5. Copy the API key',
      '6. Paste it in AgentPod Settings > Providers > Google',
    ],
    signupUrl: 'https://aistudio.google.com',
    pricingUrl: 'https://ai.google.dev/pricing',
    freeCredits: 'Free tier available with rate limits',
  },
  openrouter: {
    provider: 'openrouter',
    name: 'OpenRouter',
    steps: [
      '1. Go to https://openrouter.ai',
      '2. Sign up or log in to your account',
      '3. Navigate to "Keys" in your account settings',
      '4. Create a new API key',
      '5. Copy the API key',
      '6. Paste it in AgentPod Settings > Providers > OpenRouter',
    ],
    signupUrl: 'https://openrouter.ai/signup',
    pricingUrl: 'https://openrouter.ai/docs#models',
    freeCredits: 'Access to many models with pay-per-use pricing',
  },
};

export class ModelSelectionService {
  /**
   * Get available models for the user based on configured providers
   */
  async getAvailableModels(
    tier?: 'premium' | 'fast' | 'all',
    requiredCapability?: 'tools' | 'image' | 'video'
  ): Promise<AvailableModelsResponse> {
    const configuredIds = getConfiguredProviderIds();
    
    if (configuredIds.length === 0) {
      return {
        hasConfiguredProviders: false,
        configuredProviders: [],
        models: [],
        recommendations: {
          primary: '',
          fast: '',
          reasoning: 'No providers configured. Please set up at least one AI provider.',
        },
      };
    }
    
    // Get all providers with models
    const allProviders = await modelsDev.getProvidersWithModels(
      configuredIds,
      null,
      false
    );
    
    // Filter to configured providers only
    const configuredProviders = allProviders.filter(p => p.isConfigured);
    
    // Flatten models and add tier info
    let models: AvailableModel[] = [];
    for (const provider of configuredProviders) {
      for (const model of provider.models) {
        const modelTier = this.getModelTier(model.id);
        
        // Filter by tier if specified
        if (tier && tier !== 'all' && modelTier !== tier) continue;
        
        // Filter by capability if specified
        if (requiredCapability) {
          if (requiredCapability === 'tools' && !model.capabilities.tools) continue;
          if (requiredCapability === 'image' && !model.capabilities.image) continue;
          if (requiredCapability === 'video' && !model.capabilities.video) continue;
        }
        
        models.push({
          id: `${provider.id}/${model.id}`,
          name: model.name,
          provider: provider.id,
          tier: modelTier,
          context: model.context,
          maxOutput: model.maxOutput,
          pricing: model.pricing,
          capabilities: model.capabilities,
        });
      }
    }
    
    // Sort by tier (premium first), then by context size
    models.sort((a, b) => {
      const tierOrder = { premium: 0, fast: 1, specialized: 2 };
      if (tierOrder[a.tier] !== tierOrder[b.tier]) {
        return tierOrder[a.tier] - tierOrder[b.tier];
      }
      return b.context - a.context;
    });
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(models);
    
    return {
      hasConfiguredProviders: true,
      configuredProviders: configuredIds,
      models,
      recommendations,
    };
  }

  /**
   * Get provider setup guide
   */
  getProviderSetupGuide(providerId: string): ProviderSetupGuide | null {
    return PROVIDER_GUIDES[providerId] || null;
  }

  /**
   * Get all available provider guides
   */
  getAllProviderGuides(): ProviderSetupGuide[] {
    return Object.values(PROVIDER_GUIDES);
  }

  /**
   * Determine the tier of a model based on its ID
   */
  private getModelTier(modelId: string): 'premium' | 'fast' | 'specialized' {
    for (const [pattern, tier] of Object.entries(MODEL_TIERS)) {
      if (modelId.toLowerCase().includes(pattern.toLowerCase())) {
        return tier;
      }
    }
    return 'premium'; // Default to premium if unknown
  }

  /**
   * Generate model recommendations based on available models
   */
  private generateRecommendations(models: AvailableModel[]): {
    primary: string;
    fast: string;
    reasoning: string;
  } {
    const premiumModels = models.filter(m => m.tier === 'premium');
    const fastModels = models.filter(m => m.tier === 'fast');
    
    // Prefer Claude Sonnet 4 > GPT-4o > Gemini Pro for primary
    const primaryPreference = [
      'claude-sonnet-4',
      'claude-3-5-sonnet',
      'gpt-4o',
      'gemini-2.0-pro',
    ];
    
    // Prefer Claude Haiku > GPT-4o-mini > Gemini Flash for fast
    const fastPreference = [
      'claude-haiku',
      'claude-3-haiku',
      'gpt-4o-mini',
      'gemini-2.0-flash',
    ];
    
    let primary = '';
    let fast = '';
    
    // Find best primary model
    for (const pref of primaryPreference) {
      const match = premiumModels.find(m => m.id.toLowerCase().includes(pref));
      if (match) {
        primary = match.id;
        break;
      }
    }
    if (!primary && premiumModels.length > 0) {
      primary = premiumModels[0].id;
    }
    
    // Find best fast model
    for (const pref of fastPreference) {
      const match = fastModels.find(m => m.id.toLowerCase().includes(pref));
      if (match) {
        fast = match.id;
        break;
      }
    }
    if (!fast && fastModels.length > 0) {
      fast = fastModels[0].id;
    }
    
    // If no fast model, use primary for both
    if (!fast) fast = primary;
    
    const reasoning = primary
      ? `Recommended ${primary.split('/')[1]} as your primary model for best quality, and ${fast.split('/')[1]} for quick tasks.`
      : 'Unable to recommend models. Please configure at least one AI provider.';
    
    return { primary, fast, reasoning };
  }
}

export const modelSelectionService = new ModelSelectionService();
```

**Checklist:**
- [ ] Write tests for model-selection-service.ts (RED)
- [ ] Implement service methods (GREEN)
- [ ] Test with different provider configurations

### 1.7 Create Knowledge Base Seed Script

**File:** `apps/api/src/scripts/seed-knowledge.ts`

```typescript
import { knowledgeService } from '../services/knowledge-service.ts';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import matter from 'gray-matter';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('seed-knowledge');

const KNOWLEDGE_BASE_PATH = join(
  import.meta.dir,
  '../../../../docs/onboarding-system/knowledge-base'
);

interface SeedResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Seed the knowledge base from markdown files
 */
export async function seedKnowledgeBase(): Promise<SeedResult> {
  const result: SeedResult = { created: 0, updated: 0, errors: [] };
  
  log.info('Starting knowledge base seeding...');
  log.info(`Knowledge base path: ${KNOWLEDGE_BASE_PATH}`);
  
  if (!existsSync(KNOWLEDGE_BASE_PATH)) {
    log.error('Knowledge base directory not found');
    result.errors.push(`Directory not found: ${KNOWLEDGE_BASE_PATH}`);
    return result;
  }
  
  // Seed each category
  await seedCategory('project-templates', 'project_template', result);
  await seedCategory('agent-patterns', 'agent_pattern', result);
  await seedCategory('command-templates', 'command_template', result);
  await seedMcpTemplates(result);
  await seedPluginTemplates(result);
  await seedToolTemplates(result);
  await seedProviderGuides(result);
  
  log.info(`Seeding complete: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`);
  
  return result;
}

async function seedCategory(
  directory: string,
  category: string,
  result: SeedResult
): Promise<void> {
  const dirPath = join(KNOWLEDGE_BASE_PATH, directory);
  
  if (!existsSync(dirPath)) {
    log.warn(`Directory not found: ${dirPath}`);
    return;
  }
  
  const files = readdirSync(dirPath, { recursive: true })
    .filter((f): f is string => typeof f === 'string' && f.endsWith('.md'));
  
  for (const file of files) {
    try {
      const filePath = join(dirPath, file);
      const content = readFileSync(filePath, 'utf-8');
      const { data: frontmatter, content: body } = matter(content);
      
      const id = frontmatter.id || generateIdFromFile(category, file);
      
      const existing = await knowledgeService.getById(id);
      
      const docData = {
        category: category as any,
        title: frontmatter.title || basename(file, '.md'),
        description: frontmatter.description || null,
        content: body,
        tags: frontmatter.tags || [],
        applicableTo: frontmatter.applicable_to || null,
        metadata: frontmatter.metadata || {},
      };
      
      if (existing) {
        await knowledgeService.update(id, docData);
        result.updated++;
        log.debug(`Updated: ${id}`);
      } else {
        await knowledgeService.create(docData);
        result.created++;
        log.debug(`Created: ${id}`);
      }
    } catch (error) {
      const errorMsg = `Failed to seed ${file}: ${error}`;
      log.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }
}

async function seedMcpTemplates(result: SeedResult): Promise<void> {
  const dirPath = join(KNOWLEDGE_BASE_PATH, 'mcp-templates');
  
  if (!existsSync(dirPath)) return;
  
  const files = readdirSync(dirPath).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    try {
      const filePath = join(dirPath, file);
      const content = readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      
      const id = `mcp_${basename(file, '.json')}`;
      const existing = await knowledgeService.getById(id);
      
      const docData = {
        category: 'mcp_template' as const,
        title: config.name || basename(file, '.json'),
        description: config.description || null,
        content: content,
        tags: config.tags || [],
        applicableTo: config.applicable_to || null,
        metadata: { type: config.type },
      };
      
      if (existing) {
        await knowledgeService.update(id, docData);
        result.updated++;
      } else {
        await knowledgeService.create(docData);
        result.created++;
      }
    } catch (error) {
      result.errors.push(`Failed to seed MCP template ${file}: ${error}`);
    }
  }
}

async function seedPluginTemplates(result: SeedResult): Promise<void> {
  const dirPath = join(KNOWLEDGE_BASE_PATH, 'plugin-templates');
  
  if (!existsSync(dirPath)) return;
  
  const files = readdirSync(dirPath).filter(f => f.endsWith('.ts'));
  
  for (const file of files) {
    try {
      const filePath = join(dirPath, file);
      const content = readFileSync(filePath, 'utf-8');
      
      // Parse JSDoc comments for metadata
      const titleMatch = content.match(/@title\s+(.+)/);
      const descMatch = content.match(/@description\s+(.+)/);
      const tagsMatch = content.match(/@tags\s+\[([^\]]+)\]/);
      
      const id = `plugin_${basename(file, '.ts')}`;
      const existing = await knowledgeService.getById(id);
      
      const docData = {
        category: 'plugin_template' as const,
        title: titleMatch?.[1] || basename(file, '.ts'),
        description: descMatch?.[1] || null,
        content: content,
        tags: tagsMatch?.[1].split(',').map(t => t.trim().replace(/"/g, '')) || [],
        applicableTo: null,
        metadata: {},
      };
      
      if (existing) {
        await knowledgeService.update(id, docData);
        result.updated++;
      } else {
        await knowledgeService.create(docData);
        result.created++;
      }
    } catch (error) {
      result.errors.push(`Failed to seed plugin template ${file}: ${error}`);
    }
  }
}

async function seedToolTemplates(result: SeedResult): Promise<void> {
  const dirPath = join(KNOWLEDGE_BASE_PATH, 'tool-templates');
  
  if (!existsSync(dirPath)) return;
  
  const files = readdirSync(dirPath).filter(f => f.endsWith('.ts'));
  
  for (const file of files) {
    try {
      const filePath = join(dirPath, file);
      const content = readFileSync(filePath, 'utf-8');
      
      const titleMatch = content.match(/@title\s+(.+)/);
      const descMatch = content.match(/@description\s+(.+)/);
      const tagsMatch = content.match(/@tags\s+\[([^\]]+)\]/);
      
      const id = `tool_${basename(file, '.ts')}`;
      const existing = await knowledgeService.getById(id);
      
      const docData = {
        category: 'tool_template' as const,
        title: titleMatch?.[1] || basename(file, '.ts'),
        description: descMatch?.[1] || null,
        content: content,
        tags: tagsMatch?.[1]?.split(',').map(t => t.trim().replace(/"/g, '')) || [],
        applicableTo: null,
        metadata: {},
      };
      
      if (existing) {
        await knowledgeService.update(id, docData);
        result.updated++;
      } else {
        await knowledgeService.create(docData);
        result.created++;
      }
    } catch (error) {
      result.errors.push(`Failed to seed tool template ${file}: ${error}`);
    }
  }
}

async function seedProviderGuides(result: SeedResult): Promise<void> {
  // Seed hardcoded provider guides
  const guides = [
    {
      id: 'guide_anthropic',
      title: 'Anthropic Setup Guide',
      description: 'How to set up Anthropic as your AI provider',
      content: `# Setting up Anthropic

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

[Sign up](https://console.anthropic.com/signup) | [Pricing](https://anthropic.com/pricing)`,
      tags: ['anthropic', 'claude', 'provider', 'setup'],
    },
    {
      id: 'guide_openai',
      title: 'OpenAI Setup Guide',
      description: 'How to set up OpenAI as your AI provider',
      content: `# Setting up OpenAI

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

[Sign up](https://platform.openai.com/signup) | [Pricing](https://openai.com/pricing)`,
      tags: ['openai', 'gpt', 'provider', 'setup'],
    },
    {
      id: 'guide_google',
      title: 'Google AI Setup Guide',
      description: 'How to set up Google AI as your AI provider',
      content: `# Setting up Google AI

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

[Sign up](https://aistudio.google.com) | [Pricing](https://ai.google.dev/pricing)`,
      tags: ['google', 'gemini', 'provider', 'setup'],
    },
  ];
  
  for (const guide of guides) {
    try {
      const existing = await knowledgeService.getById(guide.id);
      
      const docData = {
        category: 'provider_guide' as const,
        title: guide.title,
        description: guide.description,
        content: guide.content,
        tags: guide.tags,
        applicableTo: null,
        metadata: {},
      };
      
      if (existing) {
        await knowledgeService.update(guide.id, docData);
        result.updated++;
      } else {
        await knowledgeService.create(docData);
        result.created++;
      }
    } catch (error) {
      result.errors.push(`Failed to seed provider guide ${guide.id}: ${error}`);
    }
  }
}

function generateIdFromFile(category: string, file: string): string {
  const prefixMap: Record<string, string> = {
    'project_template': 'tpl',
    'agent_pattern': 'agent',
    'command_template': 'cmd',
    'tool_template': 'tool',
    'plugin_template': 'plugin',
    'mcp_template': 'mcp',
  };
  const prefix = prefixMap[category] || 'doc';
  const name = basename(file, '.md').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return `${prefix}_${name}`;
}

// Run if called directly
if (import.meta.main) {
  seedKnowledgeBase()
    .then(result => {
      console.log('Seeding complete:', result);
      process.exit(result.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
```

**Add to package.json:**

```json
{
  "scripts": {
    "seed:knowledge": "bun run src/scripts/seed-knowledge.ts"
  }
}
```

**Checklist:**
- [ ] Write tests for seed script (RED)
- [ ] Install `gray-matter` package
- [ ] Implement seed script (GREEN)
- [ ] Test seeding with sample files
- [ ] Add npm script

---

## Phase 2: MCP Server & API Routes

### 2.1 Create MCP Knowledge Endpoint

**File:** `apps/api/src/routes/mcp-knowledge.ts`

Implements the MCP endpoint with these tools:
- `search_knowledge`
- `get_project_template`
- `get_agent_pattern`
- `get_command_template`
- `list_project_types`
- `get_available_models`
- `get_provider_setup_guide`

### 2.2 Create Onboarding API Routes

**File:** `apps/api/src/routes/onboarding.ts`

Endpoints:
- `GET /api/onboarding/status/:sandboxId` - Check if sandbox needs onboarding
- `POST /api/onboarding/start` - Start onboarding session
- `GET /api/onboarding/session/:id` - Get session details
- `PATCH /api/onboarding/session/:id` - Update session
- `POST /api/onboarding/session/:id/skip` - Skip onboarding
- `POST /api/onboarding/session/:id/complete` - Mark complete
- `POST /api/onboarding/session/:id/reset` - Reset for re-onboarding

### 2.3 Create Knowledge Admin API (Optional)

**File:** `apps/api/src/routes/knowledge.ts`

For managing knowledge base documents via API.

---

## Phase 3: Container Integration

### 3.1 Create Agent Definitions

**File:** `docker/base/scripts/agents/onboarding.md`

The onboarding agent that interviews users.

**File:** `docker/base/scripts/agents/workspace.md`

The workspace maintenance agent that's always present but dormant until onboarding completes.

### 3.2 Update Container Entrypoint

Modify `docker/base/entrypoint.sh` to:
1. Always inject `@workspace` agent
2. Inject `@onboarding` agent when `ONBOARDING_MODE=true`
3. Configure MCP connection to Management API

### 3.3 Update Sandbox Manager

Modify `apps/api/src/services/sandbox-manager.ts` to:
1. Create onboarding session when sandbox is created
2. Pass `ONBOARDING_MODE=true` to container
3. Handle onboarding completion callbacks

---

## Phase 4: Frontend Integration

### 4.1 Create Onboarding Store

**File:** `apps/frontend/src/lib/stores/onboarding.ts`

Svelte stores for:
- `onboardingSession` - Current session state
- `showOnboardingPrompt` - Control prompt visibility

### 4.2 Create UI Components

**File:** `apps/frontend/src/lib/components/OnboardingPrompt.svelte`

Modal that shows when sandbox is ready and needs onboarding:
- "Start Setup" button → sends initial message
- "Skip for now" button → marks session as skipped

### 4.3 Handle Agent Transition

When onboarding completes:
1. Update session status to 'completed'
2. UI shows completion message
3. `@workspace` agent becomes active for future requests

---

## Testing Strategy (TDD)

Each phase follows Red-Green-Refactor:

### Phase 1 Tests

```
tests/
├── unit/
│   ├── services/
│   │   ├── knowledge-service.test.ts
│   │   ├── onboarding-service.test.ts
│   │   └── model-selection-service.test.ts
│   └── db/
│       └── vector.test.ts
└── integration/
    └── onboarding-flow.test.ts
```

### Phase 2 Tests

```
tests/
├── unit/
│   └── routes/
│       ├── mcp-knowledge.test.ts
│       └── onboarding.test.ts
└── integration/
    └── mcp-tools.test.ts
```

### Phase 3 Tests

```
tests/
└── integration/
    ├── container-onboarding.test.ts
    └── sandbox-lifecycle.test.ts
```

### Phase 4 Tests

```
tests/
└── e2e/
    └── onboarding-flow.test.ts
```

---

## File Changes Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| **1** | `apps/api/src/db/vector.ts`<br>`apps/api/src/services/knowledge-service.ts`<br>`apps/api/src/services/onboarding-service.ts`<br>`apps/api/src/services/model-selection-service.ts`<br>`apps/api/src/scripts/seed-knowledge.ts`<br>`packages/types/src/onboarding.ts` | `apps/api/src/db/migrations.ts`<br>`packages/types/src/index.ts`<br>`apps/api/package.json` |
| **2** | `apps/api/src/routes/mcp-knowledge.ts`<br>`apps/api/src/routes/onboarding.ts`<br>`apps/api/src/routes/knowledge.ts` | `apps/api/src/index.ts` |
| **3** | `docker/base/scripts/agents/onboarding.md`<br>`docker/base/scripts/agents/workspace.md` | `docker/base/entrypoint.sh`<br>`apps/api/src/services/sandbox-manager.ts` |
| **4** | `apps/frontend/src/lib/stores/onboarding.ts`<br>`apps/frontend/src/lib/components/OnboardingPrompt.svelte` | Chat UI components |

---

## Estimated Effort (Updated)

| Phase | Tasks | Effort |
|-------|-------|--------|
| **Phase 1** | Vector search, DB migration, types, services, seeding | 3-4 days |
| **Phase 2** | MCP endpoint, API routes, model tools | 2-3 days |
| **Phase 3** | Agent definitions, container integration | 2-3 days |
| **Phase 4** | Frontend UI, store, polish | 2-3 days |

**Total: 9-13 days**

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Framework | OpenCode native agent |
| First message trigger | UI prompt |
| Onboarding scope | Once per sandbox |
| Post-onboarding | `@workspace` agent (always present, dormant until needed) |
| Re-onboarding | Ask user (wipe vs merge) |
| Vector search | sqlite-vec in Phase 1 |
| Knowledge seeding | Manual command, automated later |
| Testing | TDD approach |

---

## Next Steps

1. Start Phase 1 with TDD approach
2. Write tests for vector.ts (RED)
3. Implement vector search (GREEN)
4. Continue with knowledge and onboarding services
