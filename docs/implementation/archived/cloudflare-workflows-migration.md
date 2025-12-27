# Cloudflare Workflows SDK Migration Plan

> **Status:** ✅ **COMPLETED** (December 2025)  
> **Migration Type:** Big Bang  
> **Implementation:** `cloudflare/worker/src/workflows/sdk/workflow.ts`  
> **Wrangler Config:** `cloudflare/worker/wrangler.toml` (lines 54-57)

---

## ✅ Migration Complete

The custom DAG-based workflow executor has been **successfully replaced** with Cloudflare Workflows SDK.

### Key Achievements

| Feature | Status | Implementation |
|---------|--------|----------------|
| `AgentPodWorkflow extends WorkflowEntrypoint` | ✅ | `sdk/workflow.ts` |
| Durable steps with `step.do()` | ✅ | Per-node execution |
| Sleep/pause with `step.sleep()` | ✅ | Wait node support |
| Automatic retry with exponential backoff | ✅ | `WorkflowStepConfig` |
| Loop execution with Workflow steps | ✅ | `executeLoop()` method |
| Conditional branching support | ✅ | `shouldSkipNode()` logic |
| Status notifications to API | ✅ | `notifyAgentPodAPI()` |

### Benefits Realized

- ✅ **Unlimited duration** - Workflows can sleep for days/weeks
- ✅ **Automatic state persistence** - Via Cloudflare's durable execution
- ✅ **Built-in retry** - Configurable per step with exponential backoff
- ✅ **Crash recovery** - Survives Worker restarts
- ✅ **Visual dashboard** - Execution visible in Cloudflare console
- ✅ **~2,400 LOC reduction** - Simplified codebase

### Wrangler Configuration

```toml
[[workflows]]
name = "agentpod-workflow"
binding = "WORKFLOW"
class_name = "AgentPodWorkflow"
```

---

## Original Migration Plan (Reference Only)

The following was the **planning document** used to execute this migration.

---

## Overview

**Migration Type:** Big Bang  
**Timeline:** 1-2 weeks  
**Goal:** Replace custom DAG-based workflow executor with Cloudflare Workflows SDK

## Current State

### Custom Implementation (5,789 LOC)
```
cloudflare/worker/src/workflows/
├── executor.ts              # Main execution engine (479 LOC)
├── utils/
│   ├── dag-builder.ts       # Topological sort (215 LOC)
│   ├── context.ts           # Type definitions (154 LOC)
│   └── variable-interpolator.ts  # {{variable}} resolution (284 LOC)
└── nodes/
    ├── index.ts             # Node registry (76 LOC)
    ├── base.ts              # NodeExecutor interface (43 LOC)
    ├── trigger.ts           # Trigger nodes (97 LOC)
    ├── condition.ts         # Condition/switch (305 LOC)
    ├── http.ts              # HTTP requests (132 LOC)
    ├── code.ts              # JS execution, merge, loop (255 LOC)
    ├── ai/                  # AI nodes (~870 LOC)
    ├── data.ts              # Variables, JSON, aggregate (450 LOC)
    ├── filter.ts            # Data filtering (346 LOC)
    ├── transform.ts         # Data transformation (387 LOC)
    ├── notification.ts      # Email, Discord, Telegram (310 LOC)
    ├── cloudflare.ts        # D1, R2 (239 LOC)
    ├── human.ts             # Approval (105 LOC)
    ├── split.ts             # Fan-out (41 LOC)
    └── utility.ts           # Wait, error handler (240 LOC)
```

### Limitations of Current System
1. **30-second Worker timeout** - Cannot run long workflows
2. **No pause/resume** - Workflows must complete in single request
3. **Manual state management** - ExecutionContext passed through
4. **Manual retry logic** - 60 LOC of custom retry handling
5. **No hibernation** - Cannot sleep for hours/days

## Target State

