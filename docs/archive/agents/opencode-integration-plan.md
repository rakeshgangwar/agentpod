# OpenCode Native Agent Integration Plan

**Version**: 2.0.0  
**Last Updated**: December 2025  
**Status**: Implemented

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Solution Architecture](#solution-architecture)
- [OpenCode Agent Format](#opencode-agent-format)
- [Implementation Details](#implementation-details)
- [Agent Definitions Reference](#agent-definitions-reference)
- [User Experience](#user-experience)
- [Validation Checklist](#validation-checklist)
- [Future Enhancements](#future-enhancements)

---

## Executive Summary

This document outlines the strategy for integrating AgentPod's personality-driven agent team with OpenCode's native agent system.

### Approach Comparison

| Approach | Complexity | Performance | Maintenance |
|----------|-----------|-------------|-------------|
| ~~API Middleware~~ | High | +50ms latency | Complex |
| ~~Docker Baking~~ | Medium | Zero overhead | Rebuild required |
| **Database Seeding** | Low | Zero overhead | Simple |

**Chosen Approach**: Database seeding via existing Settings UI infrastructure.

### Why Database Seeding?

We already have a complete system for managing OpenCode configuration:

1. **Settings UI** (`apps/frontend/src/routes/settings/`) - Custom tab manages agents
2. **Database Storage** (`user_opencode_files` table) - Persists agent definitions
3. **Config Sync** - Automatically syncs to running containers
4. **User Customization** - Users can edit agents via UI

Instead of baking agents into Docker images (requiring rebuilds), we:
1. Generate agent definitions at build time
2. Seed them into the database on user registration
3. Leverage existing config sync to push to containers

### Benefits

- **No container rebuilds** to update agent personalities
- **Immediate customization** via existing Settings UI
- **Per-user agents** with individual modifications
- **Single source of truth** in database
- **Existing infrastructure** - no new code paths

---

## Problem Statement

### Current State

AgentPod has 11 personality-driven agents defined in TypeScript (`packages/agents/src/library/`):

```
Central (Orchestrator)
├── Development Squad: Kai, Dana, Alex, Tess, Sam
├── Product Squad: Pete, Spencer, River
└── Operations Squad: Olivia, Nora
```

These agents need to be accessible to users in their sandboxes.

### Desired State

Users should be able to:
1. **Select** from AgentPod team members when chatting
2. **Cycle** through agents using keyboard shortcuts (Cmd+,/.)
3. **Customize** agent personalities via Settings UI
4. **Experience** distinct personalities in responses

---

## Solution Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BUILD TIME                                       │
│                                                                          │
│  packages/agents/src/library/*.ts                                        │
│         │                                                                │
│         ▼  (pnpm run generate:opencode-agents)                          │
│  packages/agents/src/generated/opencode-agents.ts                        │
│         │                                                                │
│         │  Exports: OPENCODE_AGENTS[], AGENT_NAMES                      │
└─────────┼────────────────────────────────────────────────────────────────┘
          │
┌─────────┼────────────────────────────────────────────────────────────────┐
│         ▼                    RUNTIME                                     │
│                                                                          │
│  User Signs Up                                                           │
│         │                                                                │
│         ▼  (ensureDefaultAgents in drizzle-auth.ts)                     │
│  INSERT INTO user_opencode_files (11 agents per user)                   │
│         │                                                                │
│         ▼  (existing config sync)                                       │
│  ~/.config/opencode/agent/*.md (in container)                           │
│         │                                                                │
│         ▼  (OpenCode /app/agents API)                                   │
│  Agent Selector UI (keyboard shortcuts work)                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### File Locations

```
Source (Packages):
packages/agents/
├── src/
│   ├── library/                     # TypeScript agent definitions
│   │   ├── central/agentpod-central.ts
│   │   ├── development/kai-coder.ts, dana-debugger.ts, ...
│   │   ├── product/pete-product.ts, ...
│   │   └── operations/olivia-operations.ts, ...
│   └── generated/
│       └── opencode-agents.ts       # Generated OpenCode format
└── scripts/
    └── generate-opencode-agents.ts  # Generator script

API (Runtime):
apps/api/src/
├── services/
│   └── default-agents-service.ts    # ensureDefaultAgents(), isSystemAgent()
├── auth/
│   └── drizzle-auth.ts              # Calls ensureDefaultAgents on signup
└── models/
    └── user-opencode-config.ts      # upsertUserOpencodeFile()

Database:
user_opencode_files table
├── type: "agent"
├── name: "kai", "dana", "alex", ...
├── extension: "md"
└── content: Full OpenCode markdown with YAML frontmatter

Container (Runtime):
~/.config/opencode/agent/
├── kai.md                           # Synced from database
├── dana.md
├── alex.md
└── ... (all 11 agents)
```

### Data Flow

```
1. BUILD: Generator converts AgentConfig → OpenCode markdown
2. SIGNUP: ensureDefaultAgents() inserts 11 agents into user_opencode_files
3. SYNC: Existing config sync pushes to container
4. USE: OpenCode loads agents, user switches with Cmd+,/.
5. EDIT: User modifies via Settings UI → database → sync → container
```

---

## OpenCode Agent Format

### YAML Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | Brief description shown in UI |
| `mode` | `"primary"` \| `"subagent"` | No | `primary` for Tab-selectable |
| `model` | string | No | Model override (e.g., `anthropic/claude-sonnet-4`) |
| `temperature` | number | No | 0.0-1.0, controls creativity |
| `color` | string | No | Hex color for UI indicator |
| `tools` | object | No | Tool availability overrides |
| `permission` | object | No | Permission level overrides |

### Example Agent File

```markdown
---
description: "Lead Code Reviewer - Review code"
mode: primary
model: anthropic/claude-sonnet-4
temperature: 0.2
color: "#00FF9F"
tools:
  write: false
  edit: false
  bash: false
  webfetch: true
  read: true
  glob: true
  grep: true
permission:
  write: deny
  edit: deny
  bash: deny
---

# 👨‍💻 Kai - Lead Code Reviewer

> **Squad**: Development | **Tier**: Foundation | **Intelligence**: Level 4/5

You are Kai, the Lead Code Reviewer for AgentPod.

## Your Identity
...
```

---

## Implementation Details

### Phase 1: Agent Generator

**Location**: `packages/agents/scripts/generate-opencode-agents.ts`

**Purpose**: Converts TypeScript `AgentConfig` to OpenCode markdown format

**Run**: `pnpm run generate:opencode-agents`

**Output**: `packages/agents/src/generated/opencode-agents.ts`

```typescript
export interface OpenCodeAgentDefinition {
  name: string
  role: string
  emoji: string
  squad: string
  content: string  // Full markdown with YAML frontmatter
}

export const OPENCODE_AGENTS: OpenCodeAgentDefinition[] = [
  { name: "central", role: "Orchestrator", emoji: "🎯", squad: "orchestration", content: `...` },
  { name: "kai", role: "Lead Code Reviewer", emoji: "👨‍💻", squad: "development", content: `...` },
  // ... 11 total
]

export const AGENT_NAMES = ["central", "kai", "dana", ...] as const
```

### Phase 2: Database Seeding Service

**Location**: `apps/api/src/services/default-agents-service.ts`

```typescript
import { OPENCODE_AGENTS, AGENT_NAMES } from "@agentpod/agents/generated"

export async function ensureDefaultAgents(userId: string): Promise<{ created: number; skipped: number }>

export async function resetAgentToDefault(userId: string, agentName: string): Promise<boolean>

export function isSystemAgent(agentName: string): boolean

export function getSystemAgentNames(): readonly string[]

export function getSystemAgentMetadata(): Array<{ name, role, emoji, squad }>
```

### Phase 3: User Registration Hook

**Location**: `apps/api/src/auth/drizzle-auth.ts`

```typescript
// In the user signup 'after' hook:
try {
  const { created } = await ensureDefaultAgents(createdUser.id);
  if (created > 0) {
    log.info("Created default agents for user", { userId: createdUser.id, count: created });
  }
} catch (error) {
  log.error("Failed to create default agents", { userId: createdUser.id, error });
}
```

---

## Agent Definitions Reference

### Complete Agent Roster

| Agent | Emoji | Role | Squad | Key Capabilities |
|-------|-------|------|-------|------------------|
| **Central** | 🎯 | Orchestrator | Orchestration | Routes requests, coordinates team |
| **Kai** | 👨‍💻 | Lead Code Reviewer | Development | Code quality, PR reviews |
| **Dana** | 🔍 | Bug Investigator | Development | Debugging, root cause analysis |
| **Alex** | 🏗️ | System Architect | Development | System design, scalability |
| **Tess** | ✅ | QA Lead | Development | Test coverage, quality gates |
| **Sam** | 🔒 | Security Specialist | Security | Security audits, vulnerabilities |
| **Pete** | 📋 | Product Owner | Product | Strategy, prioritization |
| **Spencer** | 📝 | Requirements Specialist | Product | Requirements, user stories |
| **River** | 🗺️ | Roadmap Planner | Product | Roadmap, milestone planning |
| **Olivia** | ⚙️ | Infrastructure Lead | Operations | DevOps, CI/CD |
| **Nora** | 📢 | Communication Hub | Operations | Updates, documentation |

### Tool Permissions

| Agent | Write | Edit | Bash | WebFetch |
|-------|-------|------|------|----------|
| Central | ❌ | ❌ | ❌ | ✅ |
| Kai | ❌ | ❌ | ❌ | ❌ |
| Dana | ❌ | ❌ | ✅ | ✅ |
| Alex | ❌ | ❌ | ❌ | ✅ |
| Tess | ❌ | ❌ | ✅ | ❌ |
| Sam | ❌ | ❌ | ✅ | ✅ |
| Pete | ❌ | ❌ | ❌ | ✅ |
| Spencer | ❌ | ❌ | ❌ | ✅ |
| River | ❌ | ❌ | ❌ | ✅ |
| Olivia | ❌ | ❌ | ✅ | ✅ |
| Nora | ❌ | ❌ | ❌ | ✅ |

---

## User Experience

### New User Signup

```
User creates account
    ↓
ensureDefaultAgents(userId) called automatically
    ↓
11 agent files inserted into user_opencode_files
    ↓
User opens sandbox
    ↓
Config sync pushes agents to container
    ↓
Agents appear in selector dropdown
```

### Agent Selection

**Keyboard Shortcuts**:
- `Cmd+.` — Next agent
- `Cmd+,` — Previous agent

**Agent Selector Dropdown**:
```
┌─────────────────────────────────┐
│ Select Agent              ▼    │
├─────────────────────────────────┤
│ 🎯 Central (Orchestrator)       │
│ 👨‍💻 Kai (Code Reviewer)         │
│ 🔍 Dana (Debugger)              │
│ 🏗️ Alex (Architect)             │
│ ✅ Tess (QA Lead)               │
│ 🔒 Sam (Security)               │
│ 📋 Pete (Product)               │
│ 📝 Spencer (Requirements)       │
│ 🗺️ River (Roadmap)              │
│ ⚙️ Olivia (Operations)          │
│ 📢 Nora (Communications)        │
└─────────────────────────────────┘
```

### Customization via Settings

Users can edit agents in Settings → OpenCode Config → Custom tab:
1. Select an agent from the list
2. Edit the markdown content
3. Save changes
4. Changes sync to container automatically

---

## Validation Checklist

### After Implementation

- [x] Generator script created (`packages/agents/scripts/generate-opencode-agents.ts`)
- [x] Generated module exports agents (`packages/agents/src/generated/opencode-agents.ts`)
- [x] Seeding service created (`apps/api/src/services/default-agents-service.ts`)
- [x] User signup hook added (`apps/api/src/auth/drizzle-auth.ts`)
- [x] API compiles without errors

### Runtime Verification

- [ ] New user signup creates 11 agent records in `user_opencode_files`
- [ ] Agents appear in Settings → OpenCode Config → Custom tab
- [ ] Agents sync to container on sandbox start
- [ ] OpenCode `/app/agents` endpoint returns all 11 personalities
- [ ] Agent selector dropdown shows all agents
- [ ] Keyboard shortcuts (Cmd+,/.) cycle through agents
- [ ] Each agent personality reflects in responses
- [ ] User edits to agents persist and sync

---

## Future Enhancements

### Phase 2: UI Improvements

- Visual distinction between system agents and custom agents
- "Reset to Default" button for system agents
- Agent squad grouping in selector

### Phase 3: Advanced Features

- Agent memory/context persistence
- Workflow integration (PR Review, Incident Response)
- Team templates (Startup Mode, Enterprise Mode)
- Custom agent creation wizard

---

## References

- [OpenCode Agent Documentation](https://opencode.ai/docs/agents/)
- [AgentPod Agent Framework](./README.md)
- [Personality Framework](./personality-framework.md)

---

*Built for AgentPod — The Portable Command Center*
