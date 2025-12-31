# Agent Framework Integration Guide

**Last Updated**: December 2025

---

## Overview

This guide explains how to integrate the Agent Framework into AgentPod's existing systems. The framework is designed as a standalone package (`@agentpod/agents`) that can be consumed by the Management API, Frontend, and OpenCode containers.

---

## Package Structure

```
packages/agents/
├── src/
│   ├── core/                        # Framework (MIT Licensed)
│   │   ├── types/
│   │   │   ├── personality.ts       # Personality dimension types
│   │   │   ├── config.ts            # Agent configuration types
│   │   │   ├── workflow.ts          # Workflow types
│   │   │   └── index.ts
│   │   ├── orchestrator.ts          # Central routing logic
│   │   ├── prompt-builder.ts        # System prompt construction
│   │   └── index.ts
│   │
│   ├── library/                     # Agent definitions (Proprietary IP)
│   │   ├── central/
│   │   │   └── agentpod-central.ts
│   │   ├── development/
│   │   │   ├── kai-coder.ts
│   │   │   ├── dana-debugger.ts
│   │   │   ├── alex-architect.ts
│   │   │   ├── tess-tester.ts
│   │   │   ├── sam-security.ts
│   │   │   └── index.ts
│   │   ├── product/
│   │   │   ├── pete-product.ts
│   │   │   ├── spencer-specs.ts
│   │   │   ├── river-roadmap.ts
│   │   │   └── index.ts
│   │   ├── operations/
│   │   │   ├── olivia-operations.ts
│   │   │   ├── nora-notifier.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── workflows/                   # Workflow definitions
│   │   ├── pr-review.ts
│   │   ├── incident-response.ts
│   │   ├── feature-prioritization.ts
│   │   └── index.ts
│   │
│   └── index.ts                     # Public API
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Installation

### 1. Add to Workspace

The package is part of the monorepo, referenced via workspace:

```json
// apps/api/package.json
{
  "dependencies": {
    "@agentpod/agents": "workspace:*"
  }
}
```

### 2. Build Package

```bash
pnpm build --filter @agentpod/agents
```

---

## API Integration

### Service Layer

Create an orchestrator service that wraps the agent framework:

```typescript
// apps/api/src/services/agents/orchestrator.service.ts

import { 
  AgentOrchestrator, 
  allAgents, 
  workflows,
  type RoutingDecision,
  type AgentConfig 
} from '@agentpod/agents'
import { db } from '../../db'
import { agentSessions, agentMetrics } from '../../db/schema'

export class AgentOrchestratorService {
  private orchestrator: AgentOrchestrator

  constructor() {
    // Initialize orchestrator with all agents
    this.orchestrator = new AgentOrchestrator(allAgents, workflows)
  }

  /**
   * Process a user message with automatic agent routing
   */
  async processMessage(params: {
    userId: string
    sandboxId: string
    sessionId: string
    message: string
    context?: Record<string, unknown>
  }): Promise<ProcessedResponse> {
    const { userId, sandboxId, sessionId, message, context } = params

    // 1. Route to appropriate agent(s)
    const decision = await this.orchestrator.route({
      message,
      context,
      sandboxId
    })

    // 2. Create session record
    const session = await this.createSession({
      userId,
      sandboxId,
      sessionId,
      decision,
      message
    })

    // 3. Execute based on routing decision
    const response = await this.execute(decision, message, context)

    // 4. Update session with response
    await this.updateSession(session.id, response)

    // 5. Track metrics
    await this.recordMetrics(decision.agents, session.id)

    return {
      sessionId: session.id,
      agents: decision.agents.map(a => ({
        name: a.name,
        role: a.role,
        emoji: a.emoji
      })),
      response: response.content,
      metadata: {
        routingType: decision.type,
        executionTime: response.executionTime,
        tokensUsed: response.tokensUsed
      }
    }
  }

  private async execute(
    decision: RoutingDecision,
    message: string,
    context?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    switch (decision.type) {
      case 'single':
        return this.executeSingleAgent(decision.agents[0], message, context)
      
      case 'team':
        return this.executeTeam(
          decision.agents,
          decision.coordinator!,
          message,
          context
        )
      
      case 'workflow':
        return this.executeWorkflow(decision.workflow!, message, context)
    }
  }