### Cloudflare Workflows SDK
```typescript
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

export class AgentPodWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    // Automatic state persistence
    // Built-in retry with exponential backoff
    // Can sleep for days/weeks
    // Survives crashes
  }
}
```

### Benefits
1. **Unlimited duration** - Sleep for hours/days/weeks
2. **Automatic state persistence** - Via step returns
3. **Built-in retry** - Configurable per step
4. **Crash recovery** - Durable execution
5. **Visual dashboard** - Cloudflare console
6. **~2,400 LOC reduction** - Less code to maintain

## Architecture Design

### Key Decision: Interpreter Pattern

Since users create workflows via visual editor (JSON), we use an **interpreter pattern** - a single `AgentPodWorkflow` class that executes any JSON workflow definition.

```typescript
export class AgentPodWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { definition, triggerData } = event.payload;
    
    // Build execution context from step returns
    const context: WorkflowContext = {
      trigger: { type: event.payload.triggerType, data: triggerData },
      steps: {},
    };
    
    // Compute execution order (reuse dag-builder.ts)
    const executionOrder = computeExecutionOrder(definition.nodes, definition.connections);
    
    // Execute nodes via step.do()
    for (const nodeId of executionOrder) {
      const node = definition.nodes.find(n => n.id === nodeId);
      
      // Skip nodes based on conditional branching
      if (this.shouldSkipNode(nodeId, context)) continue;
      
      // Execute node as a durable step
      const result = await step.do(
        `node-${nodeId}`,
        { retries: { limit: 3, backoff: 'exponential' } },
        async () => this.executeNode(node, context)
      );
      
      // Store result for next nodes
      context.steps[nodeId] = result;
      
      // Notify AgentPod API
      await step.do(`status-${nodeId}`, async () => {
        await this.notifyStatus(nodeId, context);
      });
    }
    
    return { success: true, steps: context.steps };
  }
}
```

### Workflow Instance Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW LIFECYCLE                        │
│                                                              │
│  1. API Request                                              │
│     POST /execute                                            │
│     { workflowId, definition, triggerData }                 │
│                        │                                     │
│                        ▼                                     │
│  2. Create Workflow Instance                                 │
│     const instance = await env.WORKFLOW.create({            │
│       id: executionId,                                      │
│       params: { definition, triggerData }                   │
│     });                                                      │
│                        │                                     │
│                        ▼                                     │
│  3. Return Immediately                                       │
│     { executionId, status: 'queued' }                       │
│                        │                                     │
│                        ▼                                     │
│  4. Workflow Executes Asynchronously                        │
│     - Each node is a step.do()                              │
│     - State persists between steps                          │
│     - Can sleep/pause indefinitely                          │
│                        │                                     │
│                        ▼                                     │
│  5. Status Polling                                           │
│     GET /executions/:id/status                              │
│     → instance.status()                                      │
│                        │                                     │
│                        ▼                                     │
│  6. Completion                                               │
│     status: 'complete' | 'errored'                          │
│     output: { success, steps }                              │
└─────────────────────────────────────────────────────────────┘
```

## Migration Steps

### Phase 1: Setup (Day 1)

#### 1.1 Update wrangler.toml
```toml
name = "agentpod-sandbox"
main = "src/index.ts"
compatibility_date = "2024-12-01"

# Workflows binding
[[workflows]]
name = "agentpod-workflow"
binding = "WORKFLOW"
class_name = "AgentPodWorkflow"

# Existing bindings
[durable_objects]
bindings = [{ name = "Sandbox", class_name = "Sandbox" }]

[[r2_buckets]]
binding = "WORKSPACE_BUCKET"
bucket_name = "agentpod-workspaces"
```

#### 1.2 Update package.json
```json
{
  "dependencies": {
    "@cloudflare/workers-types": "^4.20241218.0"
  }
}
```

#### 1.3 Create Type Definitions
```typescript
// src/workflows/types.ts
import type { WorkflowDefinition, WorkflowNode } from './utils/context';

