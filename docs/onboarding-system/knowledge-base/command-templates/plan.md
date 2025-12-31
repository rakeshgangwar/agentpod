---
id: cmd_plan
title: Planning Command
description: Creates structured implementation plans for features, bug fixes, and refactoring tasks
tags:
  - planning
  - architecture
  - design
  - strategy
  - documentation
applicable_to: null
metadata:
  agent: plan
  subtask: true
  supports_arguments: true
---

# Plan Command

A command that creates structured, actionable implementation plans for any type of task.

## Command Definition

Place this file at `.opencode/command/plan.md`:

```markdown
---
description: Create an implementation plan for a feature or task
agent: plan
subtask: true
---

# Planning Request

Create a detailed implementation plan for:

$ARGUMENTS

## Planning Process

1. **Understand the Request**
   - What is the goal?
   - What are the constraints?
   - Who are the stakeholders?

2. **Research the Codebase**
   - What existing code is relevant?
   - What patterns are already in use?
   - What dependencies exist?

3. **Design the Solution**
   - Break down into subtasks
   - Identify dependencies between tasks
   - Estimate complexity
   - Consider alternatives

4. **Create the Plan**
   - Ordered list of implementation steps
   - Files to create/modify
   - Tests to write
   - Documentation to update

## Output Format

### Summary
[2-3 sentence overview of the plan]

### Prerequisites
- [ ] [Any setup or preparation needed]

### Implementation Steps

#### Phase 1: [Foundation]
- [ ] Step 1.1: [Description]
  - Files: `path/to/file.ts`
  - Details: [Specific changes]
- [ ] Step 1.2: [Description]
  - Files: `path/to/file.ts`
  - Details: [Specific changes]

#### Phase 2: [Core Implementation]
- [ ] Step 2.1: [Description]
  ...

#### Phase 3: [Integration & Testing]
- [ ] Step 3.1: [Description]
  ...

### Testing Strategy
- Unit tests: [What to test]
- Integration tests: [What to test]
- Manual testing: [How to verify]

### Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk] | Low/Med/High | Low/Med/High | [Mitigation] |

### Estimated Effort
- Total: [X hours/days]
- By phase: Phase 1 (X), Phase 2 (X), Phase 3 (X)

### Open Questions
- [ ] [Question that needs answering]
```

## Usage Examples

### Plan a New Feature
```
/plan Add user authentication with email/password and OAuth
```

### Plan a Bug Fix
```
/plan Fix the race condition in the file upload handler
```

### Plan a Refactoring
```
/plan Refactor the payment module to use the new API client
```

### Plan with Constraints
```
/plan Add dark mode support - must be backwards compatible and use CSS variables
```

### Plan for Non-Code Projects
```
/plan Write a comprehensive API documentation guide
```

## Variants

### Architecture Plan

Create `.opencode/command/plan-architecture.md`:

```markdown
---
description: Create an architecture plan for a major feature
agent: plan
subtask: true
---

Create an architecture plan for:

$ARGUMENTS

## Architecture Planning

Focus on:

1. **System Design**
   - Component diagram
   - Data flow
   - API contracts

2. **Technology Choices**
   - Frameworks/libraries needed
   - Trade-offs considered
   - Alternatives evaluated

3. **Scalability**
   - Performance considerations
   - Scaling strategy
   - Resource requirements

4. **Security**
   - Threat model
   - Authentication/authorization
   - Data protection

## Output Format

### Architecture Overview
[Diagram or description of the architecture]

### Components
| Component | Responsibility | Technology |
|-----------|----------------|------------|
| [Name] | [What it does] | [Tech stack] |

### Data Flow
[Step-by-step data flow description]

### API Contracts
[Key API endpoints/interfaces]

### Decision Record
| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| [Decision] | [Options] | [Choice] | [Why] |
```

### Migration Plan

Create `.opencode/command/plan-migration.md`:

```markdown
---
description: Create a migration plan for moving between systems/versions
agent: plan
subtask: true
---

Create a migration plan for:

$ARGUMENTS

## Migration Planning

Focus on:

1. **Current State Analysis**
   - What exists today
   - Dependencies
   - Data formats

2. **Target State**
   - What we're moving to
   - New requirements
   - Breaking changes

3. **Migration Strategy**
   - Big bang vs gradual
   - Rollback plan
   - Data migration

4. **Risk Assessment**
   - Downtime requirements
   - Data loss risks
   - Compatibility issues

## Output Format

### Migration Overview
| Aspect | Current | Target |
|--------|---------|--------|
| [Aspect] | [Current state] | [Target state] |

### Migration Phases

#### Phase 1: Preparation
- [ ] Backup everything
- [ ] Set up target environment
- [ ] Create rollback scripts

#### Phase 2: Migration
- [ ] Migrate data
- [ ] Update configurations
- [ ] Deploy new code

#### Phase 3: Verification
- [ ] Test functionality
- [ ] Verify data integrity
- [ ] Monitor for issues

### Rollback Plan
[Step-by-step rollback procedure]

### Communication Plan
| Audience | Message | Timing |
|----------|---------|--------|
| [Who] | [What to tell them] | [When] |
```

### Sprint Planning

Create `.opencode/command/plan-sprint.md`:

```markdown
---
description: Break down a feature into sprint-sized tasks
agent: plan
subtask: true
---

Break down into sprint tasks:

$ARGUMENTS

## Sprint Planning

Consider:
- Sprint duration: [X weeks]
- Team capacity: [X story points]
- Dependencies on other teams

## Output Format

### Epic Overview
[Feature description and goals]

### User Stories

#### Story 1: [Title]
**As a** [user type]
**I want** [capability]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]

**Story Points:** X
**Dependencies:** [Any dependencies]

#### Story 2: [Title]
...

### Sprint Allocation

#### Sprint 1
| Story | Points | Assignee |
|-------|--------|----------|
| [Story] | X | [TBD] |
**Total:** X points

#### Sprint 2
...

### Definition of Done
- [ ] Code complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Deployed to staging
```

### Technical Debt Plan

Create `.opencode/command/plan-debt.md`:

```markdown
---
description: Create a plan to address technical debt
agent: plan
subtask: true
---

Plan to address technical debt in:

$ARGUMENTS

## Debt Analysis

1. **Identify Debt**
   - Code smells
   - Outdated dependencies
   - Missing tests
   - Documentation gaps

2. **Prioritize**
   - Impact on development velocity
   - Risk of bugs
   - Cost to fix vs cost to keep

3. **Plan Remediation**
   - Quick wins
   - Long-term improvements
   - Ongoing maintenance

## Output Format

### Debt Inventory

| Item | Type | Impact | Effort | Priority |
|------|------|--------|--------|----------|
| [Item] | Code/Deps/Docs/Tests | High/Med/Low | High/Med/Low | 1-5 |

### Remediation Plan

#### Quick Wins (< 1 day each)
- [ ] [Task]

#### Medium Effort (1-3 days)
- [ ] [Task]

#### Major Refactoring (> 3 days)
- [ ] [Task]

### Prevention Strategy
[How to prevent this debt from recurring]
```

## Customization Tips

### Project-Specific Templates

Add your project's specific considerations:

```markdown
## Project-Specific Considerations

When planning for this project, always consider:

- [ ] Does this affect our API versioning?
- [ ] Do we need to update the mobile app?
- [ ] Is feature flagging needed?
- [ ] What metrics should we track?
```

### Team Conventions

Include team-specific practices:

```markdown
## Team Practices

- All plans must be reviewed by a senior engineer
- Create a GitHub issue for tracking
- Update the roadmap document
- Schedule a kickoff meeting if > 3 days effort
```

### Integration with Project Management

Connect to your tools:

```markdown
## Project Management Integration

After creating this plan:
1. Create Jira tickets for each phase
2. Update the sprint board
3. Add to the team calendar
4. Notify stakeholders in #project-channel
```

## Dependencies

This command works best with the `plan` agent (using the primary "plan" model configuration) that has:
- Read access to the entire codebase
- No write permissions (planning only)
- Access to external documentation tools (Context7, web search)