  private async executeSingleAgent(
    agent: AgentConfig,
    message: string,
    context?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    
    // Build the full prompt with personality
    const systemPrompt = agent.systemPrompt
    
    // Call LLM (via OpenCode or directly)
    const response = await this.callLLM({
      model: agent.model,
      systemPrompt,
      userMessage: message,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      context
    })

    return {
      content: response.content,
      executionTime: Date.now() - startTime,
      tokensUsed: response.tokensUsed
    }
  }

  private async executeTeam(
    agents: AgentConfig[],
    coordinator: AgentConfig,
    message: string,
    context?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    
    // Execute all agents in parallel
    const responses = await Promise.all(
      agents.map(agent => 
        this.executeSingleAgent(agent, message, context)
      )
    )

    // Have coordinator synthesize responses
    const synthesisPrompt = this.buildSynthesisPrompt(agents, responses)
    const synthesis = await this.callLLM({
      model: coordinator.model,
      systemPrompt: coordinator.systemPrompt,
      userMessage: synthesisPrompt,
      temperature: coordinator.temperature
    })

    return {
      content: synthesis.content,
      executionTime: Date.now() - startTime,
      tokensUsed: responses.reduce((sum, r) => sum + r.tokensUsed, 0) + synthesis.tokensUsed
    }
  }

  private buildSynthesisPrompt(
    agents: AgentConfig[],
    responses: ExecutionResult[]
  ): string {
    let prompt = 'Synthesize the following agent responses into a coherent answer:\n\n'
    
    agents.forEach((agent, i) => {
      prompt += `## ${agent.name} (${agent.role}):\n${responses[i].content}\n\n`
    })

    prompt += 'Provide a unified response that:\n'
    prompt += '1. Highlights critical issues first\n'
    prompt += '2. Combines insights without repetition\n'
    prompt += '3. Attributes recommendations to the appropriate agent\n'

    return prompt
  }

  // ... additional helper methods
}
```

### Route Handler

```typescript
// apps/api/src/routes/agents/chat.ts

import { Hono } from 'hono'
import { z } from 'zod'
import { AgentOrchestratorService } from '../../services/agents/orchestrator.service'

const chatRouter = new Hono()
const orchestratorService = new AgentOrchestratorService()

const chatSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  context: z.record(z.unknown()).optional()
})

// Chat with automatic agent routing
chatRouter.post('/sandboxes/:sandboxId/chat', async (c) => {
  const { sandboxId } = c.req.param()
  const userId = c.get('userId') // From auth middleware
  const body = await c.req.json()
  
  const { message, sessionId, context } = chatSchema.parse(body)

  const result = await orchestratorService.processMessage({
    userId,
    sandboxId,
    sessionId: sessionId || crypto.randomUUID(),
    message,
    context
  })

  return c.json(result)
})

// List available agents
chatRouter.get('/agents', async (c) => {
  const agents = orchestratorService.listAgents()
  return c.json({ agents })
})

// Get agent details
chatRouter.get('/agents/:name', async (c) => {
  const { name } = c.req.param()
  const agent = orchestratorService.getAgent(name)
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404)
  }
  
  return c.json({ agent })
})

export { chatRouter }
```

---

## Database Schema

Add agent-related tables:

```typescript
// apps/api/src/db/schema/agents.ts

import { pgTable, uuid, text, varchar, integer, timestamp, jsonb, decimal } from 'drizzle-orm/pg-core'

export const agentSessions = pgTable('agent_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  sandboxId: uuid('sandbox_id').references(() => sandboxes.id),
  
  // Routing info
  routingType: varchar('routing_type', { length: 20 }).notNull(),
  primaryAgent: varchar('primary_agent', { length: 50 }),
  allAgents: text('all_agents').array(),
  workflowId: varchar('workflow_id', { length: 100 }),
  
  // Messages
  userMessage: text('user_message').notNull(),
  agentResponse: text('agent_response'),
  
  // Timing
  routingTimeMs: integer('routing_time_ms'),
  executionTimeMs: integer('execution_time_ms'),
  tokensUsed: integer('tokens_used'),
  
  // Status
  status: varchar('status', { length: 20 }).default('processing'),
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at')
})