export interface WorkflowParams {
  executionId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  triggerType: 'manual' | 'webhook' | 'schedule' | 'event';
  triggerData: Record<string, unknown>;
  userId?: string;
}

export interface WorkflowContext {
  trigger: {
    type: string;
    data: Record<string, unknown>;
    timestamp: Date;
    userId?: string;
  };
  steps: Record<string, StepResult>;
  loop?: LoopContext;
}

export interface StepResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}
```

### Phase 2: Core Workflow Class (Day 2-3)

#### 2.1 Create AgentPodWorkflow
```typescript
// src/workflows/workflow.ts
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { computeExecutionOrder } from './utils/dag-builder';
import { interpolateVariables } from './utils/variable-interpolator';
import type { WorkflowParams, WorkflowContext, StepResult } from './types';

export class AgentPodWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { executionId, workflowId, definition, triggerType, triggerData, userId } = event.payload;
    
    // Initialize context (will be built up from step returns)
    let context: WorkflowContext = {
      trigger: {
        type: triggerType,
        data: triggerData,
        timestamp: new Date(),
        userId,
      },
      steps: {},
    };
    
    // Notify start
    await step.do('notify-start', async () => {
      await this.notifyStatus(executionId, workflowId, 'running', [], null);
    });
    
    try {
      // Compute execution order
      const executionOrder = computeExecutionOrder(
        definition.nodes,
        definition.connections
      );
      
      const completedSteps: string[] = [];
      
      // Execute each node
      for (const nodeId of executionOrder) {
        const node = definition.nodes.find(n => n.id === nodeId);
        if (!node) continue;
        
        // Check if should skip (conditional branching)
        const skipCheck = this.shouldSkipNode(nodeId, definition, context);
        if (skipCheck.skip) {
          continue;
        }
        
        // Execute node with retry
        const result = await step.do(
          `execute-${nodeId}`,
          {
            retries: {
              limit: node.retryConfig?.maxRetries ?? 3,
              delay: `${node.retryConfig?.retryDelayMs ?? 1000}ms`,
              backoff: 'exponential',
            },
            timeout: node.timeoutMs ? `${node.timeoutMs}ms` : '5 minutes',
          },
          async () => {
            return await this.executeNode(node, context, definition);
          }
        );
        
        // Update context with result
        context = {
          ...context,
          steps: {
            ...context.steps,
            [nodeId]: result,
          },
        };
        
        completedSteps.push(nodeId);
        
        // Notify progress
        await step.do(`notify-${nodeId}`, async () => {
          await this.notifyStatus(executionId, workflowId, 'running', completedSteps, nodeId);
        });
        
        // Handle special node types
        if (node.type === 'loop' && result.success) {
          context = await this.executeLoop(node, result, context, definition, step, completedSteps);
        }
      }
      
      // Notify completion
      await step.do('notify-complete', async () => {
        await this.notifyStatus(executionId, workflowId, 'completed', completedSteps, null, context.steps);
      });
      
      return { success: true, steps: context.steps };
      
    } catch (error) {
      // Notify error
      await step.do('notify-error', async () => {
        await this.notifyStatus(
          executionId,
          workflowId,
          'errored',
          [],
          null,
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      });
      
      throw error;
    }
  }
  
  // ... helper methods
}
```

### Phase 3: Node Execution (Day 4-5)

#### 3.1 Node Executor Mapping
Each node type maps to a function that returns step result:

```typescript
// src/workflows/node-handlers.ts
export type NodeHandler = (
  node: WorkflowNode,
  context: WorkflowContext,
  env: Env
) => Promise<StepResult>;

