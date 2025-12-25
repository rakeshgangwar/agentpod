# Visual Workflow Builder: SvelteFlow + Cloudflare Workflows

> **Status:** Planning  
> **Created:** December 2025  
> **Related:** [Cloudflare Implementation Guide](./cloudflare-implementation-guide.md) | [Cloudflare Use Cases](../ideas/opencode-cloudflare-use-cases.md)

## Executive Summary

Build an **n8n-style visual workflow builder** using **SvelteFlow** that compiles to **Cloudflare Workflows** for durable execution. This creates a unique **AI-first, edge-native workflow automation platform** that differentiates AgentPod from traditional automation tools.

### Why This Matters

| Traditional Tools (n8n, Zapier) | AgentPod Workflow Builder |
|--------------------------------|---------------------------|
| Self-hosted or cloud SaaS | **Edge-native (Cloudflare)** |
| Node.js + Redis for orchestration | **Cloudflare Workflows (durable)** |
| Limited AI integration | **Native AI agents in sandboxes** |
| Polling-based webhooks | **Event-driven (`waitForEvent`)** |
| VM/container scaling | **Automatic edge scaling** |
| Pay for infrastructure | **Pay-per-execution** |
| Vue.js/React | **Svelte 5 (modern, fast)** |

---

## Table of Contents