export const agentMetrics = pgTable('agent_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentName: varchar('agent_name', { length: 50 }).notNull(),
  
  // Daily aggregates
  date: timestamp('date').notNull(),
  invocations: integer('invocations').default(0),
  successful: integer('successful').default(0),
  failed: integer('failed').default(0),
  
  // Performance
  avgExecutionTimeMs: integer('avg_execution_time_ms'),
  avgTokensUsed: integer('avg_tokens_used'),
  
  // Quality
  avgRating: decimal('avg_rating', { precision: 3, scale: 2 }),
  ratingCount: integer('rating_count').default(0)
})

export const agentFeedback = pgTable('agent_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => agentSessions.id),
  userId: uuid('user_id').references(() => users.id),
  agentName: varchar('agent_name', { length: 50 }).notNull(),
  
  rating: integer('rating'), // 1-5
  feedbackType: varchar('feedback_type', { length: 20 }),
  comment: text('comment'),
  
  createdAt: timestamp('created_at').defaultNow()
})
```

Run migration:

```bash
cd apps/api && bun run db:migrate
```

---

## Frontend Integration

### Agent Display Component

```svelte
<!-- apps/frontend/src/lib/components/chat/AgentMessage.svelte -->
<script lang="ts">
  export let agent: {
    name: string
    role: string
    emoji: string
    avatar?: string
  }
  export let message: string
  export let timestamp: Date
</script>

