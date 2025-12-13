# Implementation Phases

Step-by-step guide to implementing the Onboarding Agent System for AgentPod.

## Overview

The implementation is divided into 4 phases:

| Phase | Focus | Effort | Dependencies |
|-------|-------|--------|--------------|
| Phase 1 | Database & Knowledge Service | 2-3 days | None |
| Phase 2 | MCP Server & API Routes | 2-3 days | Phase 1 |
| Phase 3 | Container Integration | 1-2 days | Phase 2 |
| Phase 4 | Onboarding Agent & Polish | 2-3 days | Phase 3 |

**Total Estimated Effort:** 7-11 days

## Phase 1: Database & Knowledge Service

### 1.1 Add Database Migration

Create a new migration for the onboarding tables.

**File:** `apps/api/src/db/migrations.ts`

Add a new migration function:

```typescript
// Migration 16: Add onboarding system tables
function migration16_onboarding_system(db: Database) {
  console.log("Running migration 16: onboarding system tables");
  
  // Knowledge documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK(category IN (
        'project_template',
        'agent_pattern',
        'command_template',
        'tool_template',
        'workflow_pattern',
        'best_practice'
      )),
      title TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      tags TEXT,
      applicable_to TEXT,
      metadata TEXT,
      embedding BLOB,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_knowledge_category 
      ON knowledge_documents(category);
    CREATE INDEX IF NOT EXISTS idx_knowledge_updated 
      ON knowledge_documents(updated_at DESC);
  `);
  
  // Onboarding sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sandbox_id TEXT,
      status TEXT NOT NULL DEFAULT 'started' CHECK(status IN (
        'started', 'gathering', 'generating', 'applying', 
        'completed', 'skipped', 'failed'
      )),
      project_type TEXT,
      project_name TEXT,
      project_description TEXT,
      gathered_requirements TEXT,
      generated_config TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
      FOREIGN KEY (sandbox_id) REFERENCES sandboxes(id) ON DELETE SET NULL
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
  `);
}
```

**Checklist:**
- [ ] Add migration function
- [ ] Update migration array to include migration 16
- [ ] Test migration runs without errors
- [ ] Verify tables created correctly

### 1.2 Create TypeScript Types

**File:** `packages/types/src/onboarding.ts`

```typescript
// Knowledge Document Types
export type KnowledgeCategory = 
  | 'project_template'
  | 'agent_pattern'
  | 'command_template'
  | 'tool_template'
  | 'workflow_pattern'
  | 'best_practice';

export interface KnowledgeDocument {
  id: string;
  category: KnowledgeCategory;
  title: string;
  description: string | null;
  content: string;
  tags: string[];
  applicableTo: string[] | null;
  metadata: Record<string, unknown>;
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
}

// Onboarding Session Types
export type OnboardingStatus = 
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
  gatheredRequirements: Record<string, unknown> | null;
  generatedConfig: GeneratedConfig | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface GeneratedConfig {
  opencodeJson: Record<string, unknown>;
  agentsMd: string;
  agents: Array<{ name: string; content: string }>;
  commands: Array<{ name: string; content: string }>;
  tools: Array<{ name: string; content: string }>;
  folderStructure: string[];
}

export interface CreateOnboardingSessionParams {
  userId: string;
  sandboxId?: string;
}

export interface UpdateOnboardingSessionParams {
  status?: OnboardingStatus;
  projectType?: string;
  projectName?: string;
  projectDescription?: string;
  gatheredRequirements?: Record<string, unknown>;
  generatedConfig?: GeneratedConfig;
  errorMessage?: string;
}
```

**Checklist:**
- [ ] Create types file
- [ ] Export from `packages/types/src/index.ts`
- [ ] Run type check to verify no errors

### 1.3 Create Knowledge Service

**File:** `apps/api/src/services/knowledge-service.ts`

