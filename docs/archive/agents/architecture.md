# Agent Framework Architecture

**Last Updated**: December 2025

---

## Table of Contents

- [System Overview](#system-overview)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Integration Architecture](#integration-architecture)
- [Database Schema](#database-schema)
- [Scalability Considerations](#scalability-considerations)

---

## System Overview

The Agent Framework follows a **hub-and-spoke** architecture where a central orchestrator coordinates all agent interactions. This design ensures:

- **Coherent responses**: No conflicting advice from multiple agents
- **Efficient routing**: Right agent for the right task
- **Observable behavior**: All interactions logged and measurable
- **Graceful degradation**: Fallback to general assistance if routing fails

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Desktop App    │  │   Mobile App    │  │   Web (Future)  │             │
│  │  (Tauri/Svelte) │  │   (Tauri v2)    │  │                 │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    MANAGEMENT API (Bun + Hono)                        │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │              AGENT ORCHESTRATOR SERVICE                        │  │  │
│  │  │                                                                │  │  │
│  │  │  ┌──────────────────────────────────────────────────────────┐ │  │  │
│  │  │  │            AgentPod Central (Orchestrator)               │ │  │  │
│  │  │  │                                                          │ │  │  │
│  │  │  │  1. Intent Analysis ──────────────────────────────────┐ │ │  │  │
│  │  │  │  2. Complexity Assessment                             │ │ │  │  │
│  │  │  │  3. Personality Matching ─────────────────────────────┤ │ │  │  │
│  │  │  │  4. Team Routing                                      │ │ │  │  │
│  │  │  │  5. Workflow Selection ───────────────────────────────┤ │ │  │  │
│  │  │  │  6. Response Aggregation                              │ │ │  │  │
│  │  │  └──────────────────────────────────────────────────────────┘ │  │  │
│  │  │                              │                                 │  │  │
│  │  │          ┌───────────────────┼───────────────────┐            │  │  │
│  │  │          ▼                   ▼                   ▼            │  │  │
│  │  │   ┌────────────┐     ┌────────────┐     ┌────────────┐       │  │  │
│  │  │   │   Dev      │     │  Product   │     │    Ops     │       │  │  │
│  │  │   │   Squad    │     │   Squad    │     │   Squad    │       │  │  │
│  │  │   │            │     │            │     │            │       │  │  │
│  │  │   │ Kai        │     │ Pete       │     │ Olivia     │       │  │  │
│  │  │   │ Dana       │     │ Spencer    │     │ Nora       │       │  │  │
│  │  │   │ Alex       │     │ River      │     │            │       │  │  │
│  │  │   │ Tess       │     │            │     │            │       │  │  │
│  │  │   │ Sam        │     │            │     │            │       │  │  │
│  │  │   └────────────┘     └────────────┘     └────────────┘       │  │  │
│  │  │                                                                │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  ┌───────────────────────────────────────────────────────────────┐   │  │
│  │  │  PostgreSQL: agent_sessions, agent_metrics, agent_feedback   │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                │                                            │
│                                ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                       SANDBOX LAYER                                   │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │  │
│  │   │  Sandbox A  │  │  Sandbox B  │  │  Sandbox C  │                  │  │
│  │   │  OpenCode   │  │  OpenCode   │  │  OpenCode   │                  │  │
│  │   │  + Context  │  │  + Context  │  │  + Context  │                  │  │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. AgentPod Central (Orchestrator)

The central intelligence that coordinates all agent interactions.

**Responsibilities:**
- Analyze user intent and classify request type
- Assess complexity and urgency
- Match request to appropriate agent(s) based on personality and expertise
- Coordinate multi-agent workflows
- Aggregate and synthesize responses
- Handle escalation and fallback

**Location:** `packages/agents/src/library/central/agentpod-central.ts`

**Key Methods:**
```typescript
class AgentOrchestrator {
  // Analyze and route user request
  route(request: UserRequest): Promise<RoutingDecision>
  
  // Execute single agent
  invokeSingleAgent(agent: AgentConfig, message: string): Promise<AgentResponse>
  
  // Execute team collaboration
  invokeTeam(agents: AgentConfig[], coordinator: AgentConfig): Promise<TeamResponse>
  
  // Execute workflow
  executeWorkflow(workflow: Workflow, message: string): Promise<WorkflowResponse>
}
```

### 2. Agent Configurations

Individual agent definitions including personality, model config, and system prompts.

**Structure:**
```typescript
interface AgentConfig {
  // Identity
  name: string
  role: string
  emoji?: string
  avatar?: string
  
  // Organization
  squad: Squad
  tier: AgentTier
  
  // Personality
  personality: AgentPersonality
  intelligenceLevel: IntelligenceLevel
  
  // Model
  model: string
  temperature: number
  maxTokens?: number
  tools?: ToolRestrictions
  
  // Prompt
  systemPrompt: string
  
  // Routing
  delegationTriggers?: string[]
  relatedAgents?: string[]
  workflows?: string[]
}
```

### 3. Personality System

Defines how agents behave and communicate.

**Dimensions:**
| Dimension | Options | Purpose |
|-----------|---------|---------|
| Expertise | specialist, generalist, master | Depth vs breadth |
| Communication | formal, casual, technical, encouraging, analytical | Tone |
| Interaction | proactive, reactive, collaborative, independent | Initiative |
| Learning | adaptive, systematic, innovative, traditional | Approach |
| Energy | high, moderate, calm | Pace |

### 4. Workflow Engine

Coordinates multi-agent tasks through defined sequences.

**Workflow Structure:**
```typescript
interface Workflow {
  id: string
  name: string
  description: string
  trigger: WorkflowTrigger
  participants: WorkflowParticipant[]
  steps: WorkflowStep[]
  successCriteria: string[]
}
```

---

## Data Flow

### Request Processing Flow

```
┌─────────────┐
│ User sends  │
│  message    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│            AgentPod Central                         │
│                                                     │
│  1. Parse message + context                         │
│  2. Classify intent:                                │
│     • Type: question/task/review/debug/...         │
│     • Complexity: simple/moderate/complex          │
│     • Urgency: low/normal/high/critical            │
│     • Domain: [development, security, product...]  │
│                                                     │
│  3. Check for workflow match                        │
│     • "review code" → pr-review workflow           │
│     • "production down" → incident-response        │
│                                                     │
│  4. Select agent(s):                               │
│     • Single: Simple request, clear domain         │
│     • Team: Complex, multi-domain                  │
│     • Workflow: Matches defined pattern            │
│                                                     │
│  5. Build delegation prompt with:                   │
│     • TASK: Specific goal                          │
│     • CONTEXT: User message, sandbox state         │
│     • CONSTRAINTS: What agent must/must not do     │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   ┌───────────┐ ┌───────────┐ ┌───────────┐
   │  Single   │ │   Team    │ │ Workflow  │
   │  Agent    │ │  Collab   │ │ Execution │
   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
         │             │             │
         └─────────────┼─────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│            Response Aggregation                      │
│                                                     │
│  • Combine agent outputs                            │
│  • Resolve conflicts                                │
│  • Format for user                                  │
│  • Track metrics                                    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
              ┌─────────────┐
              │   Return    │
              │  to user    │
              └─────────────┘
```

### Team Collaboration Flow

```
User: "Review this PR for security and performance"

┌─────────────────────────────────────────────────────┐
│  AgentPod Central detects:                          │
│  • Multiple domains: security + performance         │
│  • Workflow match: pr-review                        │
│  • Required agents: Kai, Sam, Vince                 │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │     Parallel Execution       │
        │                              │
        │  ┌────────┐ ┌────────┐      │
        │  │  Kai   │ │  Sam   │      │
        │  │(Review)│ │(Secur.)│      │
        │  └───┬────┘ └───┬────┘      │
        │      │          │           │
        └──────┼──────────┼───────────┘
               │          │
               ▼          ▼
        ┌─────────────────────────────┐
        │    Results Aggregation      │
        │                             │
        │  Kai: "Code quality good,   │
        │        suggest refactoring  │
        │        lines 45-60"         │
        │                             │
        │  Sam: "CRITICAL: SQL        │
        │        injection in line 23"│
        └──────────────┬──────────────┘
                       │
                       ▼
        ┌─────────────────────────────┐
        │    Synthesized Response     │
        │                             │
        │  "## PR Review              │
        │                             │
        │  ### Critical Issues 🚨     │
        │  Sam identified SQL         │
        │  injection vulnerability... │
        │                             │
        │  ### Code Quality           │
        │  Kai suggests refactoring..."│
        └─────────────────────────────┘
```

---

## Integration Architecture

### Management API Integration

```
apps/api/
├── src/
│   ├── services/
│   │   └── agents/
│   │       ├── orchestrator.service.ts   # Main orchestration logic
│   │       ├── agent-executor.service.ts # Individual agent execution
│   │       ├── workflow.service.ts       # Workflow coordination
│   │       └── metrics.service.ts        # Performance tracking
│   │
│   ├── routes/
│   │   └── agents/
│   │       ├── index.ts                  # Agent routes
│   │       ├── chat.ts                   # Chat with agent routing
│   │       └── workflows.ts              # Workflow management
│   │
│   └── db/
│       └── schema/
│           └── agents.ts                 # Agent-related tables
```

### API Endpoints

```yaml
# Chat with automatic agent routing
POST /api/sandboxes/:id/chat
{
  "message": "Review this code for security issues",
  "context": {
    "files": ["src/auth.ts"],
    "sessionId": "sess_123"
  }
}

Response:
{
  "sessionId": "sess_123",
  "agents": [
    { "name": "Kai", "role": "Code Reviewer" },
    { "name": "Sam", "role": "Security Specialist" }
  ],
  "response": "## Code Review...",
  "metrics": {
    "routingTime": 45,
    "executionTime": 2340,
    "tokensUsed": 1250
  }
}

# List available agents
GET /api/agents

# Get agent details
GET /api/agents/:name

# List workflows
GET /api/workflows

# Execute specific workflow
POST /api/workflows/:id/execute
```

### Frontend Integration

```typescript
// Agent display in chat
interface AgentMessageProps {
  agent: {
    name: string
    role: string
    emoji: string
    avatar: string
  }
  message: string
  timestamp: Date
}

// Agent selector (optional override)
interface AgentSelectorProps {
  agents: AgentConfig[]
  selected?: string
  onSelect: (agentName: string) => void
}
```

---

## Database Schema

```sql
-- Agent session tracking
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  sandbox_id UUID REFERENCES sandboxes(id),
  
  -- Routing info
  routing_type VARCHAR(20) NOT NULL, -- 'single', 'team', 'workflow'
  primary_agent VARCHAR(50),
  all_agents TEXT[], -- Array of agent names
  workflow_id VARCHAR(100),
  
  -- Messages
  user_message TEXT NOT NULL,
  agent_response TEXT,
  
  -- Timing
  routing_time_ms INTEGER,
  execution_time_ms INTEGER,
  tokens_used INTEGER,
  
  -- Status
  status VARCHAR(20) DEFAULT 'processing',
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Agent performance metrics
CREATE TABLE agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(50) NOT NULL,
  
  -- Counters (daily aggregates)
  date DATE NOT NULL,
  invocations INTEGER DEFAULT 0,
  successful INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  
  -- Performance
  avg_execution_time_ms INTEGER,
  avg_tokens_used INTEGER,
  
  -- Quality (from feedback)
  avg_rating DECIMAL(3,2),
  rating_count INTEGER DEFAULT 0,
  
  UNIQUE(agent_name, date)
);

-- User feedback on agent responses
CREATE TABLE agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id),
  user_id UUID REFERENCES users(id),
  agent_name VARCHAR(50) NOT NULL,
  
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_type VARCHAR(20), -- 'helpful', 'accurate', 'clear', 'other'
  comment TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_user ON agent_sessions(user_id);
CREATE INDEX idx_sessions_sandbox ON agent_sessions(sandbox_id);
CREATE INDEX idx_sessions_agent ON agent_sessions(primary_agent);
CREATE INDEX idx_metrics_agent_date ON agent_metrics(agent_name, date);
CREATE INDEX idx_feedback_session ON agent_feedback(session_id);
```

---

## Scalability Considerations

### Horizontal Scaling

```
                    Load Balancer
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  API 1   │    │  API 2   │    │  API 3   │
   │          │    │          │    │          │
   │ Orch.    │    │ Orch.    │    │ Orch.    │
   │ Service  │    │ Service  │    │ Service  │
   └────┬─────┘    └────┬─────┘    └────┬─────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   PostgreSQL     │
              │   (agent data)   │
              └──────────────────┘
```

### Caching Strategy

| Data | Cache | TTL | Purpose |
|------|-------|-----|---------|
| Agent configs | In-memory | App lifetime | Avoid repeated parsing |
| Routing decisions | Redis | 5 min | Cache similar requests |
| Agent metrics | Redis | 1 hour | Dashboard performance |
| Workflow definitions | In-memory | App lifetime | Static definitions |

### Rate Limiting

```typescript
// Per-user rate limits
const rateLimits = {
  chat: {
    requests: 60,      // requests per minute
    tokens: 100000,    // tokens per hour
  },
  workflow: {
    requests: 10,      // workflow executions per hour
  }
}
```

### Cost Optimization

1. **Model tiering**: Use cheaper models for simple routing, expensive for complex tasks
2. **Caching**: Cache common request patterns
3. **Batching**: Combine multiple agent calls when possible
4. **Early exit**: Stop workflow if critical failure detected

---

## Security Considerations

### Agent Isolation

- Agents cannot access other users' data
- Sandbox context limited to current project
- Tool restrictions enforced per-agent

### Prompt Injection Protection

- User input sanitized before inclusion in prompts
- System prompts separated from user content
- Output validation for sensitive operations

### Audit Logging

All agent interactions logged with:
- User ID
- Sandbox ID
- Request/response content
- Agent(s) involved
- Execution metrics

---

*Next: [Personality Framework](./personality-framework.md)*