<div class="agent-message">
  <div class="agent-header">
    <div class="agent-avatar">
      {#if agent.avatar}
        <img src={agent.avatar} alt={agent.name} />
      {:else}
        <span class="agent-emoji">{agent.emoji}</span>
      {/if}
    </div>
    <div class="agent-info">
      <span class="agent-name">{agent.name}</span>
      <span class="agent-role">{agent.role}</span>
    </div>
    <time class="message-time">
      {timestamp.toLocaleTimeString()}
    </time>
  </div>
  
  <div class="message-content">
    {@html message}
  </div>
</div>

<style>
  .agent-message {
    padding: var(--spacing-4);
    border-radius: var(--radius-lg);
    background: var(--color-surface-2);
  }
  
  .agent-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    margin-bottom: var(--spacing-3);
  }
  
  .agent-avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    background: var(--color-surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .agent-emoji {
    font-size: 1.25rem;
  }
  
  .agent-name {
    font-weight: 600;
    color: var(--color-text-1);
  }
  
  .agent-role {
    font-size: var(--font-size-sm);
    color: var(--color-text-3);
  }
  
  .message-time {
    margin-left: auto;
    font-size: var(--font-size-xs);
    color: var(--color-text-4);
  }
</style>
```

### Agent Indicator

Show which agents are involved in the current conversation:

```svelte
<!-- apps/frontend/src/lib/components/chat/AgentIndicator.svelte -->
<script lang="ts">
  export let agents: Array<{
    name: string
    emoji: string
    role: string
  }>
</script>

{#if agents.length > 0}
  <div class="agent-indicator">
    <span class="label">Assisted by:</span>
    <div class="agent-badges">
      {#each agents as agent}
        <div class="agent-badge" title={agent.role}>
          <span class="emoji">{agent.emoji}</span>
          <span class="name">{agent.name}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
```

---

## OpenCode Container Integration

For sandboxes, agents can be invoked within the OpenCode context:

```typescript
// docker/base/acp-gateway/src/agent-handler.ts

import { AgentOrchestrator, allAgents } from '@agentpod/agents'

export class SandboxAgentHandler {
  private orchestrator: AgentOrchestrator

  constructor() {
    this.orchestrator = new AgentOrchestrator(allAgents)
  }

  /**
   * Handle agent request within sandbox context
   */
  async handleRequest(params: {
    message: string
    workingDirectory: string
    currentFile?: string
    selection?: string
  }): Promise<AgentResponse> {
    const context = {
      workingDirectory: params.workingDirectory,
      currentFile: params.currentFile,
      selection: params.selection,
      environment: 'sandbox'
    }

    const decision = await this.orchestrator.route({
      message: params.message,
      context
    })

    // Execute and return
    // ...
  }
}
```

---

## Configuration

### Environment Variables

```bash
# apps/api/.env

# Agent Configuration
AGENT_DEFAULT_MODEL=anthropic/claude-sonnet-4
AGENT_FALLBACK_MODEL=openai/gpt-4o
AGENT_MAX_TOKENS=8000
AGENT_TEMPERATURE=0.1

# Rate Limiting
AGENT_RATE_LIMIT_REQUESTS=60
AGENT_RATE_LIMIT_TOKENS=100000

# Metrics
AGENT_METRICS_ENABLED=true
AGENT_METRICS_SAMPLE_RATE=1.0
```

### Runtime Configuration

```typescript
// apps/api/src/config/agents.ts

export const agentConfig = {
  defaultModel: process.env.AGENT_DEFAULT_MODEL || 'anthropic/claude-sonnet-4',
  fallbackModel: process.env.AGENT_FALLBACK_MODEL || 'openai/gpt-4o',
  maxTokens: parseInt(process.env.AGENT_MAX_TOKENS || '8000'),
  temperature: parseFloat(process.env.AGENT_TEMPERATURE || '0.1'),
  
  rateLimiting: {
    requests: parseInt(process.env.AGENT_RATE_LIMIT_REQUESTS || '60'),
    tokens: parseInt(process.env.AGENT_RATE_LIMIT_TOKENS || '100000')
  },
  
  metrics: {
    enabled: process.env.AGENT_METRICS_ENABLED === 'true',
    sampleRate: parseFloat(process.env.AGENT_METRICS_SAMPLE_RATE || '1.0')
  }
}
```

---

## Testing

### Unit Tests

```typescript
// packages/agents/src/core/__tests__/orchestrator.test.ts

import { describe, test, expect } from 'bun:test'
import { AgentOrchestrator } from '../orchestrator'
import { allAgents } from '../../library'

describe('AgentOrchestrator', () => {
  const orchestrator = new AgentOrchestrator(allAgents)

  test('routes code review to Kai', async () => {
    const decision = await orchestrator.route({
      message: 'Please review this code for quality issues'
    })

    expect(decision.type).toBe('single')
    expect(decision.agents[0].name).toBe('Kai')
  })

  test('routes security concerns to Sam', async () => {
    const decision = await orchestrator.route({
      message: 'Check this for security vulnerabilities'
    })

    expect(decision.agents.some(a => a.name === 'Sam')).toBe(true)
  })

  test('uses team for multi-domain requests', async () => {
    const decision = await orchestrator.route({
      message: 'Review this PR for security and code quality'
    })

    expect(decision.type).toBe('team')
    expect(decision.agents.length).toBeGreaterThan(1)
  })
})
```

### Integration Tests

```typescript
// apps/api/tests/agents/orchestrator.test.ts

import { describe, test, expect } from 'bun:test'
import { app } from '../../src'

describe('Agent API', () => {
  test('POST /sandboxes/:id/chat returns agent response', async () => {
    const response = await app.request('/sandboxes/test-sandbox/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Review this code',
        sessionId: 'test-session'
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    })

    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.agents).toBeDefined()
    expect(data.response).toBeDefined()
  })
})
```

---

## Monitoring

### Grafana Dashboard

Import the agent metrics dashboard:

```json
// config/grafana/provisioning/dashboards/agents.json
{
  "title": "Agent Metrics",
  "panels": [
    {
      "title": "Agent Invocations",
      "type": "timeseries",
      "datasource": "PostgreSQL",
      "targets": [{
        "rawSql": "SELECT date, agent_name, invocations FROM agent_metrics WHERE date > now() - interval '7 days'"
      }]
    },
    {
      "title": "Average Response Time",
      "type": "gauge",
      "datasource": "PostgreSQL",
      "targets": [{
        "rawSql": "SELECT agent_name, avg_execution_time_ms FROM agent_metrics WHERE date = current_date"
      }]
    },
    {
      "title": "User Satisfaction",
      "type": "stat",
      "datasource": "PostgreSQL",
      "targets": [{
        "rawSql": "SELECT agent_name, avg_rating FROM agent_metrics WHERE date = current_date ORDER BY avg_rating DESC LIMIT 5"
      }]
    }
  ]
}
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Agent not responding | Model rate limit | Check LLM provider limits |
| Wrong agent selected | Trigger mismatch | Update delegation triggers |
| Slow response | Team collaboration | Optimize parallel execution |
| Personality drift | Prompt too long | Refine system prompt |

### Debug Mode

Enable verbose logging:

```typescript
// apps/api/src/services/agents/orchestrator.service.ts

const DEBUG = process.env.AGENT_DEBUG === 'true'

if (DEBUG) {
  console.log('Routing decision:', decision)
  console.log('Selected agents:', decision.agents.map(a => a.name))
}
```

---

*Next: [Prompt Engineering Guide](./prompt-engineering.md)*
