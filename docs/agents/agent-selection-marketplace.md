# Agent Selection & Marketplace System

**Version**: 1.0.0  
**Last Updated**: December 2025  
**Status**: Implementation Planning

---

## Table of Contents

1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Database Schema](#database-schema)
5. [Implementation Phases](#implementation-phases)
6. [API Specification](#api-specification)
7. [UI Components](#ui-components)
8. [Migration Strategy](#migration-strategy)

---

## Overview

### Vision

Enable users to select and manage AI agents during sandbox creation and throughout the sandbox lifecycle. Agents are organized into squads and can be selected individually or via presets. A marketplace allows users to discover, subscribe to, and manage agents from a catalog.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Central Orchestrator | **Implicit** | Always present in every sandbox, not shown in selection UI |
| Post-creation changes | **Yes** | Users can add/remove agents via sandbox settings |
| Agent Marketplace | **Yes** | Future feature for discovering/adding agents |
| Selection style | **Both** | Quick presets + individual agent toggle |
| Template suggestions | **Yes** | Templates auto-suggest relevant agents |

### Scope

- **Phase 1**: Core agent selection during sandbox creation
- **Phase 2**: Agent management in sandbox settings
- **Phase 3**: Template integration with agent suggestions
- **Phase 4**: Agent marketplace (discovery, subscription, premium agents)

---

## Current State Analysis

### Existing Tables

#### `agent_sessions`
Tracks individual agent session interactions:
```sql
- id, user_id, sandbox_id, chat_session_id
- agent_name, agent_role, agent_squad
- routing_type (single/team/workflow)
- status, message_count
- started_at, ended_at, last_activity_at
```

#### `agent_routing_logs`
Logs routing decisions by Central orchestrator:
```sql
- id, user_id, sandbox_id, session_id
- user_message, routing_type, selected_agents[], workflow_id
- intent (JSONB), reasoning
- processing_time_ms, created_at
```

#### `agent_metrics`
Daily aggregated metrics per agent:
```sql
- id, agent_name, date
- total_sessions, completed_sessions, abandoned_sessions
- total_messages, avg_messages_per_session, avg_session_duration_sec
- routed_from_central, escalated_to_other
```

#### `agent_feedback`
User feedback on agent interactions:
```sql
- id, session_id, user_id, agent_name
- rating, helpful, feedback
```

### Current Agent Storage

Agents are currently stored as **markdown files** in user's OpenCode config directory:
- Seeded via `ensureDefaultAgents()` on user signup
- Stored using `upsertUserOpencodeFile()` 
- Retrieved using `listUserOpencodeFiles()`

**Problem**: No structured database for agent catalog, no per-sandbox agent assignment.

### Built-in Agents (11 total)

| Agent | Role | Squad | Emoji |
|-------|------|-------|-------|
| Central | Orchestrator | orchestration | 🎯 |
| Kai | Lead Code Reviewer | development | 👨‍💻 |
| Dana | Bug Investigator | development | 🔍 |
| Alex | System Architect | development | 🏗️ |
| Tess | QA Lead | development | ✅ |
| Sam | Security Specialist | security | 🔒 |
| Pete | Product Owner | product | 📋 |
| Spencer | Requirements Specialist | product | 📝 |
| River | Roadmap Planner | product | 🗺️ |
| Olivia | Infrastructure Lead | operations | ⚙️ |
| Nora | Communication Hub | operations | 📢 |

---

## Target Architecture

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT ECOSYSTEM                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    AGENT CATALOG (agents table)                         ││
│  │                                                                         ││
│  │   All available agents in the system                                    ││
│  │   • Built-in agents (11 foundation agents)                              ││
│  │   • Marketplace agents (third-party, premium)                           ││
│  │   • Custom user-created agents (future)                                 ││
│  └───────────────────────────────┬─────────────────────────────────────────┘│
│                                  │                                          │
│                    ┌─────────────┴─────────────┐                           │
│                    ▼                           ▼                           │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐          │
│  │     USER AGENT LIBRARY      │ │      AGENT PRESETS          │          │
│  │     (user_agents table)     │ │   (agent_presets table)     │          │
│  │                             │ │                             │          │
│  │ Agents user has access to:  │ │ Quick-select bundles:       │          │
│  │ • Default (given on signup) │ │ • Full Stack Team           │          │
│  │ • Marketplace subscriptions │ │ • Code Review               │          │
│  │ • Custom created            │ │ • Security Audit            │          │
│  └──────────────┬──────────────┘ │ • DevOps                    │          │
│                 │                │ • Solo Developer            │          │
│                 │                └─────────────────────────────┘          │
│                 │                                                          │
│                 ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    SANDBOX AGENT ASSIGNMENT                             ││
│  │                    (sandbox_agents table)                               ││
│  │                                                                         ││
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    ││
│  │   │ Sandbox A   │  │ Sandbox B   │  │ Sandbox C   │                    ││
│  │   │             │  │             │  │             │                    ││
│  │   │ Kai, Dana   │  │ Sam, Alex   │  │ Pete, River │                    ││
│  │   │ Tess, Sam   │  │ Olivia      │  │ Spencer     │                    ││
│  │   │             │  │             │  │             │                    ││
│  │   │ + Central   │  │ + Central   │  │ + Central   │                    ││
│  │   │ (implicit)  │  │ (implicit)  │  │ (implicit)  │                    ││
│  │   └─────────────┘  └─────────────┘  └─────────────┘                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow Diagram: Sandbox Creation with Agent Selection

```
┌──────────────┐
│   User       │
│ creates new  │
│   sandbox    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    SANDBOX CREATION FLOW                      │
│                                                              │
│  Step 1: Provider Selection                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  [Docker]  [Cloudflare]                                │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  Step 2: Project Details                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Name: [___________]                                   │ │
│  │  Description: [___________]                            │ │
│  │  Environment: [JavaScript ▼]                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  Step 3: Agent Selection (NEW)                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │  Quick Select:                                         │ │
│  │  [Full Stack ✓] [Code Review] [Security] [DevOps]     │ │
│  │                                                        │ │
│  │  ▼ Development Squad                                   │ │
│  │    [✓] 👨‍💻 Kai    [✓] 🔍 Dana    [ ] 🏗️ Alex          │ │
│  │    [✓] ✅ Tess   [✓] 🔒 Sam                            │ │
│  │                                                        │ │
│  │  ▶ Product Squad (0 selected)                          │ │
│  │  ▶ Operations Squad (1 selected)                       │ │
│  │                                                        │ │
│  │  Selected: 5 agents                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  Step 4: Create Sandbox                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  [Cancel]                    [Create Project →]        │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    BACKEND PROCESSING                         │
│                                                              │
│  1. Create sandbox record in database                        │
│  2. Create sandbox_agents records for selected agents        │
│  3. Start container with agent configurations                │
│  4. Inject agent markdown files into container               │
│  5. Navigate to chat with agents available                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

#### `agents` - Agent Catalog

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                    -- UUID
  slug VARCHAR(50) UNIQUE NOT NULL,       -- 'kai', 'dana', 'sam'
  name VARCHAR(100) NOT NULL,             -- 'Kai'
  role VARCHAR(200) NOT NULL,             -- 'Lead Code Reviewer'
  emoji VARCHAR(10),                      -- '👨‍💻'
  description TEXT,                       -- Longer description for catalog
  
  -- Organization
  squad VARCHAR(50) NOT NULL,             -- 'development', 'product', 'operations', 'security'
  tier VARCHAR(20) DEFAULT 'foundation',  -- 'central', 'foundation', 'specialized', 'premium'
  
  -- Categorization
  tags TEXT[],                            -- ['code-review', 'typescript', 'best-practices']
  category VARCHAR(50),                   -- 'development', 'security', 'productivity'
  
  -- Availability & Pricing
  is_builtin BOOLEAN DEFAULT true,        -- Built-in vs marketplace
  is_premium BOOLEAN DEFAULT false,       -- Free vs paid
  price_monthly DECIMAL(10,2),            -- Monthly subscription price (if premium)
  price_yearly DECIMAL(10,2),             -- Yearly subscription price (if premium)
  
  -- Publisher info (for marketplace)
  publisher_id TEXT,                      -- User ID of publisher (for marketplace agents)
  publisher_name VARCHAR(200),            -- Display name of publisher
  
  -- Metrics (denormalized for performance)
  install_count INTEGER DEFAULT 0,        -- Total installs
  rating_avg DECIMAL(3,2),                -- Average rating (1-5)
  rating_count INTEGER DEFAULT 0,         -- Number of ratings
  
  -- Config (full agent configuration)
  config JSONB NOT NULL,                  -- Full AgentConfig object
  opencode_content TEXT NOT NULL,         -- Markdown content for OpenCode
  
  -- Status
  status VARCHAR(20) DEFAULT 'active',    -- 'active', 'deprecated', 'hidden', 'pending_review'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agents_squad ON agents(squad);
CREATE INDEX idx_agents_tier ON agents(tier);
CREATE INDEX idx_agents_category ON agents(category);
CREATE INDEX idx_agents_is_builtin ON agents(is_builtin);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_publisher ON agents(publisher_id);
```

#### `user_agents` - User's Agent Library

```sql
CREATE TABLE user_agents (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  
  -- Acquisition
  source VARCHAR(50) DEFAULT 'default',   -- 'default', 'marketplace', 'custom', 'gift'
  
  -- Subscription (for premium agents)
  subscription_status VARCHAR(20),        -- 'active', 'cancelled', 'expired'
  subscription_started_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  subscription_plan VARCHAR(20),          -- 'monthly', 'yearly'
  
  -- User customizations (optional overrides)
  custom_name VARCHAR(100),               -- User's custom name for agent
  custom_config JSONB,                    -- User's config overrides
  
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, agent_id)
);

-- Indexes
CREATE INDEX idx_user_agents_user ON user_agents(user_id);
CREATE INDEX idx_user_agents_source ON user_agents(source);
CREATE INDEX idx_user_agents_subscription ON user_agents(subscription_status);
```

#### `sandbox_agents` - Per-Sandbox Agent Assignment

```sql
CREATE TABLE sandbox_agents (
  id TEXT PRIMARY KEY,                    -- UUID
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  
  -- Per-sandbox settings
  enabled BOOLEAN DEFAULT true,           -- Can be temporarily disabled
  priority INTEGER DEFAULT 0,             -- Order in UI
  settings JSONB,                         -- Per-sandbox agent overrides
  
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by TEXT REFERENCES "user"(id),    -- Who added this agent
  
  UNIQUE(sandbox_id, agent_id)
);

-- Indexes
CREATE INDEX idx_sandbox_agents_sandbox ON sandbox_agents(sandbox_id);
CREATE INDEX idx_sandbox_agents_agent ON sandbox_agents(agent_id);
CREATE INDEX idx_sandbox_agents_enabled ON sandbox_agents(enabled);
```

#### `agent_presets` - Quick Select Bundles

```sql
CREATE TABLE agent_presets (
  id TEXT PRIMARY KEY,                    -- UUID
  slug VARCHAR(50) UNIQUE NOT NULL,       -- 'full-stack', 'code-review'
  name VARCHAR(100) NOT NULL,             -- 'Full Stack Team'
  description TEXT,                       -- 'Complete development coverage'
  icon VARCHAR(50),                       -- Lucide icon name
  
  -- Agents in this preset
  agent_slugs TEXT[] NOT NULL,            -- ['kai', 'dana', 'tess', 'sam', 'olivia']
  
  -- Display
  sort_order INTEGER DEFAULT 0,           -- Order in UI
  is_default BOOLEAN DEFAULT false,       -- Pre-selected for new sandboxes
  is_system BOOLEAN DEFAULT true,         -- System preset vs user-created
  
  -- Ownership (for user-created presets)
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_presets_user ON agent_presets(user_id);
CREATE INDEX idx_agent_presets_is_default ON agent_presets(is_default);
```

#### `agent_reviews` - Marketplace Reviews

```sql
CREATE TABLE agent_reviews (
  id TEXT PRIMARY KEY,                    -- UUID
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(200),
  review TEXT,
  
  -- Moderation
  status VARCHAR(20) DEFAULT 'published', -- 'pending', 'published', 'hidden'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(agent_id, user_id)
);

-- Indexes
CREATE INDEX idx_agent_reviews_agent ON agent_reviews(agent_id);
CREATE INDEX idx_agent_reviews_status ON agent_reviews(status);
```

### Schema Changes Summary

| Table | Action | Purpose |
|-------|--------|---------|
| `agents` | **NEW** | Central agent catalog |
| `user_agents` | **NEW** | User's available agents |
| `sandbox_agents` | **NEW** | Per-sandbox agent assignment |
| `agent_presets` | **NEW** | Quick select bundles |
| `agent_reviews` | **NEW** | Marketplace reviews |
| `sandboxes` | No change | Already exists |
| `agent_sessions` | No change | Already tracks usage |

---

## Implementation Phases

### Phase 1: Core Agent Selection

**Goal**: Enable agent selection during sandbox creation

**Tasks**:
1. Create database migrations for `agents`, `user_agents`, `sandbox_agents`, `agent_presets`
2. Seed built-in agents from `@agentpod/agents/generated`
3. Seed default presets (Full Stack, Code Review, etc.)
4. Update `createSandbox` API to accept `agentIds` or `presetId`
5. Create `AgentSelector` Svelte component
6. Integrate into sandbox creation flow
7. Update agent seeding to use new tables instead of markdown files
8. Filter available agents in chat UI based on sandbox assignment

**Deliverables**:
- New database tables
- Updated API endpoint
- AgentSelector component
- Updated sandbox creation page

### Phase 2: Agent Management

**Goal**: Allow users to manage agents after sandbox creation

**Tasks**:
1. Create API endpoints for add/remove agents from sandbox
2. Create `AgentManager` component for sandbox settings
3. Add "Manage Agents" section to sandbox settings page
4. Implement "Add More Agents" drawer showing user's library
5. Add agent enable/disable toggle per sandbox

**Deliverables**:
- Agent management API
- AgentManager component
- Updated sandbox settings page

### Phase 3: Template Integration

**Goal**: Templates suggest appropriate agents

**Tasks**:
1. Add `suggestedAgentSlugs` to template definitions
2. Auto-select suggested agents when template is chosen
3. Show "Suggested for this template" badge
4. Allow user to customize before creation

**Deliverables**:
- Updated template definitions
- Template-aware agent suggestions

### Phase 4: Agent Marketplace

**Goal**: Full marketplace for agent discovery and subscription

**Tasks**:
1. Create marketplace browse/search UI
2. Create agent detail page with reviews
3. Implement agent installation flow
4. Add premium agent subscription (Stripe integration)
5. Create publisher portal for submitting agents
6. Implement review/rating system
7. Add "My Agents" library management

**Deliverables**:
- Marketplace pages
- Agent detail page
- Subscription system
- Publisher portal
- Review system

---

## API Specification

### Agent Endpoints

#### List Available Agents
```
GET /api/agents
Query: ?squad=development&tier=foundation&search=code
Response: {
  agents: Agent[]
  total: number
}
```

#### Get Agent Details
```
GET /api/agents/:slug
Response: Agent
```

#### List Agent Presets
```
GET /api/agents/presets
Response: {
  presets: AgentPreset[]
}
```

### User Agent Library

#### Get User's Agent Library
```
GET /api/users/me/agents
Response: {
  agents: UserAgent[]
}
```

#### Add Agent to Library
```
POST /api/users/me/agents
Body: { agentId: string }
Response: UserAgent
```

### Sandbox Agent Assignment

#### Get Sandbox Agents
```
GET /api/sandboxes/:id/agents
Response: {
  agents: SandboxAgent[]
}
```

#### Update Sandbox Agents
```
PUT /api/sandboxes/:id/agents
Body: { agentIds: string[] }
Response: { agents: SandboxAgent[] }
```

#### Add Agent to Sandbox
```
POST /api/sandboxes/:id/agents
Body: { agentId: string }
Response: SandboxAgent
```

#### Remove Agent from Sandbox
```
DELETE /api/sandboxes/:id/agents/:agentId
Response: { success: true }
```

### Create Sandbox (Updated)

```
POST /api/sandboxes
Body: {
  name: string
  description?: string
  userId: string
  resourceTier?: string
  flavor?: string
  addons?: string[]
  provider: 'docker' | 'cloudflare'
  
  // NEW: Agent selection
  agentIds?: string[]      // Specific agent IDs
  agentPresetId?: string   // Or use a preset
}
Response: {
  sandbox: Sandbox
  agents: SandboxAgent[]
}
```

---

## UI Components

### AgentSelector

**Location**: `apps/frontend/src/lib/components/agent-selector.svelte`

**Props**:
```typescript
interface AgentSelectorProps {
  selectedAgentIds: string[]
  onSelectionChange: (ids: string[]) => void
  disabled?: boolean
  showPresets?: boolean
}
```

**Features**:
- Quick select preset buttons
- Squad-based collapsible sections
- Individual agent toggle cards
- Selected count badge
- Search/filter (optional)

### AgentCard

**Location**: `apps/frontend/src/lib/components/agent-card.svelte`

**Props**:
```typescript
interface AgentCardProps {
  agent: Agent
  selected: boolean
  onToggle: () => void
  disabled?: boolean
  showDescription?: boolean
}
```

### AgentManager

**Location**: `apps/frontend/src/lib/components/agent-manager.svelte`

**Props**:
```typescript
interface AgentManagerProps {
  sandboxId: string
  currentAgents: SandboxAgent[]
  onAgentsChange: (agents: SandboxAgent[]) => void
}
```

**Features**:
- List of current agents with remove button
- "Add More" button opening drawer
- Enable/disable toggle per agent

### AgentMarketplace (Phase 4)

**Location**: `apps/frontend/src/routes/marketplace/+page.svelte`

**Features**:
- Category navigation
- Search and filters
- Agent cards with ratings
- Featured/trending sections
- Install/subscribe buttons

---

## Migration Strategy

### Data Migration

1. **Create new tables** with migrations
2. **Seed agents table** from `OPENCODE_AGENTS` array
3. **Migrate existing user agents**:
   - Read markdown files from user's OpenCode config
   - Create `user_agents` records linking to `agents` table
   - Keep markdown files for backward compatibility during transition
4. **Create default presets**
5. **Backfill sandbox_agents** for existing sandboxes (assign default preset)

### Backward Compatibility

- Existing sandboxes without agent assignment get all agents (current behavior)
- Markdown files continue to work during transition
- New UI is additive, doesn't break existing flows

### Rollback Plan

- Keep markdown file system functional
- Feature flag for new agent selection UI
- Database migrations are reversible

---

## Default Presets

| Preset | Slug | Agents | Description |
|--------|------|--------|-------------|
| **Full Stack Team** | `full-stack` | kai, dana, tess, sam, olivia | Complete development coverage |
| **Code Review** | `code-review` | kai, dana, alex | Focus on code quality |
| **Security Audit** | `security-audit` | sam, kai, alex | Security-first analysis |
| **Product Planning** | `product-planning` | pete, spencer, river | Roadmap & requirements |
| **DevOps** | `devops` | olivia, nora, sam | Infrastructure & operations |
| **Solo Developer** | `solo-dev` | kai, dana, tess | Minimal essential team |

---

## TypeScript Types

### Core Types

```typescript
// packages/types/src/agents.ts

export type AgentSquad = 
  | 'orchestration'
  | 'development' 
  | 'product' 
  | 'operations'
  | 'security'
  | 'data';

export type AgentTier = 
  | 'central' 
  | 'foundation' 
  | 'specialized' 
  | 'premium';

export type AgentSource = 
  | 'default' 
  | 'marketplace' 
  | 'custom' 
  | 'gift';

export interface Agent {
  id: string;
  slug: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  squad: AgentSquad;
  tier: AgentTier;
  tags: string[];
  category: string;
  isBuiltin: boolean;
  isPremium: boolean;
  priceMonthly?: number;
  priceYearly?: number;
  publisherId?: string;
  publisherName?: string;
  installCount: number;
  ratingAvg?: number;
  ratingCount: number;
  config: AgentConfig;
  opencodeContent: string;
  status: 'active' | 'deprecated' | 'hidden' | 'pending_review';
  createdAt: string;
  updatedAt: string;
}

export interface UserAgent {
  id: string;
  userId: string;
  agentId: string;
  agent: Agent;
  source: AgentSource;
  subscriptionStatus?: 'active' | 'cancelled' | 'expired';
  subscriptionStartedAt?: string;
  subscriptionExpiresAt?: string;
  subscriptionPlan?: 'monthly' | 'yearly';
  customName?: string;
  customConfig?: Record<string, unknown>;
  acquiredAt: string;
}

export interface SandboxAgent {
  id: string;
  sandboxId: string;
  agentId: string;
  agent: Agent;
  enabled: boolean;
  priority: number;
  settings?: Record<string, unknown>;
  addedAt: string;
  addedBy?: string;
}

export interface AgentPreset {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  agentSlugs: string[];
  sortOrder: number;
  isDefault: boolean;
  isSystem: boolean;
  userId?: string;
}

export interface AgentReview {
  id: string;
  agentId: string;
  userId: string;
  rating: number;
  title?: string;
  review?: string;
  status: 'pending' | 'published' | 'hidden';
  createdAt: string;
  updatedAt: string;
}
```

### API Request/Response Types

```typescript
// Create sandbox with agents
export interface CreateSandboxWithAgentsRequest {
  name: string;
  description?: string;
  userId: string;
  resourceTier?: string;
  flavor?: string;
  addons?: string[];
  provider: 'docker' | 'cloudflare';
  agentIds?: string[];
  agentPresetId?: string;
}

export interface CreateSandboxWithAgentsResponse {
  sandbox: Sandbox;
  agents: SandboxAgent[];
}

// Agent listing
export interface ListAgentsRequest {
  squad?: AgentSquad;
  tier?: AgentTier;
  category?: string;
  search?: string;
  isBuiltin?: boolean;
  isPremium?: boolean;
  page?: number;
  limit?: number;
}

export interface ListAgentsResponse {
  agents: Agent[];
  total: number;
  page: number;
  limit: number;
}
```

---

## Open Questions

1. **Default for blank project**: Should "Full Stack Team" be pre-selected, or start empty?
   - **Recommendation**: Pre-select "Full Stack Team" as default

2. **Minimum agents**: Can a sandbox have zero agents (only Central)?
   - **Recommendation**: Yes, allow zero explicit agents; Central is always implicit

3. **Agent visibility in chat**: Should chat show which agents are available?
   - **Recommendation**: Yes, show agent badges in chat header

4. **Agent switching in chat**: Should Cmd+, only cycle assigned agents?
   - **Recommendation**: Yes, only cycle through sandbox's assigned agents

---

## Next Steps

1. Review and approve this design document
2. Create database migration files
3. Implement Phase 1 (Core Agent Selection)
4. Test with existing sandboxes
5. Proceed to Phase 2, 3, 4

---

*Document Author*: AgentPod Team  
*Last Review*: December 2025