1. [Product Vision](#product-vision)
2. [Technical Architecture](#technical-architecture)
3. [Technology Stack](#technology-stack)
4. [Data Model](#data-model)
5. [Node Types](#node-types)
6. [Implementation Roadmap](#implementation-roadmap)
7. [File Structure](#file-structure)
8. [Database Schema](#database-schema)
9. [API Design](#api-design)
10. [Frontend Components](#frontend-components)
11. [Execution Engine](#execution-engine)
12. [Cost Analysis](#cost-analysis)
13. [Competitive Analysis](#competitive-analysis)
14. [Success Criteria](#success-criteria)
15. [Open Questions](#open-questions)
16. [References](#references)

---

## Product Vision

### The Problem

Users want to automate multi-step AI workflows but face these challenges:

1. **No visual builder** - Must write code or use limited UIs
2. **No durable execution** - Long-running tasks fail without checkpointing
3. **No human-in-the-loop** - Can't pause for approvals
4. **No AI-native nodes** - AI agents are afterthoughts, not first-class citizens
5. **High costs** - Pay for idle infrastructure

### The Solution

A visual drag-and-drop workflow builder where:

- Users **design workflows visually** using SvelteFlow
- Workflows **execute durably** on Cloudflare Workflows
- **AI agents run in sandboxes** as first-class nodes
- **Human approvals** pause workflows with `waitForEvent`
- **Pay only for execution time** (sleeping is free)

### User Stories

```
As a user, I want to:
- Drag and drop nodes to create automation workflows
- Connect AI agents with conditional logic
- Pause workflows for human approval
- Schedule workflows to run on a cron
- View execution history and debug failures
- Share and import workflow templates
```

---

## Technical Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AgentPod Workflow Builder                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    SvelteFlow Canvas                          │  │
│  │                                                               │  │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │  │
│  │   │ Trigger │───▶│  AI     │───▶│ Approval│───▶│  Action │  │  │
│  │   │  Node   │    │  Agent  │    │  Node   │    │  Node   │  │  │
│  │   └─────────┘    └─────────┘    └─────────┘    └─────────┘  │  │
│  │                                                               │  │
│  │   Drag & Drop Node Palette │ Properties Panel │ Mini Map    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                               │                                      │
│                               ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Workflow Definition (JSON)                   │  │
│  │  {                                                           │  │
│  │    "id": "wf_abc123",                                        │  │
│  │    "nodes": [...],                                           │  │
│  │    "connections": {...}                                      │  │
│  │  }                                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge (Worker)                          │
│                                                                      │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────────┐  │
│  │  Workflow      │   │   Dynamic      │   │   Execution        │  │
│  │  Compiler      │◀──│   Workflow     │──▶│   Engine           │  │
│  │  (JSON→Code)   │   │   Registry     │   │   (step.do, etc)   │  │
│  └────────────────┘   └────────────────┘   └────────────────────┘  │
│                                │                                     │
│  ┌─────────────────────────────┼─────────────────────────────────┐  │
│  │              Cloudflare Workflows Runtime                      │  │
│  │                                                                │  │
│  │   step.do()  │  step.sleep()  │  step.waitForEvent()          │  │
│  │   Durable State  │  Automatic Retries  │  Human-in-the-Loop   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │    D1    │  │    R2    │  │  Workers │  │  Sandbox SDK     │    │
│  │ Workflow │  │  Assets  │  │    AI    │  │  (Code Execution)│    │
│  │  Store   │  │  Store   │  │  Models  │  │                  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User creates workflow in visual editor (SvelteFlow)
           ↓
2. Workflow saved as JSON to PostgreSQL
           ↓
3. User clicks "Run" → API triggers Cloudflare Workflow
           ↓
4. DynamicWorkflow class loads definition from D1
           ↓
5. Compiler converts JSON → execution DAG
           ↓
6. Each node executes as durable step (step.do)
           ↓
7. Results stored, status updates sent to frontend
```

---

## Technology Stack

### Frontend

| Technology | Purpose | Why |
|------------|---------|-----|
| **SvelteFlow** (`@xyflow/svelte`) | Visual node editor | MIT license, Svelte 5 native, production-proven (Budibase, Open-WebUI) |
| **Svelte 5** | UI framework | Already using, modern runes API |
| **TypeScript** | Type safety | Consistent with codebase |
| **Tailwind CSS** | Styling | Already using |

### Backend

| Technology | Purpose | Why |
|------------|---------|-----|
| **Cloudflare Workflows** | Durable execution | Built-in retries, state persistence, waitForEvent |
| **Cloudflare Workers** | API layer | Already have worker deployed |
| **D1** | Workflow storage (edge) | Low-latency reads during execution |
| **PostgreSQL** | Primary storage | Existing database |
| **R2** | File storage | Workflow assets, large outputs |

### Execution Engine

| Technology | Purpose | Why |
|------------|---------|-----|
| **Cloudflare Sandbox SDK** | AI agent execution | Already integrated |
| **Workers AI** | Direct LLM calls | Native integration |
| **Cloudflare Queues** | Async triggers | Webhook handling |

---

## Data Model

### Workflow Definition (n8n-Compatible)

We adopt n8n's proven schema for compatibility and import/export:

```typescript
// packages/types/src/workflow.ts

/**
 * Main workflow definition - compatible with n8n schema
 */
export interface IWorkflowBase {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  
  // Core structure
  nodes: INode[];
  connections: IConnections;
  
  // Settings
  settings?: IWorkflowSettings;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/**
 * Node definition
 */
export interface INode {
  id: string;
  name: string;
  type: string;  // e.g., 'trigger', 'ai-agent', 'http', 'approval'
  
  // Position for visual editor
  position: [number, number];
  
  // Type-specific configuration
  parameters: Record<string, unknown>;
  
  // Execution settings
  retryOnFail?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  
  // UI state
  disabled?: boolean;
  notes?: string;
}

/**
 * Connection graph - maps source nodes to their outputs
 */
export interface IConnections {
  [sourceNodeName: string]: {
    main: Array<Array<{
      node: string;      // Target node name
      type: string;      // Connection type (usually 'main')
      index: number;     // Input index on target
    }>>;
  };
}

/**
 * Workflow settings
 */
export interface IWorkflowSettings {
  executionOrder?: 'v0' | 'v1';
  timezone?: string;
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  
  // Cloudflare-specific
  cloudflare?: {
    retryPolicy?: {
      limit: number;
      delay: string;
      backoff: 'constant' | 'linear' | 'exponential';
    };
    timeout?: string;
  };
}
```

### SvelteFlow ↔ n8n Conversion

```typescript
// packages/types/src/workflow-conversion.ts

import type { Node, Edge } from '@xyflow/svelte';

/**
 * Convert SvelteFlow nodes/edges to n8n-compatible format
 */
export function svelteFlowToWorkflow(
  nodes: Node[],
  edges: Edge[]
): Pick<IWorkflowBase, 'nodes' | 'connections'> {
  // Convert nodes
  const workflowNodes: INode[] = nodes.map(node => ({
    id: node.id,
    name: node.data.label || node.id,
    type: node.type || 'default',
    position: [node.position.x, node.position.y],
    parameters: node.data,
  }));
  
  // Build connections from edges
  const connections: IConnections = {};
  
  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (!sourceNode) continue;
    
    const sourceName = sourceNode.data.label || sourceNode.id;
    
    if (!connections[sourceName]) {
      connections[sourceName] = { main: [[]] };
    }
    
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!targetNode) continue;
    
    connections[sourceName].main[0].push({
      node: targetNode.data.label || targetNode.id,
      type: 'main',
      index: 0,
    });
  }
  
  return { nodes: workflowNodes, connections };
}

/**
 * Convert n8n-compatible format to SvelteFlow nodes/edges
 */
export function workflowToSvelteFlow(
  workflow: IWorkflowBase
): { nodes: Node[]; edges: Edge[] } {
  // Convert nodes
  const nodes: Node[] = workflow.nodes.map(node => ({
    id: node.id,
    type: node.type,
    position: { x: node.position[0], y: node.position[1] },
    data: {
      label: node.name,
      ...node.parameters,
    },
  }));
  
  // Convert connections to edges
  const edges: Edge[] = [];
  
  for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
    const sourceNode = workflow.nodes.find(n => n.name === sourceName);
    if (!sourceNode) continue;
    
    for (const connections of outputs.main) {
      for (const conn of connections) {
        const targetNode = workflow.nodes.find(n => n.name === conn.node);
        if (!targetNode) continue;
        
        edges.push({
          id: `e-${sourceNode.id}-${targetNode.id}`,
          source: sourceNode.id,
          target: targetNode.id,
        });
      }
    }
  }
  
  return { nodes, edges };
}
```

### AgentPod Extensions

```typescript
// packages/types/src/workflow-agentpod.ts

import type { IWorkflowBase } from './workflow';

/**
 * AgentPod-specific workflow extensions
 */
export interface AgentPodWorkflow extends IWorkflowBase {
  // Ownership
  userId: string;
  organizationId?: string;
  
  // Visibility
  isPublic: boolean;
  isTemplate: boolean;
  
  // Tags for discovery
  tags: string[];
  category?: string;
  
  // Usage stats
  executionCount: number;
  lastExecutedAt?: Date;
  
  // Template info
  forkCount?: number;
  forkedFromId?: string;
}

/**
 * Workflow execution record
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  userId: string;
  
  // Cloudflare Workflow instance
  instanceId: string;
  
  // Status
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'errored' | 'cancelled';
  
  // Input/output
  triggerData?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  
  // Step tracking
  currentStep?: string;
  completedSteps: string[];
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}

/**
 * Step execution log
 */
export interface WorkflowStepLog {
  id: string;
  executionId: string;
  nodeId: string;
  stepName: string;
  
  // Status
  status: 'running' | 'success' | 'error' | 'retrying' | 'skipped';
  attemptNumber: number;
  
  // Data
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}
```

---

## Node Types

### Node Type Registry

```typescript
// packages/types/src/workflow-nodes.ts

/**
 * Node type definition (plugin interface)
 */
export interface NodeTypeDefinition {
  // Identity
  id: string;
  name: string;
  description: string;
  icon: string;
  category: NodeCategory;
  
  // Schema
  inputs: HandleDefinition[];
  outputs: HandleDefinition[];
  parameters: JSONSchema;
  
  // Defaults
  defaultParameters: Record<string, unknown>;
  
  // Execution (server-side)
  execute?: (
    context: NodeExecutionContext,
    step: WorkflowStep
  ) => Promise<unknown>;
  
  // UI component (optional custom rendering)
  component?: string;  // Svelte component name
}

export type NodeCategory = 
  | 'trigger'
  | 'ai'
  | 'logic'
  | 'action'
  | 'human'
  | 'code'
  | 'integration';

export interface HandleDefinition {
  id: string;
  type: 'any' | 'string' | 'number' | 'boolean' | 'array' | 'object';
  label: string;
  required?: boolean;
}
```

### Core Node Types

#### Trigger Nodes

| Node | Description | Parameters |
|------|-------------|------------|
| **Manual Trigger** | Start from UI button | None |
| **Webhook Trigger** | HTTP endpoint | `path`, `method`, `authentication` |
| **Schedule Trigger** | Cron-based | `cron`, `timezone` |
| **Event Trigger** | Listen for events | `eventType`, `filter` |

#### AI Nodes

| Node | Description | Parameters |
|------|-------------|------------|
| **AI Agent** | Execute in Cloudflare Sandbox | `prompt`, `model`, `sandboxConfig` |
| **AI Prompt** | Direct LLM call (Workers AI) | `prompt`, `model`, `temperature` |
| **Embeddings** | Generate vector embeddings | `text`, `model` |
| **Vector Search** | Query Vectorize | `query`, `index`, `topK` |

#### Logic Nodes

| Node | Description | Parameters |
|------|-------------|------------|
| **Condition** | If/else branching | `conditions[]`, `defaultBranch` |
| **Switch** | Multiple branches | `field`, `cases[]` |
| **Loop** | Iterate over array | `items`, `batchSize` |
| **Merge** | Join parallel branches | `mode: 'wait' | 'first'` |

#### Action Nodes

| Node | Description | Parameters |
|------|-------------|------------|
| **HTTP Request** | Call external APIs | `url`, `method`, `headers`, `body` |
| **Email** | Send email | `to`, `subject`, `body`, `provider` |
| **Database** | Query D1/Postgres | `query`, `connection`, `parameters` |
| **Storage** | R2 operations | `operation`, `bucket`, `key`, `content` |

#### Human Nodes

| Node | Description | Parameters |
|------|-------------|------------|
| **Approval** | Wait for approval | `approvers[]`, `timeout`, `message` |
| **Form** | Collect user input | `fields[]`, `timeout` |
| **Notification** | Alert user | `channels[]`, `message`, `priority` |

#### Code Nodes

| Node | Description | Parameters |
|------|-------------|------------|
| **JavaScript** | Execute JS code | `code`, `inputs` |
| **Python** | Execute Python (sandbox) | `code`, `inputs` |

### Node Parameter Schemas

```typescript
// Example: AI Agent Node schema

const aiAgentNodeSchema: JSONSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      title: 'Prompt',
      description: 'The instruction for the AI agent',
      format: 'textarea',
    },
    model: {
      type: 'object',
      title: 'Model',
      properties: {
        providerId: {
          type: 'string',
          enum: ['anthropic', 'openai', 'google'],
          default: 'anthropic',
        },
        modelId: {
          type: 'string',
          default: 'claude-sonnet-4-20250514',
        },
      },
    },
    sandboxConfig: {
      type: 'object',
      title: 'Sandbox Configuration',
      properties: {
        gitUrl: {
          type: 'string',
          format: 'uri',
          title: 'Git Repository URL',
        },
        workspaceId: {
          type: 'string',
          title: 'Existing Workspace ID',
        },
      },
    },
    timeout: {
      type: 'string',
      title: 'Timeout',
      default: '5 minutes',
      enum: ['1 minute', '5 minutes', '10 minutes', '30 minutes'],
    },
  },
  required: ['prompt'],
};
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal**: Basic visual editor with 3 node types

| Task | Time | Description |
|------|------|-------------|
| Set up SvelteFlow | 0.5d | Install `@xyflow/svelte`, create wrapper component |
| WorkflowEditor component | 1d | Main canvas with nodes, edges, background, controls |
| Node palette | 1d | Draggable node list organized by category |
| Drag-and-drop | 0.5d | Drop nodes from palette onto canvas |
| Basic nodes (Trigger, AI Agent, HTTP) | 1d | Three custom node components |
| Properties panel | 1d | JSON Schema → form for node configuration |
| Variable interpolation UI | 0.5d | Autocomplete for `{{step.output}}` syntax |
| Save/load API | 1d | CRUD endpoints for workflows |
| PostgreSQL storage | 0.5d | Table for workflow definitions |

**Deliverable**: Create, edit, save, and load visual workflows (not yet executable)

### Phase 2: Execution Engine (Week 3-4)

**Goal**: Convert visual → executable Cloudflare Workflow

| Task | Time | Description |
|------|------|-------------|
| DynamicWorkflow class | 1.5d | Base Cloudflare Workflow that loads definitions |
| DAG builder | 1d | Convert connections graph to execution order |
| Variable interpolation | 0.5d | Replace `{{var}}` with actual values |
| AI Agent node execution | 1d | Integrate with Cloudflare Sandbox |
| HTTP node execution | 0.5d | Fetch with retry logic |
| Approval node | 1d | Implement `step.waitForEvent` |
| Execution tracking | 1d | Store execution status, step logs |
| Execution history UI | 1d | List past executions, view details |
| Real-time status updates | 0.5d | Poll or SSE for live status |

**Deliverable**: Execute workflows end-to-end with status tracking

### Phase 3: Polish & Ship (Week 5-6)

**Goal**: Production-ready MVP

| Task | Time | Description |
|------|------|-------------|
| Condition node | 1d | If/else branching with multiple conditions |
| Code node | 1d | JavaScript execution in sandbox |
| Webhook trigger | 0.5d | Unique URL per workflow |
| Schedule trigger | 0.5d | Cron input UI |
| Execution visualization | 1.5d | Highlight active/completed nodes |
| Error handling UI | 0.5d | Show errors per step, retry buttons |
| Workflow templates | 1d | Pre-built example workflows |
| Import/export | 0.5d | JSON download/upload |
| Documentation | 1d | User guide, API docs |
| Testing | 1d | Unit tests, integration tests |

**Deliverable**: Ship to users!

### Phase 4: Advanced Features (Future)

- Loop node (iterate over arrays)
- Parallel execution (fan-out/fan-in)
- Sub-workflows (workflow nodes)
- Custom node plugin system
- Marketplace for community nodes
- Team collaboration (shared workflows)
- Version history
- A/B testing for workflows

---

## File Structure

```
agentpod/
├── apps/frontend/src/
│   ├── lib/
│   │   ├── components/workflow/
│   │   │   ├── WorkflowEditor.svelte          # Main canvas component
│   │   │   ├── NodePalette.svelte             # Drag-drop node sidebar
│   │   │   ├── PropertiesPanel.svelte         # Node configuration panel
│   │   │   ├── WorkflowToolbar.svelte         # Save/Run/Settings buttons
│   │   │   ├── ExecutionStatus.svelte         # Real-time execution view
│   │   │   ├── ExecutionHistory.svelte        # Past executions list
│   │   │   ├── VariableSelector.svelte        # {{var}} autocomplete
│   │   │   │
│   │   │   ├── nodes/                         # Custom node components
│   │   │   │   ├── BaseNode.svelte            # Shared node wrapper
│   │   │   │   ├── TriggerNode.svelte
│   │   │   │   ├── AIAgentNode.svelte
│   │   │   │   ├── ApprovalNode.svelte
│   │   │   │   ├── HTTPNode.svelte
│   │   │   │   ├── ConditionNode.svelte
│   │   │   │   ├── CodeNode.svelte
│   │   │   │   └── index.ts                   # Node type registry
│   │   │   │
│   │   │   └── edges/                         # Custom edge components
│   │   │       ├── ConditionalEdge.svelte
│   │   │       └── index.ts
│   │   │
│   │   ├── stores/
│   │   │   └── workflow.ts                    # Workflow editor state
│   │   │
│   │   └── utils/
│   │       ├── workflow-conversion.ts         # SvelteFlow ↔ n8n format
│   │       └── workflow-validation.ts         # Validate before save/run
│   │
│   ├── routes/
│   │   ├── workflows/
│   │   │   ├── +page.svelte                   # List all workflows
│   │   │   ├── +page.ts                       # Load workflows
│   │   │   ├── new/+page.svelte               # Create new workflow
│   │   │   ├── [id]/
│   │   │   │   ├── +page.svelte               # Workflow editor
│   │   │   │   ├── +page.ts                   # Load workflow
│   │   │   │   └── executions/
│   │   │   │       ├── +page.svelte           # Execution history
│   │   │   │       └── [execId]/+page.svelte  # Execution details
│   │   │   └── templates/+page.svelte         # Template gallery
│   │
├── apps/api/src/
│   ├── routes/
│   │   ├── workflows.ts                       # Workflow CRUD
│   │   ├── workflow-executions.ts             # Execution management
│   │   └── workflow-webhooks.ts               # Webhook trigger endpoints
│   │
│   ├── services/
│   │   └── workflow-service.ts                # Business logic
│   │
│   └── db/schema/
│       └── workflows.ts                       # Database tables
│
├── cloudflare/worker/src/
│   ├── workflows/
│   │   ├── dynamic-workflow.ts                # Main executor class
│   │   ├── workflow-compiler.ts               # JSON → execution plan
│   │   │
│   │   ├── nodes/                             # Node execution logic
│   │   │   ├── base.ts                        # Base node executor
│   │   │   ├── ai-agent.ts
│   │   │   ├── approval.ts
│   │   │   ├── http.ts
│   │   │   ├── condition.ts
│   │   │   ├── code.ts
│   │   │   └── index.ts                       # Node executor registry
│   │   │
│   │   └── utils/
│   │       ├── dag-builder.ts                 # Build execution DAG
│   │       ├── variable-interpolator.ts       # {{var}} replacement
│   │       └── context.ts                     # Execution context
│   │
│   └── index.ts                               # Add workflow routes
│
├── packages/types/src/
│   ├── workflow.ts                            # Core workflow types
│   ├── workflow-nodes.ts                      # Node type definitions
│   ├── workflow-execution.ts                  # Execution types
│   └── workflow-conversion.ts                 # Conversion utilities
│
└── packages/workflow-nodes/                   # (Future) Plugin system
    ├── core/                                  # Built-in nodes
    └── community/                             # Community nodes
```

---

## Database Schema

```sql
-- Workflow definitions
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  
  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  
  -- n8n-compatible definition (nodes + connections)
  definition JSONB NOT NULL,
  
  -- Settings
  settings JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT false,
  
  -- Visibility
  is_public BOOLEAN DEFAULT false,
  is_template BOOLEAN DEFAULT false,
  
  -- Discovery
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  
  -- Stats
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,
  
  -- Template tracking
  fork_count INTEGER DEFAULT 0,
  forked_from_id TEXT REFERENCES workflows(id),
  
  -- Versioning
  version INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_workflows_user_id ON workflows(user_id);
CREATE INDEX idx_workflows_is_template ON workflows(is_template) WHERE is_template = true;
CREATE INDEX idx_workflows_tags ON workflows USING GIN(tags);

-- Workflow executions
CREATE TABLE workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  
  -- Cloudflare Workflow instance
  instance_id TEXT UNIQUE,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'running', 'waiting', 'completed', 'errored', 'cancelled'
  )),
  
  -- Input/output
  trigger_type TEXT NOT NULL,  -- 'manual', 'webhook', 'schedule', 'event'
  trigger_data JSONB,
  result JSONB,
  error TEXT,
  
  -- Step tracking
  current_step TEXT,
  completed_steps TEXT[] DEFAULT '{}',
  
  -- Timing
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER
);

-- Indexes
CREATE INDEX idx_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_executions_user_id ON workflow_executions(user_id);
CREATE INDEX idx_executions_status ON workflow_executions(status);
CREATE INDEX idx_executions_started_at ON workflow_executions(started_at DESC);

-- Step execution logs (for debugging)
CREATE TABLE workflow_step_logs (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN (
    'running', 'success', 'error', 'retrying', 'skipped'
  )),
  attempt_number INTEGER DEFAULT 1,
  
  -- Data
  input JSONB,
  output JSONB,
  error TEXT,
  
  -- Timing
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER
);

-- Indexes
CREATE INDEX idx_step_logs_execution_id ON workflow_step_logs(execution_id);

-- Webhook endpoints for workflow triggers
CREATE TABLE workflow_webhooks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Webhook config
  path TEXT NOT NULL UNIQUE,  -- e.g., '/wh/abc123'
  method TEXT DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  
  -- Security
  authentication TEXT CHECK (authentication IN ('none', 'header', 'basic')),
  auth_config JSONB,
  
  -- Stats
  last_triggered_at TIMESTAMP,
  trigger_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_webhooks_path ON workflow_webhooks(path);
CREATE INDEX idx_webhooks_workflow_id ON workflow_webhooks(workflow_id);
```

---

## API Design

### Workflow CRUD

```typescript
// apps/api/src/routes/workflows.ts

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const workflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  definition: z.object({
    nodes: z.array(z.any()),
    connections: z.record(z.any()),
  }),
  settings: z.object({}).passthrough().optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const workflowRoutes = new Hono()
  
  // List user's workflows
  .get('/', async (c) => {
    const userId = c.get('userId');
    const { page = 1, limit = 20, tag, search } = c.req.query();
    
    const workflows = await workflowService.list({
      userId,
      page: Number(page),
      limit: Number(limit),
      tag,
      search,
    });
    
    return c.json(workflows);
  })
  
  // Get single workflow
  .get('/:id', async (c) => {
    const workflowId = c.req.param('id');
    const userId = c.get('userId');
    
    const workflow = await workflowService.get(workflowId, userId);
    if (!workflow) {
      return c.json({ error: 'Workflow not found' }, 404);
    }
    
    return c.json(workflow);
  })
  
  // Create workflow
  .post('/', zValidator('json', workflowSchema), async (c) => {
    const userId = c.get('userId');
    const body = c.req.valid('json');
    
    const workflow = await workflowService.create({
      ...body,
      userId,
    });
    
    return c.json(workflow, 201);
  })
  
  // Update workflow
  .put('/:id', zValidator('json', workflowSchema.partial()), async (c) => {
    const workflowId = c.req.param('id');
    const userId = c.get('userId');
    const body = c.req.valid('json');
    
    const workflow = await workflowService.update(workflowId, userId, body);
    if (!workflow) {
      return c.json({ error: 'Workflow not found' }, 404);
    }
    
    return c.json(workflow);
  })
  
  // Delete workflow
  .delete('/:id', async (c) => {
    const workflowId = c.req.param('id');
    const userId = c.get('userId');
    
    await workflowService.delete(workflowId, userId);
    return c.json({ deleted: true });
  })
  
  // Execute workflow
  .post('/:id/execute', zValidator('json', z.object({
    triggerData: z.record(z.unknown()).optional(),
  }).optional()), async (c) => {
    const workflowId = c.req.param('id');
    const userId = c.get('userId');
    const { triggerData } = c.req.valid('json') || {};
    
    const execution = await workflowService.execute(workflowId, userId, {
      triggerType: 'manual',
      triggerData,
    });
    
    return c.json(execution, 201);
  })
  
  // Duplicate/fork workflow
  .post('/:id/fork', async (c) => {
    const workflowId = c.req.param('id');
    const userId = c.get('userId');
    
    const forkedWorkflow = await workflowService.fork(workflowId, userId);
    return c.json(forkedWorkflow, 201);
  });
```

### Execution Management

```typescript
// apps/api/src/routes/workflow-executions.ts

export const executionRoutes = new Hono()
  
  // List executions for a workflow
  .get('/workflows/:id/executions', async (c) => {
    const workflowId = c.req.param('id');
    const userId = c.get('userId');
    const { status, limit = 20 } = c.req.query();
    
    const executions = await executionService.list({
      workflowId,
      userId,
      status,
      limit: Number(limit),
    });
    
    return c.json(executions);
  })
  
  // Get execution details
  .get('/executions/:id', async (c) => {
    const executionId = c.req.param('id');
    const userId = c.get('userId');
    
    const execution = await executionService.get(executionId, userId);
    if (!execution) {
      return c.json({ error: 'Execution not found' }, 404);
    }
    
    return c.json(execution);
  })
  
  // Get step logs
  .get('/executions/:id/steps', async (c) => {
    const executionId = c.req.param('id');
    const userId = c.get('userId');
    
    const steps = await executionService.getStepLogs(executionId, userId);
    return c.json(steps);
  })
  
  // Cancel execution
  .post('/executions/:id/cancel', async (c) => {
    const executionId = c.req.param('id');
    const userId = c.get('userId');
    
    await executionService.cancel(executionId, userId);
    return c.json({ cancelled: true });
  })
  
  // Send event (for approval nodes)
  .post('/executions/:id/events', zValidator('json', z.object({
    type: z.string(),
    payload: z.record(z.unknown()),
  })), async (c) => {
    const executionId = c.req.param('id');
    const userId = c.get('userId');
    const { type, payload } = c.req.valid('json');
    
    await executionService.sendEvent(executionId, userId, { type, payload });
    return c.json({ sent: true });
  });
```

---

## Frontend Components

### WorkflowEditor.svelte

```svelte
<!-- apps/frontend/src/lib/components/workflow/WorkflowEditor.svelte -->
<script lang="ts">
  import { 
    SvelteFlow, 
    Controls, 
    Background, 
    MiniMap,
    Panel,
    useSvelteFlow,
    type Node,
    type Edge,
    type NodeTypes,
    type Connection,
    addEdge
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  
  import NodePalette from './NodePalette.svelte';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import WorkflowToolbar from './WorkflowToolbar.svelte';
  import ExecutionStatus from './ExecutionStatus.svelte';
  
  // Custom nodes
  import { nodeTypes, getDefaultNodeData } from './nodes';
  
  // Utils
  import { svelteFlowToWorkflow, workflowToSvelteFlow } from '$lib/utils/workflow-conversion';
  import { validateWorkflow } from '$lib/utils/workflow-validation';
  
  // Props
  interface Props {
    workflowId?: string;
    initialWorkflow?: AgentPodWorkflow;
    onSave?: (workflow: AgentPodWorkflow) => Promise<void>;
  }
  let { workflowId, initialWorkflow, onSave }: Props = $props();
  
  // State
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let selectedNode = $state<Node | null>(null);
  let workflowName = $state('Untitled Workflow');
  let workflowDescription = $state('');
  let isSaving = $state(false);
  let isExecuting = $state(false);
  let currentExecution = $state<WorkflowExecution | null>(null);
  let validationErrors = $state<string[]>([]);
  
  // SvelteFlow instance
  const { screenToFlowPosition, fitView } = useSvelteFlow();
  
  // Load initial workflow
  $effect(() => {
    if (initialWorkflow) {
      const { nodes: n, edges: e } = workflowToSvelteFlow(initialWorkflow);
      nodes = n;
      edges = e;
      workflowName = initialWorkflow.name;
      workflowDescription = initialWorkflow.description || '';
    }
  });
  
  // Drag and drop from palette
  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }
  
  function onDrop(event: DragEvent) {
    event.preventDefault();
    
    const nodeType = event.dataTransfer?.getData('application/workflow-node');
    if (!nodeType) return;
    
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    
    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position,
      data: getDefaultNodeData(nodeType),
    };
    
    nodes = [...nodes, newNode];
  }
  
  // Connection handling
  function onConnect(event: CustomEvent<{ connection: Connection }>) {
    const { connection } = event.detail;
    edges = addEdge(connection, edges);
  }
  
  function isValidConnection(connection: Connection): boolean {
    // Prevent self-connections
    if (connection.source === connection.target) return false;
    
    // Prevent duplicate connections
    const exists = edges.some(
      e => e.source === connection.source && e.target === connection.target
    );
    if (exists) return false;
    
    return true;
  }
  
  // Node selection
  function onNodeClick(event: CustomEvent<{ node: Node }>) {
    selectedNode = event.detail.node;
  }
  
  function onPaneClick() {
    selectedNode = null;
  }
  
  // Update node data from properties panel
  function updateNodeData(nodeId: string, data: Record<string, unknown>) {
    nodes = nodes.map(n => 
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    );
    
    // Also update selected node reference
    if (selectedNode?.id === nodeId) {
      selectedNode = { ...selectedNode, data: { ...selectedNode.data, ...data } };
    }
  }
  
  // Delete node
  function deleteNode(nodeId: string) {
    nodes = nodes.filter(n => n.id !== nodeId);
    edges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    
    if (selectedNode?.id === nodeId) {
      selectedNode = null;
    }
  }
  
  // Save workflow
  async function handleSave() {
    // Validate
    const { nodes: wfNodes, connections } = svelteFlowToWorkflow(nodes, edges);
    const errors = validateWorkflow({ nodes: wfNodes, connections });
    
    if (errors.length > 0) {
      validationErrors = errors;
      return;
    }
    
    validationErrors = [];
    isSaving = true;
    
    try {
      await onSave?.({
        id: workflowId || crypto.randomUUID(),
        name: workflowName,
        description: workflowDescription,
        nodes: wfNodes,
        connections,
        active: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      });
    } finally {
      isSaving = false;
    }
  }
  
  // Execute workflow
  async function handleExecute() {
    isExecuting = true;
    
    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerData: {} }),
      });
      
      const execution = await response.json();
      currentExecution = execution;
      
      // Start polling for status updates
      pollExecutionStatus(execution.id);
    } finally {
      isExecuting = false;
    }
  }
  
  async function pollExecutionStatus(executionId: string) {
    const poll = async () => {
      const response = await fetch(`/api/executions/${executionId}`);
      const execution = await response.json();
      currentExecution = execution;
      
      if (!['completed', 'errored', 'cancelled'].includes(execution.status)) {
        setTimeout(poll, 2000);
      }
    };
    poll();
  }
</script>

<div class="workflow-editor">
  <WorkflowToolbar 
    bind:name={workflowName}
    bind:description={workflowDescription}
    {isSaving}
    {isExecuting}
    onSave={handleSave}
    onExecute={handleExecute}
    {validationErrors}
  />
  
  <div class="editor-content">
    <NodePalette />
    
    <div 
      class="canvas-container"
      ondragover={onDragOver}
      ondrop={onDrop}
    >
      <SvelteFlow 
        bind:nodes 
        bind:edges 
        {nodeTypes}
        {isValidConnection}
        fitView
        onconnect={onConnect}
        onnodeclick={onNodeClick}
        onpaneclick={onPaneClick}
      >
        <Background />
        <Controls />
        <MiniMap />
        
        {#if currentExecution}
          <Panel position="top-right">
            <ExecutionStatus 
              execution={currentExecution}
              onClose={() => currentExecution = null}
            />
          </Panel>
        {/if}
      </SvelteFlow>
    </div>
    
    {#if selectedNode}
      <PropertiesPanel 
        node={selectedNode}
        onUpdate={(data) => updateNodeData(selectedNode.id, data)}
        onDelete={() => deleteNode(selectedNode.id)}
      />
    {/if}
  </div>
</div>

<style>
  .workflow-editor {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--color-background);
  }
  
  .editor-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .canvas-container {
    flex: 1;
    position: relative;
  }
</style>
```

---

## Execution Engine

### DynamicWorkflow Class

```typescript
// cloudflare/worker/src/workflows/dynamic-workflow.ts

import { 
  WorkflowEntrypoint, 
  WorkflowStep, 
  WorkflowEvent 
} from 'cloudflare:workers';
import { buildDAG, topologicalSort } from './utils/dag-builder';
import { interpolateVariables } from './utils/variable-interpolator';
import { nodeExecutors } from './nodes';
import type { IWorkflowBase, INode, IConnections } from '@agentpod/types';

interface DynamicWorkflowParams {
  workflowId: string;
  triggerType: string;
  triggerData: Record<string, unknown>;
}

interface ExecutionContext {
  trigger: Record<string, unknown>;
  steps: Record<string, unknown>;
  env: Env;
}

export class DynamicWorkflow extends WorkflowEntrypoint<Env, DynamicWorkflowParams> {
  
  async run(event: WorkflowEvent<DynamicWorkflowParams>, step: WorkflowStep) {
    const { workflowId, triggerType, triggerData } = event.payload;
    
    // Step 1: Load workflow definition
    const workflow = await step.do('load-workflow', async () => {
      // Load from D1 for edge performance
      const result = await this.env.DB.prepare(
        'SELECT definition FROM workflows WHERE id = ?'
      ).bind(workflowId).first<{ definition: string }>();
      
      if (!result) {
        throw new Error(`Workflow ${workflowId} not found`);
      }
      
      return JSON.parse(result.definition) as IWorkflowBase;
    });
    
    // Step 2: Build execution DAG
    const executionOrder = await step.do('build-dag', async () => {
      const dag = buildDAG(workflow.nodes, workflow.connections);
      return topologicalSort(dag);
    });
    
    // Step 3: Initialize context
    const context: ExecutionContext = {
      trigger: {
        type: triggerType,
        data: triggerData,
        timestamp: event.timestamp,
      },
      steps: {},
      env: this.env,
    };
    
    // Step 4: Execute nodes in order
    for (const nodeId of executionOrder) {
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      
      // Skip disabled nodes
      if (node.disabled) continue;
      
      // Get node executor
      const executor = nodeExecutors[node.type];
      if (!executor) {
        throw new Error(`Unknown node type: ${node.type}`);
      }
      
      // Interpolate parameters with context
      const parameters = interpolateVariables(node.parameters, context);
      
      // Execute node with durable step
      const result = await executor.execute(
        {
          nodeId: node.id,
          nodeName: node.name,
          parameters,
          context,
        },
        step,
        this.env
      );
      
      // Store result in context
      context.steps[node.id] = result;
      context.steps[node.name] = result; // Also by name for convenience
      
      // Notify API of step completion
      await this.notifyStepComplete(workflowId, event.instanceId, node.id, result);
    }
    
    // Return final context
    return {
      success: true,
      trigger: context.trigger,
      steps: context.steps,
      completedAt: new Date().toISOString(),
    };
  }
  
  private async notifyStepComplete(
    workflowId: string,
    instanceId: string,
    nodeId: string,
    result: unknown
  ) {
    try {
      await fetch(`${this.env.AGENTPOD_API_URL}/api/workflow-internal/step-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.AGENTPOD_API_TOKEN}`,
        },
        body: JSON.stringify({
          workflowId,
          instanceId,
          nodeId,
          result,
          completedAt: new Date().toISOString(),
        }),
      });
    } catch (error) {
      // Non-critical, continue execution
      console.error('Failed to notify step completion:', error);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ... existing routes ...
    
    // POST /workflow/execute - Execute a workflow
    if (request.method === 'POST' && pathParts[0] === 'workflow' && pathParts[1] === 'execute') {
      const body = await request.json() as DynamicWorkflowParams;
      
      const instance = await env.DYNAMIC_WORKFLOW.create({
        id: `exec-${body.workflowId}-${Date.now()}`,
        params: body,
      });
      
      return Response.json({
        instanceId: instance.id,
        status: await instance.status(),
      });
    }
    
    // GET /workflow/status/:instanceId - Get execution status
    if (request.method === 'GET' && pathParts[0] === 'workflow' && pathParts[1] === 'status') {
      const instanceId = pathParts[2];
      const instance = await env.DYNAMIC_WORKFLOW.get(instanceId);
      
      return Response.json(await instance.status());
    }
    
    // POST /workflow/event/:instanceId - Send event to execution
    if (request.method === 'POST' && pathParts[0] === 'workflow' && pathParts[1] === 'event') {
      const instanceId = pathParts[2];
      const event = await request.json() as { type: string; payload: unknown };
      
      const instance = await env.DYNAMIC_WORKFLOW.get(instanceId);
      await instance.sendEvent(event);
      
      return Response.json({ sent: true });
    }
  }
};
```

### Node Executors

```typescript
// cloudflare/worker/src/workflows/nodes/index.ts

import type { WorkflowStep } from 'cloudflare:workers';

export interface NodeExecutionContext {
  nodeId: string;
  nodeName: string;
  parameters: Record<string, unknown>;
  context: {
    trigger: Record<string, unknown>;
    steps: Record<string, unknown>;
    env: Env;
  };
}

export interface NodeExecutor {
  execute: (
    ctx: NodeExecutionContext,
    step: WorkflowStep,
    env: Env
  ) => Promise<unknown>;
}

// AI Agent Node
export const aiAgentExecutor: NodeExecutor = {
  async execute(ctx, step, env) {
    return step.do(`ai-agent-${ctx.nodeId}`, {
      retries: {
        limit: ctx.parameters.retries || 3,
        delay: '10 seconds',
        backoff: 'exponential',
      },
      timeout: ctx.parameters.timeout || '5 minutes',
    }, async () => {
      const { prompt, model, sandboxConfig } = ctx.parameters;
      
      // Create or get sandbox
      const sandboxId = sandboxConfig?.workspaceId || `wf-${ctx.nodeId}-${Date.now()}`;
      const sandbox = await getSandbox(env.Sandbox, sandboxId);
      
      if (sandboxConfig?.gitUrl) {
        await sandbox.gitCheckout(sandboxConfig.gitUrl, {
          targetDir: '/home/user/workspace',
        });
      }
      
      // Send message
      const { client } = await createOpencode(sandbox, {
        directory: '/home/user/workspace',
      });
      
      const session = await client.session.create({ body: { title: ctx.nodeName } });
      const response = await client.session.prompt({
        path: { id: session.data.id },
        body: {
          parts: [{ type: 'text', text: prompt }],
          model,
        },
      });
      
      return {
        sessionId: session.data.id,
        response: extractTextFromResponse(response),
        parts: response.data?.parts,
      };
    });
  },
};

// Approval Node
export const approvalExecutor: NodeExecutor = {
  async execute(ctx, step, env) {
    // First, notify that we're waiting for approval
    await step.do(`approval-notify-${ctx.nodeId}`, async () => {
      await fetch(`${env.AGENTPOD_API_URL}/api/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.AGENTPOD_API_TOKEN}`,
        },
        body: JSON.stringify({
          type: 'approval-required',
          nodeId: ctx.nodeId,
          message: ctx.parameters.message,
          approvers: ctx.parameters.approvers,
        }),
      });
    });
    
    // Wait for approval event
    const approval = await step.waitForEvent(`approval-${ctx.nodeId}`, {
      type: `approval-${ctx.nodeId}`,
      timeout: ctx.parameters.timeout || '24 hours',
    });
    
    return {
      approved: approval.payload.approved,
      approvedBy: approval.payload.approvedBy,
      reason: approval.payload.reason,
      approvedAt: new Date().toISOString(),
    };
  },
};

// HTTP Request Node
export const httpExecutor: NodeExecutor = {
  async execute(ctx, step, env) {
    return step.do(`http-${ctx.nodeId}`, {
      retries: {
        limit: ctx.parameters.retries || 3,
        delay: '5 seconds',
        backoff: 'exponential',
      },
      timeout: ctx.parameters.timeout || '30 seconds',
    }, async () => {
      const { url, method, headers, body, authentication } = ctx.parameters;
      
      const requestHeaders = { ...headers };
      
      // Handle authentication
      if (authentication?.type === 'bearer') {
        requestHeaders['Authorization'] = `Bearer ${authentication.token}`;
      } else if (authentication?.type === 'basic') {
        const encoded = btoa(`${authentication.username}:${authentication.password}`);
        requestHeaders['Authorization'] = `Basic ${encoded}`;
      }
      
      const response = await fetch(url, {
        method: method || 'GET',
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const contentType = response.headers.get('content-type');
      const data = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();
      
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      };
    });
  },
};

// Condition Node
export const conditionExecutor: NodeExecutor = {
  async execute(ctx, step, env) {
    return step.do(`condition-${ctx.nodeId}`, async () => {
      const { conditions, defaultBranch } = ctx.parameters;
      
      for (const condition of conditions) {
        const { field, operator, value, outputBranch } = condition;
        
        // Get field value from context
        const actualValue = getValueByPath(ctx.context, field);
        
        // Evaluate condition
        const matches = evaluateCondition(actualValue, operator, value);
        
        if (matches) {
          return { branch: outputBranch, matched: true };
        }
      }
      
      return { branch: defaultBranch, matched: false };
    });
  },
};

// Registry
export const nodeExecutors: Record<string, NodeExecutor> = {
  'ai-agent': aiAgentExecutor,
  'approval': approvalExecutor,
  'http': httpExecutor,
  'condition': conditionExecutor,
  // Add more as needed
};
```

---

## Cost Analysis

### Cloudflare Workflows Pricing

| Resource | Free Tier | Paid Tier | Notes |
|----------|-----------|-----------|-------|
| **Invocations** | 100k/day | 10M/month + $0.30/M | Per workflow execution |
| **CPU Time** | 10ms/invocation | 30M ms/month + $0.02/M | Active processing only |
| **Storage** | 1GB | 1GB + $0.20/GB-mo | Workflow state |
| **Concurrent** | 25 | 4,500 | Running instances |
| **Sleeping** | Unlimited | Unlimited | No cost |

### Example Workflows

#### Daily AI Digest (5 steps, 30s total CPU)

| Resource | Usage | Cost |
|----------|-------|------|
| Invocations | 30/month | Free tier |
| CPU Time | 30 × 30s = 900s | Free tier |
| Storage | ~10KB | Free tier |
| **Monthly** | | **$0.00** |

#### API Processing (1M/month, 50ms each)

| Resource | Usage | Cost |
|----------|-------|------|
| Invocations | 1M | $0.30 (over free) |
| CPU Time | 50M ms | $0.40 (over free) |
| Storage | ~100MB | Free tier |
| **Monthly** | | **$0.70** |

### Comparison

| Platform | 1M executions/month |
|----------|---------------------|
| **AgentPod (Cloudflare)** | **$0.70** |
| n8n Cloud | $20+ |
| Zapier | $50+ |
| Make | $20+ |

---

## Competitive Analysis

| Feature | AgentPod | n8n | Zapier | Make |
|---------|----------|-----|--------|------|
| **Visual Editor** | SvelteFlow | Custom Vue | Proprietary | Proprietary |
| **Edge Execution** | Cloudflare | Node.js | Cloud | Cloud |
| **Durable State** | Built-in | Redis queue | Polling | Polling |
| **AI Agents** | Native sandbox | HTTP only | HTTP only | HTTP only |
| **Human-in-Loop** | `waitForEvent` | Limited | No | Limited |
| **Long-Running** | Days/weeks | ~5 min | 30s | 40s |
| **Self-Hosted** | Open source | Open source | No | No |
| **Pricing** | Pay-per-use | $20/mo+ | $20/mo+ | $9/mo+ |

---

## Success Criteria

### MVP (Phase 1-2)

- [ ] Create workflow with 3+ connected nodes
- [ ] Save and load workflow from database
- [ ] Execute workflow end-to-end
- [ ] View execution status and logs
- [ ] AI Agent node works with Cloudflare Sandbox

### Launch (Phase 3)

- [ ] 5+ node types available
- [ ] Variable interpolation working
- [ ] Conditional branching working
- [ ] Real-time execution visualization
- [ ] 3+ workflow templates in gallery
- [ ] Documentation published

### Product-Market Fit

- [ ] 100+ workflows created
- [ ] 50+ active users
- [ ] 10+ community-shared templates
- [ ] Average workflow complexity >5 nodes

---

## Open Questions

### Technical Decisions

1. **Data Model**: Use n8n-compatible schema (easier import/export) or custom schema?
   - **Recommendation**: n8n-compatible for portability

2. **Storage**: Store in PostgreSQL (existing) or D1 (edge performance)?
   - **Recommendation**: PostgreSQL primary, sync to D1 for execution

3. **Real-time Updates**: Polling or SSE/WebSocket for execution status?
   - **Recommendation**: Start with polling, add SSE later

### Product Decisions

4. **Template Library**: Pre-build templates or let community create?
   - **Recommendation**: Both - ship with 3-5 official templates

5. **Marketplace**: Public marketplace for community nodes?
   - **Recommendation**: Phase 4 feature

6. **Collaboration**: Multiple users editing same workflow?
   - **Recommendation**: Phase 4 feature

### Prioritization

7. **First Node Types** (pick 5):
   - [ ] Manual Trigger ✓
   - [ ] AI Agent ✓
   - [ ] HTTP Request ✓
   - [ ] Approval ✓
   - [ ] Condition ✓
   - [ ] Code (JavaScript)
   - [ ] Webhook Trigger
   - [ ] Schedule Trigger
   - [ ] Email
   - [ ] Database

---

## References

### Documentation

- [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
- [SvelteFlow](https://svelteflow.dev/)
- [n8n Workflow Structure](https://docs.n8n.io/)

### Related AgentPod Docs

- [Cloudflare Implementation Guide](./cloudflare-implementation-guide.md)
- [Cloudflare Use Cases](../ideas/opencode-cloudflare-use-cases.md)
- [Cloudflare Sandbox Integration](../ideas/cloudflare-sandbox-integration.md)

### External Resources

- [Budibase Automation Builder](https://github.com/Budibase/budibase) - SvelteFlow in production
- [n8n Source Code](https://github.com/n8n-io/n8n) - Workflow schema reference
- [XYFlow GitHub](https://github.com/xyflow/xyflow) - SvelteFlow source

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-25 | AI | Initial planning document |
