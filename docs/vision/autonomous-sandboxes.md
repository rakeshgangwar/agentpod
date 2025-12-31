# Autonomous Sandboxes

> **Status:** Idea / Research  
> **Created:** December 2024  
> **Author:** Research Session  

## Overview

This document explores how to make AgentPod sandboxes truly autonomous - capable of making decisions, coordinating with other agents, and completing tasks without human intervention.

## Current State

AgentPod sandboxes are **semi-autonomous**:

| Capability | Current State |
|------------|---------------|
| Container-native execution | ✅ Each sandbox has its own OpenCode instance |
| Self-contained environment | ✅ Git repo + environment variables |
| Human-in-the-loop | ⚠️ Mobile app controls actions |
| Self-governance | ❌ No independent lifecycle/resource decisions |
| Inter-agent coordination | ❌ No direct sandbox-to-sandbox communication |

## What "Truly Autonomous" Means

For sandboxes to be fully autonomous, they need:

1. **Self-Awareness** - Monitor their own health and resources
2. **Decision-Making** - Know when to act vs. when to ask
3. **Coordination** - Communicate with sibling sandboxes directly
4. **Resource Management** - Scale themselves when needed
5. **Audit Trail** - Log all autonomous decisions for transparency

---

## Implementation Strategy

### Leverage Existing Infrastructure

The key insight is that **OpenCode already provides most of what we need**:

| OpenCode Feature | Autonomy Capability |
|------------------|---------------------|
| Plugin system | Custom tools for autonomous actions |
| Event hooks | Audit logging of decisions |
| Permission system | "allow"/"ask"/"deny" per tool |
| Agent configuration | Per-agent autonomy levels (maxSteps, tools) |
| Fine-grained bash permissions | Whitelist safe commands |
| MCP servers | Connect to external services |
| Subagents | Background coordination agents |

**No new infrastructure needed - just configuration and plugins.**

---

## Component Architecture

### Component 1: Permission Configuration (`opencode.json`)

Define what agents can do autonomously:

```json
{
  "$schema": "https://opencode.ai/config.json",
  
  "permission": {
    "edit": "allow",
    "bash": {
      "npm *": "allow",
      "pnpm *": "allow",
      "git status": "allow",
      "git diff": "allow",
      "git add *": "allow",
      "git commit *": "allow",
      "rm -rf *": "deny",
      "sudo *": "deny",
      "*": "ask"
    },
    "write": "allow",
    "external_directory": "deny"
  },
  
  "agent": {
    "worker": {
      "description": "Autonomous code writer",
      "mode": "primary",
      "maxSteps": 5,
      "tools": {
        "write": true,
        "edit": true,
        "bash": true
      }
    },
    
    "reviewer": {
      "description": "Code review agent (read-only)",
      "mode": "subagent",
      "tools": {
        "read": true,
        "grep": true,
        "write": false,
        "edit": false,
        "bash": false
      }
    },
    
    "coordinator": {
      "description": "Orchestrates multi-sandbox workflows",
      "mode": "subagent",
      "tools": {
        "coordinate_sibling": true,
        "request_resources": true
      }
    }
  },
  
  "tools": {
    "coordinate_sibling": true,
    "request_resources": true,
    "create_task": true
  }
}
```

### Component 2: Decision Framework (`AGENTS.md`)

Guide agents on when to act autonomously:

```markdown
## Self-Decision Framework

Before taking action, ask:
1. Is this within my authorized tools? → YES: Act autonomously
2. Is this modifying src/ code? → YES: Autonomous
3. Is this a destructive operation? → YES: Ask for approval
4. Does this affect project configuration? → YES: Ask for approval

## Autonomous Actions (pre-approved)
- Write code in src/ directory
- Run tests with npm test
- Create tasks via create_task tool
- Format code

## Actions Requiring Approval
- Modify package.json
- Delete files
- Push to git
- External API calls
```

### Component 3: Autonomy Plugin

Provide custom tools for autonomous coordination:

```typescript
// .opencode/plugin/autonomy-engine.ts
import type { Plugin } from "@opencode-ai/plugin";

export default async function({ client, project, directory, $ }): Promise<Plugin> {
  return {
    tool: {
      coordinate_sibling: {
        description: "Send request to sibling sandbox/agent",
        args: {
          targetSandboxId: { type: "string" },
          action: { type: "string" },
          context: { type: "string" }
        },
        execute: async (args, ctx) => {
          const response = await fetch(
            `http://localhost:4097/sandbox/${args.targetSandboxId}/coordinate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: args.action,
                context: args.context,
                fromSandboxId: process.env.SANDBOX_ID
              })
            }
          );
          return JSON.stringify(await response.json());
        }
      },
      
      request_resources: {
        description: "Request additional CPU or memory",
        args: {
          cpu: { type: "string" },
          memory: { type: "string" }
        },
        execute: async (args, ctx) => {
          const response = await fetch(
            `http://localhost:4097/sandbox/${process.env.SANDBOX_ID}/resources`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cpu: args.cpu, memory: args.memory })
            }
          );
          return JSON.stringify(await response.json());
        }
      },
      
      create_task: {
        description: "Create a task in the project backlog",
        args: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", default: "medium" }
        },
        execute: async (args, ctx) => {
          const taskId = `task-${Date.now()}`;
          await $`mkdir -p .tasks && echo "# ${args.title}\n\n${args.description}" > .tasks/${taskId}.md`;
          return JSON.stringify({ created: true, taskId });
        }
      }
    },
    
    // Audit logging
    "tool.execute.before": async (input, output) => {
      const autonomousTools = ["coordinate_sibling", "request_resources", "create_task", "write", "edit"];
      if (autonomousTools.includes(input.tool)) {
        await fetch(`http://localhost:4097/sandbox/${process.env.SANDBOX_ID}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: input.tool,
            args: input.input,
            timestamp: new Date().toISOString()
          })
        }).catch(() => {});
      }
    }
  };
}
```

### Component 4: ACP Gateway Extensions

Extend ACP Gateway for autonomous coordination:

```typescript
// docker/base/acp-gateway/src/autonomy-routes.ts

// POST /sandbox/:id/decisions - Log autonomous decision
// GET /sandbox/:id/decisions - Get audit trail
// POST /sandbox/:from/coordinate/:to - Inter-sandbox communication
// POST /sandbox/:id/resources - Handle resource scaling
```

---

## Autonomy Levels

### Level 1: Guided Autonomy (Easiest)

Agents work within pre-approved boundaries:
- Safe bash commands whitelisted
- Destructive operations denied
- File writes allowed in specific directories

**Implementation:** 2-3 days

### Level 2: Intelligent Autonomy (Medium)

Agents decide what's safe based on AGENTS.md guidelines:
- Decision framework in instructions
- Agent consults framework before acting
- Logs decisions for audit

**Implementation:** 5-7 days

### Level 3: Full Autonomy (Advanced)

Sandboxes operate completely independently:
- No human approval for pre-authorized actions
- Self-scaling resources
- Inter-sandbox coordination
- Watchdog timers for safety

**Implementation:** 10-14 days

---

## Example Autonomous Workflow

```
User: "Implement user authentication. Be autonomous."

1. Worker agent starts (autonomous)
2. Reads AGENTS.md → understands autonomy rules
3. Writes auth/login.ts (autonomous, logged)
4. Runs tests: npm test (autonomous, whitelisted)
5. Tests pass ✅
6. Calls coordinate_sibling → sends to reviewer
7. Reviewer reads code, approves (autonomous)
8. Worker creates commit (autonomous)
9. Task complete ✅

AUDIT TRAIL:
  - write: auth/login.ts [AUTONOMOUS]
  - bash: npm test [AUTONOMOUS - whitelisted]
  - coordinate_sibling: reviewer [AUTONOMOUS]
  - bash: git commit [AUTONOMOUS]

HUMAN EFFORT: 1 line of input
```

---

## Key Benefits

| Benefit | Description |
|---------|-------------|
| **Uses existing features** | OpenCode's permission system, plugins, agents |
| **Transparent** | Full audit trail of autonomous decisions |
| **Safe by default** | Whitelist approach for dangerous operations |
| **Flexible** | Different autonomy levels per agent |
| **Scalable** | Works for 1 or 100 sandboxes |
| **Reversible** | Permissions can be tightened anytime |

---

## Files to Create/Modify

| File | Status | Purpose |
|------|--------|---------|
| `.opencode/opencode.json` | 🆕 Create | Permission configuration |
| `.opencode/AGENTS.md` | 🆕 Create | Decision framework |
| `.opencode/plugin/autonomy-engine.ts` | 🆕 Create | Custom autonomy tools |
| `docker/base/acp-gateway/src/autonomy-routes.ts` | 🆕 Create | Coordination endpoints |
| `docker/base/acp-gateway/src/index.ts` | ⚠️ Modify | Mount autonomy routes |
| `docker/base/entrypoint.sh` | ⚠️ Modify | Inject autonomy plugin |

---

## Implementation Timeline

| Day | Deliverable |
|-----|-------------|
| 1-2 | Permission configuration + AGENTS.md framework |
| 3 | Autonomy plugin with custom tools |
| 4 | ACP Gateway coordination endpoints |
| 5 | Management API integration |
| 6 | Mobile UI for viewing decisions (optional) |
| 7 | Testing and documentation |

**Total: ~7 days for full implementation**

---

## Open Questions

1. **Approval workflow:** When agents need approval, how should it flow to the mobile app?
2. **Resource limits:** What are the max CPU/memory agents can request autonomously?
3. **Cost tracking:** Should we track LLM API costs per autonomous session?
4. **Deadlock detection:** How to detect and break infinite agent loops?
5. **Multi-sandbox limits:** How many sandboxes can coordinate simultaneously?

---

## Related Documents

- [OpenCode SDK Analysis](../implementation/opencode-sdk-analysis.md)
- [OpenCode Configuration Architecture](../implementation/opencode-config-architecture.md)
- [Sandbox Environment Patterns](../research/sandbox-environment-patterns.md)
- [ACP Gateway README](../../docker/base/acp-gateway/README.md)

---

## Next Steps

When ready to implement:

1. Start with Level 1 (Guided Autonomy) for one project
2. Create opencode.json + AGENTS.md
3. Test with safe operations
4. Add plugin for audit logging
5. Extend to Level 2/3 based on learnings
