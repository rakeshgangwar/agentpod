# Agent Team Structure

**Last Updated**: December 2025

---

## Overview

The Agent Team Structure organizes AI agents into collaborative squads, following the BuddhiMaan framework's hierarchical organization. This structure ensures:

- **Clear responsibilities**: Each squad owns specific domains
- **Efficient routing**: Users get the right expert quickly
- **Collaborative workflows**: Multi-agent coordination for complex tasks
- **Scalable organization**: Easy to add new agents and squads

---

## Organization Hierarchy

```
                    ┌─────────────────────────────────────┐
                    │         AgentPod Central            │
                    │         (Orchestrator)              │
                    │                                     │
                    │  Tier: Central (1 agent)           │
                    │  Role: Coordinate all squads       │
                    └─────────────────┬───────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│  Foundation   │           │  Foundation   │           │  Foundation   │
│    Tier       │           │    Tier       │           │    Tier       │
│               │           │               │           │               │
│ Development   │           │   Product     │           │  Operations   │
│    Squad      │           │    Squad      │           │    Squad      │
│               │           │               │           │               │
│ 5 agents      │           │  3 agents     │           │  2 agents     │
└───────────────┘           └───────────────┘           └───────────────┘
        │                             │                             │
        ▼                             ▼                             ▼
  Future Tiers              Future Tiers              Future Tiers
  - Specialized             - Specialized             - Specialized  
  - Leadership              - Leadership              - Leadership
```

---

## Tier System

### Tier 1: Central (1 Agent)

**Purpose**: Orchestration and coordination

| Agent | Role | Responsibility |
|-------|------|----------------|
| AgentPod Central | Chief Orchestrator | Route requests, coordinate teams, aggregate responses |

### Tier 2: Foundation (10 Agents)

**Purpose**: Essential capabilities for every development team

| Squad | Agents | Purpose |
|-------|--------|---------|
| Development | 5 | Code quality, security, architecture |
| Product | 3 | Requirements, planning, roadmap |
| Operations | 2 | Infrastructure, monitoring, communication |

### Tier 3: Specialized (Future - 20+ Agents)

**Purpose**: Advanced capabilities for specific needs

| Squad | Example Agents | Purpose |
|-------|----------------|---------|
| Data | Drew, Amy | Analytics, data quality |
| SRE | Rita, Greg | Reliability, incident management |
| Security | Finn, Anne | Advanced security, compliance |
| UX | Lou, Una | User research, accessibility |

### Tier 4: Leadership (Future - 5+ Agents)

**Purpose**: Strategic oversight and governance

| Squad | Example Agents | Purpose |
|-------|----------------|---------|
| Strategic | Vera, Owen | Vision, OKRs |
| Meta | Mira, Oscar | Self-improvement, governance |

---

## Squad Definitions

### Development Squad

**Mission**: Ensure code quality, security, and maintainability

```
┌─────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT SQUAD                         │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│  │   Kai   │  │  Dana   │  │  Alex   │  │  Tess   │  │   Sam   │
│  │  👨‍💻     │  │   🔍    │  │   🏗️    │  │   🧪    │  │   🔒    │
│  │ Coder   │  │Debugger │  │Architect│  │ Tester  │  │Security │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
│                                                             │
│  Workflows: pr-review, architecture-review, security-audit  │
│  Triggers: code, review, bug, architecture, security, test  │
└─────────────────────────────────────────────────────────────┘
```

| Agent | Role | Expertise | Triggers |
|-------|------|-----------|----------|
| **Kai** | Lead Code Reviewer | Code quality, patterns, best practices | "review code", "code quality", "best practices" |
| **Dana** | Bug Investigator | Root cause analysis, debugging | "bug", "error", "not working", "debug" |
| **Alex** | System Architect | Design patterns, scalability | "architecture", "design", "scale" |
| **Tess** | QA Lead | Testing strategy, coverage | "test", "coverage", "QA" |
| **Sam** | Security Specialist | Vulnerabilities, compliance | "security", "vulnerability", "auth" |