```typescript
import { db } from "../db";
import { nanoid } from "nanoid";
import type {
  KnowledgeDocument,
  KnowledgeSearchParams,
  KnowledgeCategory,
} from "@agentpod/types";

export class KnowledgeService {
  /**
   * Search knowledge documents with filtering
   */
  async search(params: KnowledgeSearchParams): Promise<KnowledgeDocument[]> {
    const { query, category, tags, applicableTo, limit = 10 } = params;
    
    let sql = "SELECT * FROM knowledge_documents WHERE 1=1";
    const bindings: unknown[] = [];
    
    if (category) {
      sql += " AND category = ?";
      bindings.push(category);
    }
    
    if (tags && tags.length > 0) {
      // Match any of the provided tags
      const tagConditions = tags.map(() => "tags LIKE ?").join(" OR ");
      sql += ` AND (${tagConditions})`;
      tags.forEach(tag => bindings.push(`%"${tag}"%`));
    }
    
    if (applicableTo) {
      sql += " AND (applicable_to IS NULL OR applicable_to LIKE ?)";
      bindings.push(`%"${applicableTo}"%`);
    }
    
    if (query) {
      // Simple text search on title, description, and content
      sql += " AND (title LIKE ? OR description LIKE ? OR content LIKE ?)";
      const searchPattern = `%${query}%`;
      bindings.push(searchPattern, searchPattern, searchPattern);
    }
    
    sql += " ORDER BY updated_at DESC LIMIT ?";
    bindings.push(limit);
    
    const stmt = db.prepare(sql);
    const rows = stmt.all(...bindings) as any[];
    
    return rows.map(this.rowToDocument);
  }

  /**
   * Get a single document by ID
   */
  async getById(id: string): Promise<KnowledgeDocument | null> {
    const stmt = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?");
    const row = stmt.get(id) as any;
    return row ? this.rowToDocument(row) : null;
  }

  /**
   * Get documents by category
   */
  async getByCategory(category: KnowledgeCategory): Promise<KnowledgeDocument[]> {
    const stmt = db.prepare(
      "SELECT * FROM knowledge_documents WHERE category = ? ORDER BY title"
    );
    const rows = stmt.all(category) as any[];
    return rows.map(this.rowToDocument);
  }

  /**
   * Create a new document
   */
  async create(doc: Omit<KnowledgeDocument, "id" | "createdAt" | "updatedAt" | "version">): Promise<KnowledgeDocument> {
    // Use consistent prefixes that match retrieval expectations
    const prefixMap: Record<string, string> = {
      'project_template': 'tpl',
      'agent_pattern': 'agent',
      'command_template': 'cmd',
      'tool_template': 'tool',
      'workflow_pattern': 'wf',
      'best_practice': 'bp',
    };
    const prefix = prefixMap[doc.category] || doc.category.slice(0, 3);
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
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push("description = ?");
      values.push(updates.description);
    }
    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
      fields.push("version = version + 1");
    }
    if (updates.tags !== undefined) {
      fields.push("tags = ?");
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.applicableTo !== undefined) {
      fields.push("applicable_to = ?");
      values.push(updates.applicableTo ? JSON.stringify(updates.applicableTo) : null);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }
    
    if (fields.length === 0) return existing;
    
    values.push(id);
    const stmt = db.prepare(
      `UPDATE knowledge_documents SET ${fields.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);
    
    return this.getById(id);
  }

  /**
   * Delete a document
   */
  async delete(id: string): Promise<boolean> {
    const stmt = db.prepare("DELETE FROM knowledge_documents WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * List all project types (templates)
   */
  async listProjectTypes(): Promise<Array<{ id: string; title: string; description: string }>> {
    const templates = await this.getByCategory("project_template");
    return templates.map(t => ({
      id: t.id.replace(/^tpl_/, ""),  // Remove tpl_ prefix for cleaner display
      title: t.title,
      description: t.description || "",
    }));
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
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const knowledgeService = new KnowledgeService();
```

**Checklist:**
- [ ] Create knowledge service file
- [ ] Add unit tests for service methods
- [ ] Test search functionality
- [ ] Test CRUD operations

### 1.4 Create Onboarding Service

**File:** `apps/api/src/services/onboarding-service.ts`

```typescript
import { db } from "../db";
import { nanoid } from "nanoid";
import type {
  OnboardingSession,
  OnboardingStatus,
  CreateOnboardingSessionParams,
  UpdateOnboardingSessionParams,
} from "@agentpod/types";

export class OnboardingService {
  /**
   * Check if user needs onboarding (hasn't completed one yet)
   */
  async needsOnboarding(userId: string): Promise<boolean> {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM onboarding_sessions 
      WHERE user_id = ? AND status IN ('completed', 'skipped')
    `);
    const result = stmt.get(userId) as { count: number };
    return result.count === 0;
  }

  /**
   * Get active session for user (if any)
   */
  async getActiveSession(userId: string): Promise<OnboardingSession | null> {
    const stmt = db.prepare(`
      SELECT * FROM onboarding_sessions 
      WHERE user_id = ? AND status IN ('started', 'gathering', 'generating', 'applying')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(userId) as any;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * Create a new onboarding session
   */
  async createSession(params: CreateOnboardingSessionParams): Promise<OnboardingSession> {
    const id = `onb_${nanoid(12)}`;
    
    const stmt = db.prepare(`
      INSERT INTO onboarding_sessions (id, user_id, sandbox_id, status)
      VALUES (?, ?, ?, 'started')
    `);
    
    stmt.run(id, params.userId, params.sandboxId || null);
    
    return this.getSessionById(id) as Promise<OnboardingSession>;
  }

  /**
   * Get session by ID
   */
  async getSessionById(id: string): Promise<OnboardingSession | null> {
    const stmt = db.prepare("SELECT * FROM onboarding_sessions WHERE id = ?");
    const row = stmt.get(id) as any;
    return row ? this.rowToSession(row) : null;
  }

  /**
   * Get session by sandbox ID
   */
  async getSessionBySandboxId(sandboxId: string): Promise<OnboardingSession | null> {
    const stmt = db.prepare("SELECT * FROM onboarding_sessions WHERE sandbox_id = ?");
    const row = stmt.get(sandboxId) as any;
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
      fields.push("status = ?");
      values.push(updates.status);
      
      if (updates.status === "completed" || updates.status === "skipped") {
        fields.push("completed_at = CURRENT_TIMESTAMP");
      }
    }
    if (updates.projectType !== undefined) {
      fields.push("project_type = ?");
      values.push(updates.projectType);
    }
    if (updates.projectName !== undefined) {
      fields.push("project_name = ?");
      values.push(updates.projectName);
    }
    if (updates.projectDescription !== undefined) {
      fields.push("project_description = ?");
      values.push(updates.projectDescription);
    }
    if (updates.gatheredRequirements !== undefined) {
      fields.push("gathered_requirements = ?");
      values.push(JSON.stringify(updates.gatheredRequirements));
    }
    if (updates.generatedConfig !== undefined) {
      fields.push("generated_config = ?");
      values.push(JSON.stringify(updates.generatedConfig));
    }
    if (updates.errorMessage !== undefined) {
      fields.push("error_message = ?");
      values.push(updates.errorMessage);
    }
    
    if (fields.length === 0) return existing;
    
    values.push(id);
    const stmt = db.prepare(
      `UPDATE onboarding_sessions SET ${fields.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);
    
    return this.getSessionById(id);
  }

  /**
   * Skip onboarding for a session
   */
  async skipSession(id: string): Promise<OnboardingSession | null> {
    return this.updateSession(id, { status: "skipped" });
  }

  /**
   * Mark session as complete
   */
  async completeSession(id: string): Promise<OnboardingSession | null> {
    return this.updateSession(id, { status: "completed" });
  }

  /**
   * Mark session as failed
   */
  async failSession(id: string, errorMessage: string): Promise<OnboardingSession | null> {
    return this.updateSession(id, { 
      status: "failed", 
      errorMessage 
    });
  }

  /**
   * Get user's onboarding history
   */
  async getUserHistory(userId: string): Promise<OnboardingSession[]> {
    const stmt = db.prepare(`
      SELECT * FROM onboarding_sessions 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(this.rowToSession);
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
- [ ] Create onboarding service file
- [ ] Add unit tests
- [ ] Test session lifecycle (create -> update -> complete)

### 1.5 Seed Knowledge Base

**File:** `apps/api/src/scripts/seed-knowledge.ts`

```typescript
import { knowledgeService } from "../services/knowledge-service";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

const KNOWLEDGE_BASE_PATH = join(
  __dirname, 
  "../../../../docs/onboarding-system/knowledge-base"
);

async function seedKnowledgeBase() {
  console.log("Seeding knowledge base...");
  
  // Seed project templates
  await seedCategory("project-templates", "project_template");
  
  // Seed agent patterns
  await seedCategory("agent-patterns", "agent_pattern");
  
  // Seed command templates
  await seedCategory("command-templates", "command_template");
  
  // Seed tool templates (TypeScript files)
  await seedToolTemplates();
  
  console.log("Knowledge base seeding complete!");
}

async function seedCategory(directory: string, category: string) {
  const dirPath = join(KNOWLEDGE_BASE_PATH, directory);
  const files = readdirSync(dirPath).filter(f => f.endsWith(".md"));
  
  for (const file of files) {
    const filePath = join(dirPath, file);
    const content = readFileSync(filePath, "utf-8");
    const { data: frontmatter, content: body } = matter(content);
    
    if (!frontmatter.id) {
      console.warn(`Skipping ${file}: no id in frontmatter`);
      continue;
    }
    
    // Check if document already exists
    const existing = await knowledgeService.getById(frontmatter.id);
    if (existing) {
      console.log(`Updating: ${frontmatter.id}`);
      await knowledgeService.update(frontmatter.id, {
        title: frontmatter.title,
        description: frontmatter.description,
        content: body,
        tags: frontmatter.tags || [],
        applicableTo: frontmatter.applicable_to || null,
        metadata: frontmatter.metadata || {},
      });
    } else {
      console.log(`Creating: ${frontmatter.id}`);
      await knowledgeService.create({
        category: category as any,
        title: frontmatter.title,
        description: frontmatter.description,
        content: body,
        tags: frontmatter.tags || [],
        applicableTo: frontmatter.applicable_to || null,
        metadata: frontmatter.metadata || {},
      });
    }
  }
}

async function seedToolTemplates() {
  const dirPath = join(KNOWLEDGE_BASE_PATH, "tool-templates");
  const files = readdirSync(dirPath).filter(f => f.endsWith(".ts"));
  
  for (const file of files) {
    const filePath = join(dirPath, file);
    const content = readFileSync(filePath, "utf-8");
    
    // Parse JSDoc comments for metadata
    const idMatch = content.match(/@id\s+(\S+)/);
    const titleMatch = content.match(/@title\s+(.+)/);
    const descMatch = content.match(/@description\s+(.+)/);
    const tagsMatch = content.match(/@tags\s+\[([^\]]+)\]/);
    const applicableMatch = content.match(/@applicable_to\s+\[([^\]]+)\]/);
    
    if (!idMatch) {
      console.warn(`Skipping ${file}: no @id in comments`);
      continue;
    }
    
    const id = idMatch[1];
    const title = titleMatch?.[1] || file.replace(".ts", "");
    const description = descMatch?.[1] || "";
    const tags = tagsMatch?.[1].split(",").map(t => t.trim().replace(/"/g, "")) || [];
    const applicableTo = applicableMatch?.[1].split(",").map(t => t.trim().replace(/"/g, "")) || null;
    
    const existing = await knowledgeService.getById(id);
    if (existing) {
      console.log(`Updating: ${id}`);
      await knowledgeService.update(id, {
        title,
        description,
        content,
        tags,
        applicableTo,
      });
    } else {
      console.log(`Creating: ${id}`);
      await knowledgeService.create({
        category: "tool_template",
        title,
        description,
        content,
        tags,
        applicableTo,
        metadata: {},
      });
    }
  }
}

// Run if called directly
seedKnowledgeBase().catch(console.error);
```

**Checklist:**
- [ ] Create seed script
- [ ] Install `gray-matter` package: `pnpm add gray-matter -F api`
- [ ] Add npm script: `"seed:knowledge": "bun run src/scripts/seed-knowledge.ts"`
- [ ] Run seed script and verify data

---

## Phase 2: MCP Server & API Routes

### 2.1 Create MCP Knowledge Endpoint

**File:** `apps/api/src/routes/mcp-knowledge.ts`

```typescript
import { Hono } from "hono";
import { knowledgeService } from "../services/knowledge-service";

// MCP tool schemas
const TOOLS = {
  search_knowledge: {
    name: "search_knowledge",
    description: "Search the knowledge base for templates, patterns, and guides",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        category: { 
          type: "string", 
          enum: ["project_template", "agent_pattern", "command_template", "tool_template", "workflow_pattern", "best_practice"],
          description: "Filter by category"
        },
        tags: { 
          type: "array", 
          items: { type: "string" },
          description: "Filter by tags"
        },
        limit: { 
          type: "number", 
          description: "Max results (default: 10)" 
        },
      },
    },
  },
  get_project_template: {
    name: "get_project_template",
    description: "Get a full project template by type",
    inputSchema: {
      type: "object",
      properties: {
        project_type: { 
          type: "string", 
          description: "Project type ID (e.g., 'web_app', 'api_service')" 
        },
      },
      required: ["project_type"],
    },
  },
  get_agent_pattern: {
    name: "get_agent_pattern",
    description: "Get an agent pattern by role",
    inputSchema: {
      type: "object",
      properties: {
        role: { 
          type: "string", 
          description: "Agent role (e.g., 'code_reviewer', 'editor')" 
        },
      },
      required: ["role"],
    },
  },
  get_command_template: {
    name: "get_command_template",
    description: "Get a command template by name",
    inputSchema: {
      type: "object",
      properties: {
        name: { 
          type: "string", 
          description: "Command name (e.g., 'review', 'test', 'plan')" 
        },
      },
      required: ["name"],
    },
  },
  list_project_types: {
    name: "list_project_types",
    description: "List all available project types",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
};

const mcpKnowledge = new Hono();

// MCP tools/list endpoint
mcpKnowledge.post("/", async (c) => {
  const body = await c.req.json();
  const { method, params, id } = body;

  try {
    switch (method) {
      case "tools/list":
        return c.json({
          jsonrpc: "2.0",
          id,
          result: { tools: Object.values(TOOLS) },
        });

      case "tools/call":
        const result = await handleToolCall(params.name, params.arguments);
        return c.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        });

      default:
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown method: ${method}` },
        });
    }
  } catch (error) {
    return c.json({
      jsonrpc: "2.0",
      id,
      error: { 
        code: -32603, 
        message: error instanceof Error ? error.message : "Internal error" 
      },
    });
  }
});