export const nodeHandlers: Record<string, NodeHandler> = {
  // Triggers
  'manual-trigger': handleManualTrigger,
  'webhook-trigger': handleWebhookTrigger,
  'schedule-trigger': handleScheduleTrigger,
  'event-trigger': handleEventTrigger,
  
  // Logic
  'condition': handleCondition,
  'switch': handleSwitch,
  'merge': handleMerge,
  'loop': handleLoop,
  'split': handleSplit,
  'filter': handleFilter,
  'transform': handleTransform,
  
  // Actions
  'http-request': handleHttpRequest,
  'javascript': handleJavaScript,
  'email': handleEmail,
  'discord': handleDiscord,
  'telegram': handleTelegram,
  
  // Data
  'set-variable': handleSetVariable,
  'parse-json': handleParseJson,
  'aggregate': handleAggregate,
  
  // Cloud
  'd1-query': handleD1Query,
  'r2-storage': handleR2Storage,
  
  // AI
  'ai-chat': handleAIChat,
  'ai-agent-tools': handleAIAgentTools,
  
  // Human
  'approval': handleApproval,
  
  // Utility
  'wait': handleWait,
  'error-handler': handleErrorHandler,
};
```

#### 3.2 Example Handler Migration

**Before (Custom):**
```typescript
// nodes/http.ts
export class HTTPNodeExecutor implements NodeExecutor {
  async execute(params: NodeExecutionParams): Promise<StepResult> {
    const { url, method, headers, body } = params.parameters;
    const response = await fetch(url, { method, headers, body });
    return createStepResult({ status: response.status, data: await response.json() });
  }
}
```

**After (Cloudflare Workflows):**
```typescript
// node-handlers/http.ts
export async function handleHttpRequest(
  node: WorkflowNode,
  context: WorkflowContext,
  env: Env
): Promise<StepResult> {
  const startTime = Date.now();
  
  try {
    // Interpolate variables
    const params = interpolateVariables(node.parameters, context);
    const { url, method = 'GET', headers = {}, body, authentication } = params;
    
    // Build request
    const requestHeaders: Record<string, string> = { ...headers };
    
    if (authentication?.type === 'bearer') {
      requestHeaders['Authorization'] = `Bearer ${authentication.token}`;
    }
    
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await response.json().catch(() => response.text());
    
    return {
      success: response.ok,
      data: { status: response.status, headers: Object.fromEntries(response.headers), data },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}
```

### Phase 4: Special Node Handling (Day 6-7)

#### 4.1 Conditional Branching
```typescript
shouldSkipNode(nodeId: string, definition: WorkflowDefinition, context: WorkflowContext): { skip: boolean; reason?: string } {
  // Find incoming edges
  const incomingEdges = this.getIncomingEdges(nodeId, definition.connections);
  
  for (const edge of incomingEdges) {
    const sourceResult = context.steps[edge.source];
    if (!sourceResult?.success) continue;
    
    const sourceNode = definition.nodes.find(n => n.id === edge.source);
    if (!sourceNode) continue;
    
    // Check if source is conditional
    if (sourceNode.type === 'condition' || sourceNode.type === 'switch') {
      const takenBranch = (sourceResult.data as { branch?: string })?.branch;
      const edgeBranch = edge.sourceHandle; // 'true', 'false', or case name
      
      if (takenBranch && edgeBranch && takenBranch !== edgeBranch) {
        return { skip: true, reason: `Branch ${edgeBranch} not taken (took ${takenBranch})` };
      }
    }
  }
  
  return { skip: false };
}
```

#### 4.2 Loop Execution
```typescript
async executeLoop(
  loopNode: WorkflowNode,
  loopResult: StepResult,
  context: WorkflowContext,
  definition: WorkflowDefinition,
  step: WorkflowStep,
  completedSteps: string[]
): Promise<WorkflowContext> {
  const items = (loopResult.data as { items?: unknown[] })?.items ?? [];
  const childNodes = this.getChildNodes(loopNode.id, definition);
  
  const loopResults: Array<{ index: number; item: unknown; results: Record<string, StepResult> }> = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Create loop context
    const loopContext: WorkflowContext = {
      ...context,
      loop: { $item: item, $index: i, $items: items, loopNodeId: loopNode.id },
    };
    
    const iterationResults: Record<string, StepResult> = {};
    
    // Execute child nodes for this iteration
    for (const childNode of childNodes) {
      const result = await step.do(
        `loop-${loopNode.id}-${i}-${childNode.id}`,
        { retries: { limit: 3, backoff: 'exponential' } },
        async () => this.executeNode(childNode, loopContext, definition)
      );
      
      iterationResults[childNode.id] = result;
      loopContext.steps[childNode.id] = result;
    }
    
    loopResults.push({ index: i, item, results: iterationResults });
  }
  
  // Update loop node result with iteration results
  return {
    ...context,
    steps: {
      ...context.steps,
      [loopNode.id]: {
        ...loopResult,
        data: { ...loopResult.data, loopResults },
      },
    },
  };
}
```

#### 4.3 Wait/Sleep Node
```typescript
// Uses native step.sleep()
async handleWait(
  node: WorkflowNode,
  context: WorkflowContext,
  step: WorkflowStep
): Promise<StepResult> {
  const duration = node.parameters.duration as string; // "5 seconds", "1 hour", etc.
  
  await step.sleep(`wait-${node.id}`, duration);
  
  return {
    success: true,
    data: { waited: duration },
    durationMs: 0, // Sleep doesn't count as execution time
  };
}
```

### Phase 5: API Integration (Day 8)

#### 5.1 Update Worker Entry Point
```typescript
// src/index.ts
import { AgentPodWorkflow } from './workflows/workflow';

export { AgentPodWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Create workflow instance
    if (url.pathname === '/execute' && request.method === 'POST') {
      const body = await request.json();
      const { executionId, workflowId, definition, triggerType, triggerData, userId } = body;
      
      // Create workflow instance
      const instance = await env.WORKFLOW.create({
        id: executionId,
        params: {
          executionId,
          workflowId,
          definition,
          triggerType,
          triggerData,
          userId,
        },
      });
      
      return Response.json({
        executionId,
        instanceId: instance.id,
        status: 'queued',
      });
    }
    
    // Get workflow status
    if (url.pathname.startsWith('/executions/') && url.pathname.endsWith('/status')) {
      const executionId = url.pathname.split('/')[2];
      
      try {
        const instance = await env.WORKFLOW.get(executionId);
        const status = await instance.status();
        
        return Response.json({
          executionId,
          status: status.status,
          output: status.output,
          error: status.error,
        });
      } catch {
        return Response.json({ error: 'Instance not found' }, { status: 404 });
      }
    }
    
    // Pause workflow
    if (url.pathname.startsWith('/executions/') && url.pathname.endsWith('/pause')) {
      const executionId = url.pathname.split('/')[2];
      const instance = await env.WORKFLOW.get(executionId);
      await instance.pause();
      return Response.json({ status: 'paused' });
    }
    
    // Resume workflow
    if (url.pathname.startsWith('/executions/') && url.pathname.endsWith('/resume')) {
      const executionId = url.pathname.split('/')[2];
      const instance = await env.WORKFLOW.get(executionId);
      await instance.resume();
      return Response.json({ status: 'resumed' });
    }
    
    // Terminate workflow
    if (url.pathname.startsWith('/executions/') && url.pathname.endsWith('/terminate')) {
      const executionId = url.pathname.split('/')[2];
      const instance = await env.WORKFLOW.get(executionId);
      await instance.terminate();
      return Response.json({ status: 'terminated' });
    }
    
    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', runtime: 'cloudflare-workflows' });
    }
    
    return new Response('Not found', { status: 404 });
  },
};
```

### Phase 6: Status Updates (Day 9)

#### 6.1 Notification Helper
```typescript
// src/workflows/notify.ts
export async function notifyAgentPodAPI(
  env: Env,
  executionId: string,
  workflowId: string,
  status: 'running' | 'waiting' | 'completed' | 'errored',
  completedSteps: string[],
  currentStep: string | null,
  result?: Record<string, unknown>,
  error?: string
): Promise<void> {
  if (!env.AGENTPOD_API_URL || !env.AGENTPOD_API_TOKEN) {
    console.log('[Workflow] API not configured, skipping status update');
    return;
  }
  
  const url = `${env.AGENTPOD_API_URL}/api/v2/workflow-executions/${executionId}/status`;
  
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.AGENTPOD_API_TOKEN}`,
      },
      body: JSON.stringify({
        executionId,
        workflowId,
        status,
        completedSteps,
        currentStep,
        result,
        error,
      }),
    });
    
    if (!response.ok) {
      console.error(`[Workflow] Status update failed: ${response.status}`);
    }
  } catch (err) {
    console.error('[Workflow] Failed to notify:', err);
  }
}
```