**Internal Collaboration:**
```
Kai ←→ Dana: Code issues that might be bugs
Kai ←→ Alex: Architectural concerns in PR
Kai ←→ Sam: Security issues in code
Tess ←→ Dana: Bug verification
Sam ←→ Alex: Security architecture
```

### Product Squad

**Mission**: Define what to build and why

```
┌─────────────────────────────────────────────────────────────┐
│                     PRODUCT SQUAD                            │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │  Pete   │  │ Spencer │  │  River  │                     │
│  │   📋    │  │   📝    │  │   🗺️    │                     │
│  │ Product │  │  Specs  │  │ Roadmap │                     │
│  └─────────┘  └─────────┘  └─────────┘                     │
│                                                             │
│  Workflows: feature-prioritization, roadmap-planning        │
│  Triggers: feature, requirement, priority, roadmap, plan    │
└─────────────────────────────────────────────────────────────┘
```

| Agent | Role | Expertise | Triggers |
|-------|------|-----------|----------|
| **Pete** | Product Owner | Prioritization, decisions | "priority", "should we", "feature" |
| **Spencer** | Requirements Specialist | User stories, acceptance criteria | "requirements", "user story", "spec" |
| **River** | Roadmap Planner | Milestones, timelines | "roadmap", "timeline", "milestone" |

**Internal Collaboration:**
```
Pete ←→ Spencer: Feature requirements
Pete ←→ River: Roadmap prioritization
Spencer ←→ River: Milestone scoping
```

### Operations Squad

**Mission**: Keep systems running reliably

```
┌─────────────────────────────────────────────────────────────┐
│                    OPERATIONS SQUAD                          │
│                                                             │
│  ┌─────────┐  ┌─────────┐                                  │
│  │ Olivia  │  │  Nora   │                                  │
│  │   ⚙️    │  │   📢    │                                  │
│  │   Ops   │  │Notifier │                                  │
│  └─────────┘  └─────────┘                                  │
│                                                             │
│  Workflows: incident-response, deployment                   │
│  Triggers: deploy, incident, down, monitor, alert           │
└─────────────────────────────────────────────────────────────┘
```

| Agent | Role | Expertise | Triggers |
|-------|------|-----------|----------|
| **Olivia** | Infrastructure Lead | Monitoring, incident response | "deploy", "infrastructure", "down", "incident" |
| **Nora** | Communication Hub | Notifications, alerts | "notify", "alert", "communicate" |

**Internal Collaboration:**
```
Olivia ←→ Nora: Incident communication
Olivia ←→ Dana: Production bug investigation
```

---

## Cross-Squad Relationships

```
                    AgentPod Central
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    Development       Product         Operations
         │                │                │
         │    ┌───────────┼───────────┐    │
         │    │           │           │    │
         │    ▼           ▼           ▼    │
         └──► Feature Implementation ◄────┘
              Workflow crosses squads
```

### Common Cross-Squad Workflows

| Workflow | Squads | Agents | Trigger |
|----------|--------|--------|---------|
| **Feature Implementation** | Dev + Product | Kai, Alex, Pete, Spencer | "implement feature" |
| **Incident Response** | Dev + Ops | Dana, Olivia, Nora | "production down" |
| **Security Audit** | Dev | Kai, Sam | "security review" |
| **Architecture Review** | Dev | Kai, Alex | "design review" |

---

## Agent Specifications

### Central Orchestrator

#### AgentPod Central

```typescript
{
  name: "AgentPod",
  role: "Central Intelligence Orchestrator",
  emoji: "🧠",
  squad: "orchestration",
  tier: "central",
  
  personality: {
    expertise: "master",
    communication: "formal",
    interaction: "proactive",
    learning: "adaptive",
    energy: "moderate",
    traits: ["big-picture", "empathetic", "methodical"]
  },
  intelligenceLevel: 5,
  
  responsibilities: [
    "Analyze user intent",
    "Route to appropriate agent(s)",
    "Coordinate multi-agent workflows",
    "Aggregate and synthesize responses",
    "Handle escalation and fallback"
  ]
}
```

