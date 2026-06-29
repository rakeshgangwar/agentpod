# Automation Strategy: Documentation Sync & Knowledge Base Generation

This document outlines strategies for keeping the onboarding system architecture synchronized with OpenCode documentation and auto-generating project templates from the project types reference.

## Table of Contents

1. [Overview](#overview)
2. [Documentation Sync Pipeline](#documentation-sync-pipeline)
3. [Knowledge Base Auto-Generation](#knowledge-base-auto-generation)
4. [Validation Pipeline](#validation-pipeline)
5. [Implementation Plan](#implementation-plan)
6. [OpenCode Commands Reference](#opencode-commands-reference)

---

## Overview

### Problems to Solve

1. **Documentation Drift**: The official OpenCode docs at https://opencode.ai/docs may change, causing our `architecture.md` to become stale.

2. **Template Scale**: We have 254 project types defined in `project-types-reference.md` but only 3 full templates. Creating them manually is tedious and error-prone.

### Solutions

1. **Automated Documentation Validation**: Weekly CI job that fetches OpenCode docs, compares against our architecture, and creates issues/PRs for changes.

2. **Template Generation Pipeline**: Use OpenCode agents to auto-generate project templates from the project types reference.

---

## Documentation Sync Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Documentation Sync Pipeline                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐ │
│  │  Scheduled   │────►│  Fetch Docs  │────►│  Compare with            │ │
│  │  CI Job      │     │  (WebFetch)  │     │  architecture.md         │ │
│  │  (Weekly)    │     │              │     │                          │ │
│  └──────────────┘     └──────────────┘     └────────────┬─────────────┘ │
│                                                          │               │
│                         ┌────────────────────────────────┘               │
│                         ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     Diff Detection                                │   │
│  │                                                                   │   │
│  │  - Plugin API changes?                                           │   │
│  │  - Tool API changes?                                             │   │
│  │  - MCP configuration changes?                                    │   │
│  │  - New features/options?                                         │   │
│  │  - Deprecations?                                                 │   │
│  └──────────────────────────────────────────────┬───────────────────┘   │
│                                                  │                       │
│                         ┌────────────────────────┘                       │
│                         ▼                                                │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐ │
│  │  Create PR   │◄────│  AI Updates  │◄────│  If Changes Detected     │ │
│  │  for Review  │     │  Docs        │     │                          │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Documentation Pages to Monitor

| Page | URL | What to Check |
|------|-----|---------------|
| Configuration | https://opencode.ai/docs/configuration | Model, MCP, permissions, formatters |
| Plugins | https://opencode.ai/docs/plugins | Plugin API, event hooks |
| Custom Tools | https://opencode.ai/docs/custom-tools | Tool API, args schema |
| MCP Servers | https://opencode.ai/docs/mcp-servers | Remote/local config options |
| Agents | https://opencode.ai/docs/agents | Agent options, modes |
| Commands | https://opencode.ai/docs/commands | Command options, variables |

### GitHub Actions Workflow

**File:** `.github/workflows/docs-sync.yml`

```yaml
name: Sync OpenCode Documentation

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday at midnight
  workflow_dispatch:      # Manual trigger

jobs:
  sync-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install OpenCode CLI
        run: npm install -g @opencode-ai/cli
      
      - name: Fetch OpenCode Docs
        run: |
          mkdir -p /tmp/opencode-docs
          curl -s https://opencode.ai/docs/configuration -o /tmp/opencode-docs/config.html
          curl -s https://opencode.ai/docs/plugins -o /tmp/opencode-docs/plugins.html
          curl -s https://opencode.ai/docs/custom-tools -o /tmp/opencode-docs/tools.html
          curl -s https://opencode.ai/docs/mcp-servers -o /tmp/opencode-docs/mcp.html
          curl -s https://opencode.ai/docs/agents -o /tmp/opencode-docs/agents.html
          curl -s https://opencode.ai/docs/commands -o /tmp/opencode-docs/commands.html
      
      - name: Run Validation
        id: validate
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          opencode --non-interactive --output /tmp/diff-report.json \
            "Compare the fetched OpenCode docs in /tmp/opencode-docs/ with 
             docs/onboarding-system/architecture.md. 
             
             Check for:
             1. Plugin API signature changes
             2. Tool API changes (args vs parameters)
             3. MCP configuration option changes
             4. New agent/command options
             5. Deprecated features
             
             Output a JSON report with:
             - has_changes: boolean
             - changes: array of {section, type, description}
             - suggested_updates: array of markdown patches"
      
      - name: Check for Changes
        id: check
        run: |
          if [ -f /tmp/diff-report.json ]; then
            HAS_CHANGES=$(jq -r '.has_changes' /tmp/diff-report.json)
            echo "has_changes=$HAS_CHANGES" >> $GITHUB_OUTPUT
          else
            echo "has_changes=false" >> $GITHUB_OUTPUT
          fi
      
      - name: Create Issue if Changes Detected
        if: steps.check.outputs.has_changes == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('/tmp/diff-report.json', 'utf8'));
            
            const body = `## OpenCode Documentation Changes Detected
            
            The weekly documentation sync has detected changes in the official OpenCode documentation that may require updates to our architecture.md.
            
            ### Changes Found
            
            ${report.changes.map(c => `- **${c.section}** (${c.type}): ${c.description}`).join('\n')}
            
            ### Suggested Updates
            
            ${report.suggested_updates.map(u => '```markdown\n' + u + '\n```').join('\n\n')}
            
            ---
            *This issue was automatically created by the docs-sync workflow.*
            `;
            
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '📚 OpenCode Documentation Changes Detected',
              body: body,
              labels: ['documentation', 'automated', 'needs-review']
            });
```

---

## Knowledge Base Auto-Generation

```
┌─────────────────────────────────────────────────────────────────────────┐
│              Knowledge Base Auto-Generation Pipeline                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  project-types-reference.md (254 project definitions)              │ │
│  │                                                                    │ │
│  │  - ID, Title, Description                                         │ │
│  │  - Tags, Recommended Agents                                       │ │
│  │  - Priority (high/medium/low)                                     │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Template Generator (OpenCode Agent)                               │ │
│  │                                                                    │ │
│  │  For each project type:                                           │ │
│  │                                                                    │ │
│  │  1. Parse project definition from reference                       │ │
│  │  2. Determine template category (code vs content vs hybrid)       │ │
│  │  3. Select base template (web-app, api-service, book-publishing)  │ │
│  │  4. Customize based on:                                           │ │
│  │     - Tags → MCP servers, tools                                   │ │
│  │     - Recommended agents → Agent definitions                      │ │
│  │     - Description → AGENTS.md content                             │ │
│  │  5. Generate folder structure for project type                    │ │
│  │  6. Output to project-templates/{category}/{id}.md               │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Generated Templates                                               │ │
│  │                                                                    │ │
│  │  project-templates/                                               │ │
│  │  ├── web/           # Web project templates                       │ │
│  │  ├── backend/       # API/Backend templates                       │ │
│  │  ├── mobile/        # Mobile templates                            │ │
│  │  ├── ai/            # AI/ML templates                             │ │
│  │  ├── content/       # Content/Writing templates                   │ │
│  │  ├── devops/        # DevOps templates                            │ │
│  │  └── specialized/   # Niche templates                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Generation Rules

#### Base Template Selection

| Project Tags | Base Template | Category |
|-------------|---------------|----------|
| `writing`, `book`, `blog`, `content`, `creative` | book-publishing.md | content |
| `backend`, `api`, `server`, `microservice` | api-service.md | backend |
| `web`, `frontend`, `spa`, `fullstack` | web-app.md | web |
| Default | web-app.md | code |

#### Tag to MCP Server Mapping

| Tag | MCP Server | Purpose |
|-----|------------|---------|
| `github` | github | Repository operations |
| `database` | database | SQL queries |
| `web`, `api` | context7 | Documentation lookup |
| `filesystem` | filesystem | File operations |

#### Tag to Recommended Tools

| Tag | Tools |
|-----|-------|
| `testing` | test, coverage |
| `security` | security-scan, audit |
| `documentation` | docs-generator |
| `ci-cd` | deploy, build |

### Template Structure

Each generated template follows this structure:

```markdown
---
id: {project_type_id}
title: {project_title}
description: {project_description}
category: {web|backend|mobile|ai|content|devops|specialized}
tags: [{tags}]
recommended_agents: [{agents}]
priority: {high|medium|low}
base_template: {web-app|api-service|book-publishing}
---

# {Project Title} Template

## Overview
{Description and use cases}

## opencode.json Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": { ... },
  "agent": { ... },
  "command": { ... },
  "permission": { ... }
}
```

## AGENTS.md

```markdown
# {Project Title}

## Project Overview
{Auto-generated based on description}

## Code Style
{Based on tags/framework}

## Commands
{Based on project type}
```

## Recommended Agents

{For each recommended agent, include definition}

## Recommended Commands

{Project-specific commands}

## Folder Structure

```
project/
├── {typical folders for this project type}
└── ...
```
```

---

## Validation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Template Validation Pipeline                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐                                                   │
│  │ Generated/Updated │                                                   │
│  │    Template       │                                                   │
│  └────────┬─────────┘                                                   │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Validation Checks                              │   │
│  │                                                                   │   │
│  │  1. Schema Validation                                            │   │
│  │     - Valid YAML frontmatter                                     │   │
│  │     - Required fields present                                    │   │
│  │     - Valid ID format                                            │   │
│  │                                                                   │   │
│  │  2. API Compliance (vs architecture.md)                          │   │
│  │     - Plugin API matches current spec                            │   │
│  │     - Tool API uses args with tool.schema                        │   │
│  │     - MCP config has correct structure                           │   │
│  │     - Agent config uses correct options                          │   │
│  │                                                                   │   │
│  │  3. Cross-Reference Validation                                   │   │
│  │     - Referenced agents exist in agent-patterns/                 │   │
│  │     - Referenced commands exist in command-templates/            │   │
│  │     - Referenced MCP servers exist in mcp-templates/             │   │
│  │                                                                   │   │
│  │  4. Completeness Check                                           │   │
│  │     - opencode.json example included                             │   │
│  │     - AGENTS.md example included                                 │   │
│  │     - At least one agent definition                              │   │
│  │     - At least one command definition                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Validation Script

**File:** `scripts/validate-templates.ts`

```typescript
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_FRONTMATTER = ["id", "title", "description", "category", "tags"];
const VALID_CATEGORIES = ["web", "backend", "mobile", "ai", "content", "devops", "specialized"];

function validateTemplate(filePath: string): ValidationResult {
  const result: ValidationResult = {
    file: filePath,
    valid: true,
    errors: [],
    warnings: [],
  };

  try {
    const content = readFileSync(filePath, "utf-8");
    const { data: frontmatter, content: body } = matter(content);

    // 1. Schema Validation
    for (const field of REQUIRED_FRONTMATTER) {
      if (!frontmatter[field]) {
        result.errors.push(`Missing required field: ${field}`);
        result.valid = false;
      }
    }

    if (frontmatter.category && !VALID_CATEGORIES.includes(frontmatter.category)) {
      result.errors.push(`Invalid category: ${frontmatter.category}`);
      result.valid = false;
    }

    // 2. Content Validation
    if (!body.includes("opencode.json")) {
      result.warnings.push("Missing opencode.json configuration example");
    }

    if (!body.includes("AGENTS.md")) {
      result.warnings.push("Missing AGENTS.md example");
    }

    // 3. JSON Validation (check embedded JSON is valid)
    const jsonBlocks = body.match(/```json\n([\s\S]*?)```/g) || [];
    for (const block of jsonBlocks) {
      const json = block.replace(/```json\n/, "").replace(/```$/, "");
      try {
        JSON.parse(json);
      } catch {
        result.errors.push("Invalid JSON in code block");
        result.valid = false;
      }
    }

  } catch (error) {
    result.errors.push(`Failed to read file: ${error}`);
    result.valid = false;
  }

  return result;
}

// Run validation
const templatesDir = "docs/onboarding-system/knowledge-base/project-templates";
const results = readdirSync(templatesDir, { recursive: true })
  .filter((f): f is string => typeof f === "string" && f.endsWith(".md"))
  .map((f) => validateTemplate(join(templatesDir, f)));

// Output results
console.log(JSON.stringify(results, null, 2));
```

---

## Implementation Plan

| Phase | Task | Effort | Priority |
|-------|------|--------|----------|
| **1** | Create `/validate-docs` command | 2 hours | High |
| **2** | Set up GitHub Action for weekly docs sync | 2 hours | High |
| **3** | Define template generation rules | 2 hours | High |
| **4** | Create `/generate-template` command | 3 hours | High |
| **5** | Generate Phase 1 templates (30 high-priority) | 4 hours | High |
| **6** | Create validation script | 2 hours | Medium |
| **7** | Create `/generate-all-templates` command | 2 hours | Medium |
| **8** | Generate Phase 2 templates (60 medium-priority) | 4 hours | Medium |
| **9** | Add pre-commit hook for validation | 1 hour | Low |
| **10** | Generate remaining templates on demand | Ongoing | Low |

**Total Initial Effort:** ~24 hours (3-4 days)

---

## OpenCode Commands Reference

### /validate-docs

Validates `architecture.md` against official OpenCode documentation.

```markdown
<!-- .opencode/command/validate-docs.md -->
---
description: Validate architecture.md against official OpenCode docs
agent: researcher
subtask: true
---

# Documentation Validation

Fetch and compare the official OpenCode documentation with our local architecture.md.

## Steps

1. Fetch the following documentation pages:
   - https://opencode.ai/docs/configuration
   - https://opencode.ai/docs/plugins
   - https://opencode.ai/docs/custom-tools
   - https://opencode.ai/docs/mcp-servers
   - https://opencode.ai/docs/agents
   - https://opencode.ai/docs/commands

2. Compare with `docs/onboarding-system/architecture.md`

3. Check for:
   - API signature changes (Plugin, Tool APIs)
   - New configuration options
   - Deprecated features
   - Changed default values
   - New tools or hooks

4. Output a report with:
   - Changes found (with severity: breaking/minor/info)
   - Sections needing updates
   - Suggested fixes (markdown patches)

$ARGUMENTS
```

**Usage:**
```bash
/validate-docs
/validate-docs --section plugins
```

### /generate-template

Generates a single project template from project-types-reference.md.

```markdown
<!-- .opencode/command/generate-template.md -->
---
description: Generate a project template from project-types-reference.md
agent: build
subtask: false
---

# Generate Project Template

Generate a complete project template for the specified project type ID.

## Arguments

$ARGUMENTS (required: project type ID, e.g., "web_app_spa")

## Instructions

1. Read `docs/onboarding-system/knowledge-base/project-types-reference.md`

2. Find the project type matching the provided ID

3. Determine the appropriate base template:
   - Code projects → Use web-app.md or api-service.md as base
   - Content projects → Use book-publishing.md as base

4. Generate the template with:
   - Appropriate opencode.json configuration
   - Matching agents based on recommended_agents
   - Commands relevant to the project type
   - Folder structure appropriate for the category

5. Validate the generated template:
   - Check all JSON is valid
   - Verify referenced agents/commands exist
   - Ensure required sections are present

6. Save to `docs/onboarding-system/knowledge-base/project-templates/{category}/{id}.md`

## Example

Generate template for a React SPA:
```
/generate-template web_app_spa
```
```

**Usage:**
```bash
/generate-template web_app_spa
/generate-template ai_chatbot
/generate-template book_fiction
```

### /generate-all-templates

Batch generates project templates by priority.

```markdown
<!-- .opencode/command/generate-all-templates.md -->
---
description: Batch generate project templates by priority
agent: build
subtask: false
---

# Generate All Templates

Batch generate project templates from project-types-reference.md

## Arguments

$ARGUMENTS (optional: priority filter - "high", "medium", "low", "all")
Default: "high"

## Instructions

1. Read `docs/onboarding-system/knowledge-base/project-types-reference.md`

2. Parse all 254 project types

3. Filter by priority if specified

4. For each project type:
   - Generate template using generation rules
   - Validate against architecture.md patterns
   - Save to appropriate location
   - Log progress

5. Generate a summary report:
   - Templates generated (count by category)
   - Any errors or warnings
   - Cross-reference validation results

## Priority Breakdown

- **high**: ~30 templates (Phase 1 - common project types)
- **medium**: ~60 templates (Phase 2 - specialized but popular)
- **low**: ~164 templates (Phase 3 - niche project types)

## Usage

```bash
/generate-all-templates high     # Generate 30 Phase 1 templates
/generate-all-templates medium   # Generate Phase 2 templates  
/generate-all-templates all      # Generate all 254 templates
```
```

---

## File Structure

After implementation, the knowledge base will have this structure:

```
docs/onboarding-system/
├── README.md
├── architecture.md
├── automation-strategy.md          # This document
├── implementation-phases.md
├── database-schema.sql
│
├── knowledge-base/
│   ├── README.md
│   ├── project-types-reference.md  # 254 project definitions
│   │
│   ├── project-templates/
│   │   ├── web/
│   │   │   ├── web_app_spa.md
│   │   │   ├── web_app_fullstack.md
│   │   │   └── ...
│   │   ├── backend/
│   │   │   ├── api_rest.md
│   │   │   ├── api_graphql.md
│   │   │   └── ...
│   │   ├── mobile/
│   │   │   ├── mobile_react_native.md
│   │   │   └── ...
│   │   ├── ai/
│   │   │   ├── ai_chatbot.md
│   │   │   ├── ai_agent.md
│   │   │   └── ...
│   │   ├── content/
│   │   │   ├── book_fiction.md
│   │   │   ├── book_technical.md
│   │   │   └── ...
│   │   ├── devops/
│   │   │   ├── devops_kubernetes.md
│   │   │   └── ...
│   │   └── specialized/
│   │       └── ...
│   │
│   ├── agent-patterns/
│   │   ├── code-reviewer.md
│   │   ├── editor.md
│   │   ├── researcher.md
│   │   └── ...
│   │
│   ├── command-templates/
│   │   ├── plan.md
│   │   ├── review.md
│   │   ├── test.md
│   │   └── ...
│   │
│   ├── mcp-templates/
│   │   ├── context7.json
│   │   ├── filesystem.json
│   │   ├── github.json
│   │   └── ...
│   │
│   ├── plugin-templates/
│   │   ├── auto-commit.ts
│   │   ├── cost-tracker.ts
│   │   └── ...
│   │
│   └── tool-templates/
│       ├── database-query.ts
│       └── ...
│
└── .opencode/
    └── command/
        ├── validate-docs.md
        ├── generate-template.md
        └── generate-all-templates.md
```

---

## Metrics & Monitoring

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Documentation sync frequency | Weekly | CI job runs |
| Drift detection accuracy | >90% | Manual verification |
| Template generation success rate | >95% | Validation pass rate |
| Template coverage | 100% high-priority | Templates generated / total |

### Alerts

- **Documentation drift detected**: Create GitHub issue
- **Template validation failure**: Block PR merge
- **Generation errors**: Log and notify

---

## Related Documentation

- [Architecture](./architecture.md) - Full OpenCode configuration reference
- [Implementation Phases](./implementation-phases.md) - Step-by-step build guide
- [Knowledge Base README](./knowledge-base/README.md) - Template contribution guide
- [Project Types Reference](./knowledge-base/project-types-reference.md) - All 254 project definitions