### Phase 7: Testing & Cleanup (Day 10)

#### 7.1 Test Migration
- Update existing tests to use new workflow structure
- Add integration tests for Cloudflare Workflows SDK
- Test pause/resume/terminate functionality
- Test long-running workflows with sleep

#### 7.2 Code Cleanup
Files to **DELETE**:
- `src/workflows/executor.ts` (replaced by workflow.ts)
- `src/workflows/nodes/index.ts` (replaced by node-handlers.ts)
- `src/workflows/nodes/base.ts` (no longer needed)

Files to **KEEP**:
- `src/workflows/utils/dag-builder.ts` (reused for execution order)
- `src/workflows/utils/variable-interpolator.ts` (reused for interpolation)
- `src/workflows/utils/context.ts` (types still needed)
- All node handler logic (refactored into node-handlers/)

## File Structure After Migration

```
cloudflare/worker/src/
├── index.ts                      # Worker entry point (updated)
├── workflows/
│   ├── workflow.ts               # AgentPodWorkflow class (NEW)
│   ├── types.ts                  # Type definitions (NEW)
│   ├── notify.ts                 # Status update helper (NEW)
│   ├── node-handlers/            # Node execution logic (REFACTORED)
│   │   ├── index.ts              # Handler registry
│   │   ├── triggers.ts           # Trigger handlers
│   │   ├── logic.ts              # Condition, switch, merge, loop
│   │   ├── actions.ts            # HTTP, notifications
│   │   ├── data.ts               # Variables, JSON, aggregate
│   │   ├── ai.ts                 # AI chat, agent tools
│   │   ├── cloud.ts              # D1, R2
│   │   └── utility.ts            # Wait, error handler
│   └── utils/
│       ├── dag-builder.ts        # (unchanged)
│       ├── variable-interpolator.ts  # (unchanged)
│       └── context.ts            # (updated types)
└── sandbox.ts                    # Durable Object (unchanged)
```

## Rollback Plan

If migration fails:
1. Revert wrangler.toml changes
2. Restore executor.ts from git
3. Keep new workflow.ts as separate file for future
4. Document issues encountered

## Success Criteria

1. ✅ All 21 node types working in new system
2. ✅ Status updates reaching AgentPod API
3. ✅ Conditional branching working correctly
4. ✅ Loop execution with proper context
5. ✅ Retry logic functioning per step
6. ✅ Long-running workflows with sleep
7. ✅ Pause/resume/terminate from API
8. ✅ All existing tests passing
9. ✅ Visual workflow builder integration verified

## Timeline Summary

| Day | Phase | Tasks |
|-----|-------|-------|
| 1 | Setup | wrangler.toml, types, project structure |
| 2-3 | Core | AgentPodWorkflow class, basic execution |
| 4-5 | Nodes | Migrate all 21 node handlers |
| 6-7 | Special | Conditionals, loops, wait/sleep |
| 8 | API | Entry point, instance management |
| 9 | Integration | Status updates, notifications |
| 10 | Testing | Tests, cleanup, documentation |