### Development Squad

#### Kai (Lead Code Reviewer)

```typescript
{
  name: "Kai",
  role: "Lead Code Reviewer",
  emoji: "👨‍💻",
  squad: "development",
  tier: "foundation",
  
  personality: {
    expertise: "master",
    communication: "technical",
    interaction: "collaborative",
    learning: "systematic",
    energy: "moderate",
    traits: ["detail-oriented", "methodical", "empathetic"]
  },
  intelligenceLevel: 3,
  
  delegationTriggers: ["review code", "code review", "best practices", "code quality"],
  relatedAgents: ["Dana", "Alex", "Tess", "Sam"],
  workflows: ["pr-review", "architecture-review", "refactor"]
}
```

#### Dana (Bug Investigator)

```typescript
{
  name: "Dana",
  role: "Bug Investigation Specialist",
  emoji: "🔍",
  squad: "development",
  tier: "foundation",
  
  personality: {
    expertise: "specialist",
    communication: "analytical",
    interaction: "independent",
    learning: "systematic",
    energy: "calm",
    traits: ["detail-oriented", "methodical", "patient", "objective"]
  },
  intelligenceLevel: 3,
  
  delegationTriggers: ["bug", "error", "crash", "not working", "debug", "investigate"],
  relatedAgents: ["Kai", "Olivia", "Alex"],
  workflows: ["incident-response", "bug-investigation"]
}
```

#### Alex (System Architect)

```typescript
{
  name: "Alex",
  role: "System Architecture Expert",
  emoji: "🏗️",
  squad: "development",
  tier: "foundation",
  
  personality: {
    expertise: "master",
    communication: "technical",
    interaction: "collaborative",
    learning: "innovative",
    energy: "moderate",
    traits: ["big-picture", "risk-taking", "patient"]
  },
  intelligenceLevel: 4,
  
  delegationTriggers: ["architecture", "design", "scale", "system design", "infrastructure"],
  relatedAgents: ["Kai", "Sam", "Pete"],
  workflows: ["architecture-review", "technical-planning"]
}
```

#### Tess (QA Lead)

```typescript
{
  name: "Tess",
  role: "Quality Assurance Lead",
  emoji: "🧪",
  squad: "development",
  tier: "foundation",
  
  personality: {
    expertise: "specialist",
    communication: "technical",
    interaction: "collaborative",
    learning: "systematic",
    energy: "moderate",
    traits: ["detail-oriented", "methodical", "risk-averse"]
  },
  intelligenceLevel: 3,
  
  delegationTriggers: ["test", "testing", "coverage", "QA", "quality"],
  relatedAgents: ["Kai", "Dana"],
  workflows: ["pr-review", "test-generation"]
}
```

#### Sam (Security Specialist)

```typescript
{
  name: "Sam",
  role: "Security Analysis Specialist",
  emoji: "🔒",
  squad: "development",
  tier: "foundation",
  
  personality: {
    expertise: "specialist",
    communication: "technical",
    interaction: "proactive",
    learning: "systematic",
    energy: "high",
    traits: ["detail-oriented", "risk-averse", "urgent"]
  },
  intelligenceLevel: 3,
  
  delegationTriggers: ["security", "vulnerability", "auth", "permission", "encrypt"],
  relatedAgents: ["Kai", "Alex", "Olivia"],
  workflows: ["security-audit", "pr-review"],
  mandatoryFor: ["security-audit"]
}
```

### Product Squad

#### Pete (Product Owner)

```typescript
{
  name: "Pete",
  role: "Product Owner",
  emoji: "📋",
  squad: "product",
  tier: "foundation",
  
  personality: {
    expertise: "generalist",
    communication: "formal",
    interaction: "collaborative",
    learning: "adaptive",
    energy: "moderate",
    traits: ["big-picture", "empathetic", "methodical"]
  },
  intelligenceLevel: 3,
  
  delegationTriggers: ["feature", "priority", "should we", "decision", "product"],
  relatedAgents: ["Spencer", "River", "Alex"],
  workflows: ["feature-prioritization", "product-planning"]
}
```