async function handleToolCall(toolName: string, args: any) {
  switch (toolName) {
    case "search_knowledge":
      return knowledgeService.search({
        query: args.query,
        category: args.category,
        tags: args.tags,
        limit: args.limit,
      });

    case "get_project_template":
      const template = await knowledgeService.getById(`tpl_${args.project_type}`);
      if (!template) {
        throw new Error(`Project template not found: ${args.project_type}`);
      }
      return template;

    case "get_agent_pattern":
      const agent = await knowledgeService.getById(`agent_${args.role}`);
      if (!agent) {
        throw new Error(`Agent pattern not found: ${args.role}`);
      }
      return agent;

    case "get_command_template":
      const command = await knowledgeService.getById(`cmd_${args.name}`);
      if (!command) {
        throw new Error(`Command template not found: ${args.name}`);
      }
      return command;

    case "list_project_types":
      return knowledgeService.listProjectTypes();

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export default mcpKnowledge;
```

**Checklist:**
- [ ] Create MCP endpoint file
- [ ] Register route in main app: `app.route("/api/mcp/knowledge", mcpKnowledge)`
- [ ] Test with curl or Postman
- [ ] Add authentication middleware

### 2.2 Create Onboarding API Routes

**File:** `apps/api/src/routes/onboarding.ts`

```typescript
import { Hono } from "hono";
import { onboardingService } from "../services/onboarding-service";
import { authMiddleware } from "../auth/middleware";

const onboarding = new Hono();

// Require authentication for all routes
onboarding.use("/*", authMiddleware);

// Check if user needs onboarding
onboarding.get("/status", async (c) => {
  const userId = c.get("userId");
  const needs = await onboardingService.needsOnboarding(userId);
  const active = await onboardingService.getActiveSession(userId);
  
  return c.json({
    needsOnboarding: needs,
    activeSession: active,
  });
});

// Start new onboarding session
onboarding.post("/start", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  
  // Check for existing active session
  const existing = await onboardingService.getActiveSession(userId);
  if (existing) {
    return c.json({ session: existing });
  }
  
  const session = await onboardingService.createSession({
    userId,
    sandboxId: body.sandboxId,
  });
  
  return c.json({ session }, 201);
});

// Get session by ID
onboarding.get("/session/:id", async (c) => {
  const session = await onboardingService.getSessionById(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  
  // Verify ownership
  const userId = c.get("userId");
  if (session.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  
  return c.json({ session });
});

// Update session
onboarding.patch("/session/:id", async (c) => {
  const session = await onboardingService.getSessionById(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  
  const userId = c.get("userId");
  if (session.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  
  const body = await c.req.json();
  const updated = await onboardingService.updateSession(session.id, body);
  
  return c.json({ session: updated });
});

// Skip onboarding
onboarding.post("/session/:id/skip", async (c) => {
  const session = await onboardingService.getSessionById(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  
  const userId = c.get("userId");
  if (session.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  
  const updated = await onboardingService.skipSession(session.id);
  return c.json({ session: updated });
});

// Complete onboarding
onboarding.post("/session/:id/complete", async (c) => {
  const session = await onboardingService.getSessionById(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  
  const userId = c.get("userId");
  if (session.userId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  
  const updated = await onboardingService.completeSession(session.id);
  return c.json({ session: updated });
});

// Get user's onboarding history
onboarding.get("/history", async (c) => {
  const userId = c.get("userId");
  const sessions = await onboardingService.getUserHistory(userId);
  return c.json({ sessions });
});

export default onboarding;
```

**Checklist:**
- [ ] Create onboarding routes file
- [ ] Register route in main app: `app.route("/api/onboarding", onboarding)`
- [ ] Add integration tests
- [ ] Test all endpoints

### 2.3 Create Knowledge Admin API

**File:** `apps/api/src/routes/knowledge.ts`

```typescript
import { Hono } from "hono";
import { knowledgeService } from "../services/knowledge-service";
import { authMiddleware, adminMiddleware } from "../auth/middleware";

const knowledge = new Hono();

// Public routes (authenticated)
knowledge.use("/*", authMiddleware);

// Search knowledge base
knowledge.post("/search", async (c) => {
  const body = await c.req.json();
  const results = await knowledgeService.search(body);
  return c.json({ results });
});

// Get document by ID
knowledge.get("/:id", async (c) => {
  const doc = await knowledgeService.getById(c.req.param("id"));
  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }
  return c.json({ document: doc });
});

// List documents by category
knowledge.get("/category/:category", async (c) => {
  const docs = await knowledgeService.getByCategory(c.req.param("category") as any);
  return c.json({ documents: docs });
});

// Admin routes
knowledge.use("/admin/*", adminMiddleware);

// Create document (admin)
knowledge.post("/admin/create", async (c) => {
  const body = await c.req.json();
  const doc = await knowledgeService.create(body);
  return c.json({ document: doc }, 201);
});

// Update document (admin)
knowledge.put("/admin/:id", async (c) => {
  const body = await c.req.json();
  const doc = await knowledgeService.update(c.req.param("id"), body);
  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }
  return c.json({ document: doc });
});

// Delete document (admin)
knowledge.delete("/admin/:id", async (c) => {
  const deleted = await knowledgeService.delete(c.req.param("id"));
  if (!deleted) {
    return c.json({ error: "Document not found" }, 404);
  }
  return c.json({ success: true });
});

export default knowledge;
```

**Checklist:**
- [ ] Create knowledge routes file
- [ ] Register route: `app.route("/api/knowledge", knowledge)`
- [ ] Add admin middleware (or create if not exists)
- [ ] Test admin endpoints

---

## Phase 3: Container Integration

### 3.1 Create Onboarding Agent Content

**File:** `docker/base/scripts/onboarding-agent.md`

This file contains the agent definition that will be injected into containers.

```markdown
---
description: Helps set up your workspace through a conversational interview
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.7
tools:
  write: true
  edit: true
  bash: false
  agentpod_knowledge_*: true
---

# Onboarding Agent

You are the AgentPod Onboarding Agent. Your job is to help users set up their workspace through a friendly, conversational interview.

## Your Goal

Guide users through setting up their workspace by:
1. Understanding what kind of project they want to work on
2. Gathering their preferences and requirements
3. Generating appropriate configuration files

## Interview Process

### Step 1: Welcome & Project Type
Start by welcoming the user and asking about their project:

"Welcome to AgentPod! I'm here to help you set up your workspace.

What kind of project would you like to work on? Here are some examples:
- **Web Application** (React, Vue, Angular, etc.)
- **API Service** (REST, GraphQL backends)
- **Book/Writing Project** (documentation, books, blogs)
- **Research Project** (analysis, data exploration)
- Or describe something else!"

### Step 2: Gather Requirements
Based on the project type, ask relevant questions:

**For Coding Projects:**
- What programming language/framework?
- What's your experience level?
- Working solo or with a team?
- What tools do you use? (GitHub, VSCode, etc.)

**For Writing Projects:**
- What are you writing? (book, documentation, blog)
- What tone? (formal, casual, technical)
- Target audience?
- Any specific style guide?

**For Research:**
- What topic are you researching?
- What sources do you need? (academic, web, books)
- Output format? (report, presentation, notes)

### Step 3: Use Knowledge Base
Use the MCP tools to find relevant templates:

1. `list_project_types` - Show available templates
2. `search_knowledge` - Find relevant patterns
3. `get_project_template` - Get full template details
4. `get_agent_pattern` - Get recommended agents
5. `get_command_template` - Get useful commands

### Step 4: Generate Configuration
Create the workspace configuration:

1. **opencode.json** - Project settings and MCP connections
2. **AGENTS.md** - Project-specific instructions
3. **.opencode/agent/*.md** - Custom agents for their workflow
4. **.opencode/command/*.md** - Custom commands

### Step 5: Confirm & Apply
Show the user what will be created and ask for confirmation before writing files.

## Guidelines

- Be conversational and friendly
- Don't overwhelm with too many questions at once
- Offer suggestions based on their responses
- Explain WHY you're recommending certain configurations
- Allow users to customize or skip recommendations

## Available MCP Tools

You have access to these tools via the `agentpod_knowledge` MCP server:

- `search_knowledge(query, category?, tags?, limit?)` - Search for templates and patterns
- `get_project_template(project_type)` - Get a full project template
- `get_agent_pattern(role)` - Get an agent definition
- `get_command_template(name)` - Get a command definition
- `list_project_types()` - List all available project types

## Output Format

When generating configuration files, use this format:

```
I'll create the following files for your workspace:

1. **opencode.json** - Main configuration
2. **AGENTS.md** - Project instructions
3. **.opencode/agent/reviewer.md** - Code reviewer agent

Shall I proceed with creating these files?
```

Then, after confirmation, use the write tool to create each file.
```

**Checklist:**
- [ ] Create onboarding agent markdown file
- [ ] Review and refine prompts
- [ ] Test agent behavior manually

### 3.2 Update Container Entrypoint

**File:** `docker/base/entrypoint.sh`

Add onboarding detection and setup:

```bash
#!/bin/bash
set -e

# ... existing setup code ...

# =============================================================================
# Onboarding Setup
# =============================================================================

setup_onboarding() {
  echo "Setting up onboarding mode..."
  
  # Create .opencode directory
  mkdir -p /home/developer/workspace/.opencode/agent
  
  # Write onboarding agent from environment variable or default
  if [ -n "$ONBOARDING_AGENT_CONTENT" ]; then
    echo "$ONBOARDING_AGENT_CONTENT" > /home/developer/workspace/.opencode/agent/onboarding.md
  else
    # Fallback to bundled agent file
    cp /opt/agentpod/onboarding-agent.md /home/developer/workspace/.opencode/agent/onboarding.md
  fi
  
  # Create opencode.json with MCP configuration
  cat > /home/developer/workspace/opencode.json << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": {
    "agentpod_knowledge": {
      "type": "remote",
      "url": "${MANAGEMENT_API_URL}/api/mcp/knowledge",
      "headers": {
        "Authorization": "Bearer ${AGENTPOD_API_TOKEN}"
      }
    }
  },
  "agent": {
    "onboarding": {
      "description": "Helps set up your workspace",
      "path": ".opencode/agent/onboarding.md"
    }
  }
}
EOF
  
  # Create initial AGENTS.md
  cat > /home/developer/workspace/AGENTS.md << EOF
# AgentPod Workspace

Welcome! This workspace is set up for onboarding.

## Getting Started

Talk to the onboarding agent to set up your workspace:

\`\`\`
@onboarding Hi! Help me set up my workspace.
\`\`\`

The agent will guide you through:
1. Understanding your project needs
2. Configuring your workspace
3. Setting up helpful agents and commands

## Skip Onboarding

If you prefer to set up manually, you can skip onboarding and configure
the workspace yourself by editing this file and opencode.json.
EOF
  
  # Set permissions
  chown -R developer:developer /home/developer/workspace/.opencode
  chown developer:developer /home/developer/workspace/opencode.json
  chown developer:developer /home/developer/workspace/AGENTS.md
  
  echo "Onboarding setup complete!"
}

# Check if onboarding mode is enabled
if [ "$ONBOARDING_MODE" = "true" ]; then
  setup_onboarding
fi

# ... rest of entrypoint ...
```

**Checklist:**
- [ ] Update entrypoint.sh with onboarding setup
- [ ] Copy onboarding-agent.md to Docker image
- [ ] Test container starts correctly with onboarding mode
- [ ] Verify files are created with correct permissions

### 3.3 Update Sandbox Manager

**File:** `apps/api/src/services/sandbox-manager.ts`

Add onboarding detection when creating sandboxes:

```typescript
import { onboardingService } from "./onboarding-service";

// In createSandbox method, add:

async createSandbox(userId: string, options: CreateSandboxOptions) {
  // ... existing code ...
  
  // Check if user needs onboarding
  const needsOnboarding = await onboardingService.needsOnboarding(userId);
  
  // Create onboarding session if needed
  let onboardingSession = null;
  if (needsOnboarding && !options.skipOnboarding) {
    onboardingSession = await onboardingService.createSession({
      userId,
      sandboxId: sandboxId, // Will be set after sandbox is created
    });
  }
  
  // Build container environment
  const containerEnv = {
    ...baseEnv,
    ...(onboardingSession ? {
      ONBOARDING_MODE: "true",
      ONBOARDING_SESSION_ID: onboardingSession.id,
      MANAGEMENT_API_URL: config.api.baseUrl,
      AGENTPOD_API_TOKEN: await this.generateSandboxToken(userId, sandboxId),
    } : {}),
  };
  
  // ... rest of container creation ...
  
  // Update onboarding session with sandbox ID
  if (onboardingSession) {
    await onboardingService.updateSession(onboardingSession.id, {
      sandboxId: sandbox.id,
    });
  }
  
  return {
    sandbox,
    onboardingSession,
  };
}
```

**Checklist:**
- [ ] Update sandbox manager with onboarding detection
- [ ] Add `skipOnboarding` option to CreateSandboxOptions
- [ ] Generate sandbox-scoped API token
- [ ] Test sandbox creation with onboarding mode

### 3.4 Update Dockerfile

**File:** `docker/base/Dockerfile`

Add the onboarding agent file:

```dockerfile
# ... existing Dockerfile content ...

# Copy onboarding agent
COPY scripts/onboarding-agent.md /opt/agentpod/onboarding-agent.md

# ... rest of Dockerfile ...
```

**Checklist:**
- [ ] Update Dockerfile
- [ ] Rebuild base image
- [ ] Test image builds correctly

---

## Phase 4: Onboarding Agent & Polish

### 4.1 Refine Onboarding Agent Prompts

Based on testing, refine the onboarding agent to:

1. Handle edge cases (user doesn't know what they want)
2. Provide better suggestions
3. Generate cleaner configuration files
4. Handle errors gracefully

**Testing Scenarios:**
- [ ] User wants a React web app
- [ ] User wants a Python API
- [ ] User wants to write a book
- [ ] User is unsure what they want
- [ ] User wants to skip onboarding
- [ ] User provides incomplete information

### 4.2 Add Session Callbacks

Update the onboarding agent to notify the API of progress:

**File:** `docker/base/scripts/onboarding-callback.sh`

```bash
#!/bin/bash

# Called by onboarding agent to update session status

update_session() {
  local status="$1"
  local data="$2"
  
  curl -X PATCH \
    "${MANAGEMENT_API_URL}/api/onboarding/session/${ONBOARDING_SESSION_ID}" \
    -H "Authorization: Bearer ${AGENTPOD_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"status\": \"${status}\", ${data}}"
}

# Usage:
# onboarding-callback.sh gathering '{"projectType": "web_app"}'
# onboarding-callback.sh generating '{"gatheredRequirements": {...}}'
# onboarding-callback.sh completed '{"generatedConfig": {...}}'

update_session "$1" "$2"
```

**Checklist:**
- [ ] Create callback script
- [ ] Add to container image
- [ ] Test callbacks work correctly
- [ ] Handle network failures gracefully

### 4.3 Add Mobile/Desktop App Integration

Update the frontend to show onboarding status:

**File:** `apps/frontend/src/lib/stores/onboarding.ts`

```typescript
import { writable } from "svelte/store";
import type { OnboardingSession } from "@agentpod/types";

export const onboardingSession = writable<OnboardingSession | null>(null);
export const showOnboardingPrompt = writable(false);

export async function checkOnboardingStatus() {
  const response = await fetch("/api/onboarding/status");
  const { needsOnboarding, activeSession } = await response.json();
  
  if (activeSession) {
    onboardingSession.set(activeSession);
  }
  
  if (needsOnboarding && !activeSession) {
    showOnboardingPrompt.set(true);
  }
}

export async function startOnboarding(sandboxId: string) {
  const response = await fetch("/api/onboarding/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sandboxId }),
  });
  
  const { session } = await response.json();
  onboardingSession.set(session);
  return session;
}

export async function skipOnboarding(sessionId: string) {
  await fetch(`/api/onboarding/session/${sessionId}/skip`, {
    method: "POST",
  });
  onboardingSession.set(null);
  showOnboardingPrompt.set(false);
}
```

**Checklist:**
- [ ] Create onboarding store
- [ ] Add onboarding prompt component
- [ ] Show session status in UI
- [ ] Handle skip/complete actions

### 4.4 Add Monitoring & Logging

Add structured logging for onboarding events:

```typescript
// In onboarding-service.ts
import { logger } from "../utils/logger";

async createSession(params: CreateOnboardingSessionParams) {
  const session = await this._createSession(params);
  
  logger.info("onboarding.session.created", {
    sessionId: session.id,
    userId: session.userId,
    sandboxId: session.sandboxId,
  });
  
  return session;
}

async completeSession(id: string) {
  const session = await this._completeSession(id);
  
  logger.info("onboarding.session.completed", {
    sessionId: session.id,
    userId: session.userId,
    projectType: session.projectType,
    durationMs: Date.now() - new Date(session.createdAt).getTime(),
  });
  
  return session;
}
```

**Checklist:**
- [ ] Add logging to all service methods
- [ ] Add metrics collection
- [ ] Set up dashboards (if applicable)
- [ ] Add error alerting

### 4.5 Write Tests

**Unit Tests:**
- [ ] Knowledge service CRUD operations
- [ ] Onboarding service lifecycle
- [ ] MCP tool handlers

**Integration Tests:**
- [ ] Full onboarding flow
- [ ] API endpoint authentication
- [ ] Container environment setup

**E2E Tests:**
- [ ] User starts sandbox with onboarding
- [ ] User completes onboarding interview
- [ ] User skips onboarding
- [ ] Configuration files are generated correctly

---

## Post-Implementation

### Documentation
- [ ] Update API documentation with new endpoints
- [ ] Add onboarding section to user docs
- [ ] Document knowledge base contribution process

### Deployment
- [ ] Run database migrations in production
- [ ] Seed knowledge base
- [ ] Deploy updated containers
- [ ] Monitor for errors

### Future Improvements
- [ ] Add semantic search with embeddings
- [ ] Add more project templates
- [ ] Add template rating/feedback system
- [ ] Add template versioning
- [ ] Add A/B testing for onboarding prompts