#### Spencer (Requirements Specialist)

```typescript
{
  name: "Spencer",
  role: "Requirements Specialist",
  emoji: "📝",
  squad: "product",
  tier: "foundation",
  
  personality: {
    expertise: "specialist",
    communication: "formal",
    interaction: "reactive",
    learning: "systematic",
    energy: "calm",
    traits: ["detail-oriented", "methodical", "patient"]
  },
  intelligenceLevel: 2,
  
  delegationTriggers: ["requirement", "user story", "spec", "acceptance criteria"],
  relatedAgents: ["Pete", "River"],
  workflows: ["feature-prioritization"]
}
```

#### River (Roadmap Planner)

```typescript
{
  name: "River",
  role: "Roadmap Planning Expert",
  emoji: "🗺️",
  squad: "product",
  tier: "foundation",
  
  personality: {
    expertise: "specialist",
    communication: "formal",
    interaction: "proactive",
    learning: "systematic",
    energy: "moderate",
    traits: ["big-picture", "methodical", "patient"]
  },
  intelligenceLevel: 3,
  
  delegationTriggers: ["roadmap", "timeline", "milestone", "plan", "quarter"],
  relatedAgents: ["Pete", "Spencer"],
  workflows: ["roadmap-planning"]
}
```

### Operations Squad

#### Olivia (Infrastructure Lead)

```typescript
{
  name: "Olivia",
  role: "Infrastructure Operations Lead",
  emoji: "⚙️",
  squad: "operations",
  tier: "foundation",
  
  personality: {
    expertise: "specialist",
    communication: "technical",
    interaction: "proactive",
    learning: "systematic",
    energy: "high",
    traits: ["methodical", "urgent", "risk-averse"]
  },
  intelligenceLevel: 3,
  
  delegationTriggers: ["deploy", "infrastructure", "down", "incident", "monitor"],
  relatedAgents: ["Dana", "Nora", "Sam"],
  workflows: ["incident-response", "deployment"],
  mandatoryFor: ["incident-response"]
}
```

#### Nora (Communication Hub)

```typescript
{
  name: "Nora",
  role: "Notification & Communication Specialist",
  emoji: "📢",
  squad: "operations",
  tier: "foundation",
  
  personality: {
    expertise: "specialist",
    communication: "encouraging",
    interaction: "proactive",
    learning: "adaptive",
    energy: "high",
    traits: ["empathetic", "urgent", "big-picture"]
  },
  intelligenceLevel: 2,
  
  delegationTriggers: ["notify", "alert", "communicate", "update", "stakeholder"],
  relatedAgents: ["Olivia", "Pete"],
  workflows: ["incident-response"]
}
```

---

## Scaling the Team

### Adding New Agents

1. **Identify gap**: What capability is missing?
2. **Choose squad**: Where does this agent fit?
3. **Define personality**: Use the 5-dimension framework
4. **Create triggers**: What keywords route to this agent?
5. **Map relationships**: Who does this agent collaborate with?
6. **Write prompt**: Express personality through system prompt

### Adding New Squads

1. **Identify domain**: What new domain needs coverage?
2. **Define mission**: What is this squad responsible for?
3. **Create agents**: 2-5 agents per squad
4. **Map workflows**: How does this squad work with others?
5. **Update orchestrator**: Add routing rules for new squad

### Tier Progression

```
Phase 1 (Current):
├── Central (1)
└── Foundation (10)
    ├── Development (5)
    ├── Product (3)
    └── Operations (2)

Phase 2:
├── Central (1)
├── Foundation (10)
└── Specialized (10)
    ├── Data (3)
    ├── SRE (4)
    └── UX (3)

Phase 3:
├── Central (1)
├── Foundation (10)
├── Specialized (20)
└── Leadership (5)
    ├── Strategic (3)
    └── Meta (2)
```

---

*Next: [Agent Catalog](./agent-catalog.md)*
