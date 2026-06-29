# Knowledge Base

This directory contains the raw content for the AgentPod knowledge base. These files are used to seed the database and serve as the source of truth for project templates, agent patterns, and other onboarding resources.

## Directory Structure

```
knowledge-base/
├── README.md                    # This file
├── project-types-reference.md   # 254 project types across 20 categories
├── project-templates/           # Full project setup templates
│   ├── web-app.md              # Web application template
│   ├── api-service.md          # API/backend service template
│   └── book-publishing.md      # Book writing workflow template
├── agent-patterns/              # Reusable agent definitions
│   ├── code-reviewer.md        # Code review agent
│   ├── editor.md               # Content editing agent
│   └── researcher.md           # Research assistant agent
├── command-templates/           # Reusable command definitions
│   ├── review.md               # Code/content review command
│   ├── test.md                 # Test runner command
│   └── plan.md                 # Planning command
├── tool-templates/              # Reusable tool definitions
│   └── database-query.ts       # Database query tool example
├── plugin-templates/            # OpenCode plugin templates
│   ├── env-protection.ts       # Protect sensitive files from being read
│   ├── session-logger.ts       # Log all session activity
│   ├── auto-commit.ts          # Auto-commit on session idle
│   └── cost-tracker.ts         # Track API costs and token usage
└── mcp-templates/               # MCP server configurations
    ├── context7.json           # Documentation lookup service
    ├── github.json             # GitHub integration
    └── filesystem.json         # Secure filesystem access
```

## Document Categories

### Project Templates (`project_template`)

Full project setup configurations including:
- Folder structure recommendations
- `opencode.json` configuration
- `AGENTS.md` content
- Recommended agents, commands, and tools
- Best practices for the project type

**File Format:**
```markdown
---
id: tpl_unique_id
title: Human-readable Title
description: Brief description
tags: ["tag1", "tag2"]
metadata:
  default_model: anthropic/claude-sonnet-4-20250514
  recommended_agents:
    - code-reviewer
    - technical-writer
---

# Template Content

[Full template documentation and generated files]
```

### Agent Patterns (`agent_pattern`)

Reusable agent definitions that can be applied to any project type:
- Agent configuration (mode, model, tools, permissions)
- System prompt
- Use cases and examples

**File Format:**
```markdown
---
id: agent_unique_id
title: Agent Name
description: What this agent does
tags: ["tag1", "tag2"]
applicable_to: ["project_type1", "project_type2"]  # or null for all
metadata:
  mode: subagent
  default_tools:
    write: false
    edit: false
---

# Agent Definition

[Agent markdown content that goes in .opencode/agent/name.md]
```

### Command Templates (`command_template`)

Reusable command definitions for common tasks:
- Command configuration
- Template with placeholders
- Use cases

**File Format:**
```markdown
---
id: cmd_unique_id
title: Command Name
description: What this command does
tags: ["tag1", "tag2"]
applicable_to: ["project_type1"]  # or null for all
metadata:
  agent: build
  subtask: false
---

# Command Definition

[Command markdown content that goes in .opencode/command/name.md]
```

### Tool Templates (`tool_template`)

Reusable custom tool definitions:
- TypeScript tool implementation
- Configuration options
- Use cases

**File Format:**
```typescript
/**
 * @id tool_unique_id
 * @title Tool Name
 * @description What this tool does
 * @tags ["tag1", "tag2"]
 * @applicable_to ["project_type1"]
 */

import { tool } from "@opencode-ai/plugin";

export default tool({
  // Tool implementation
});
```

### Plugin Templates (`plugin_template`)

OpenCode plugins that hook into session events:
- Event subscriptions
- Security protections
- Automation workflows
- Monitoring and logging

**File Format:**
```typescript
/**
 * @id plugin_unique_id
 * @title Plugin Name
 * @description What this plugin does
 * @tags ["tag1", "tag2"]
 * @applicable_to null  // null means all project types
 * @priority high|medium|low
 */

export default {
  name: "plugin-name",
  subscribe: ["session.created", "tool.execute.before", ...],
  async handle(event) {
    // Handle events
  }
};
```

**Available Events:**
- `session.created`, `session.idle`, `session.error`, `session.compacted`
- `file.edited`, `file.watcher.updated`
- `tool.execute.before`, `tool.execute.after`
- `message.updated`, `message.part.updated`
- `permission.replied`, `permission.updated`

### MCP Templates (`mcp_template`)

MCP server configurations for external integrations:
- Local (stdio) and remote (HTTP) servers
- Authentication configuration
- Tool documentation
- Usage examples

**File Format:**
```json
{
  "id": "mcp_unique_id",
  "title": "Server Name",
  "description": "What this server provides",
  "tags": ["tag1", "tag2"],
  "applicable_to": ["project_type1"],
  "priority": "high",
  
  "config": {
    "server_name": {
      "type": "local|remote",
      "command": ["npx", "-y", "@org/server"],
      "url": "https://...",
      "headers": {}
    }
  },
  
  "tools_provided": [
    { "name": "tool_name", "description": "..." }
  ]
}
```

## Adding New Content

### 1. Create the file

Add a new markdown or TypeScript file in the appropriate directory.

### 2. Include frontmatter

Every document must include YAML frontmatter with:
- `id`: Unique identifier (e.g., `tpl_web_app`, `agent_reviewer`)
- `title`: Human-readable title
- `description`: Brief description (1-2 sentences)
- `tags`: Array of relevant tags for search
- `applicable_to`: Array of project types, or omit for universal
- `metadata`: Category-specific additional data

### 3. Write the content

Follow the format for the specific category. Include:
- Clear explanations
- Example configurations
- Generated file content (exact markdown/JSON/TypeScript)

### 4. Update the database

Run the seeding script to update the database:

```bash
pnpm run seed:knowledge
```

## Search and Retrieval

The knowledge base supports:

### Tag-based Search
```sql
SELECT * FROM knowledge_documents 
WHERE tags LIKE '%"react"%';
```

### Category Filtering
```sql
SELECT * FROM knowledge_documents 
WHERE category = 'project_template';
```

### Project Type Filtering
```sql
SELECT * FROM knowledge_documents 
WHERE applicable_to IS NULL 
   OR applicable_to LIKE '%"web_app"%';
```

### Full-text Search (Future)
Vector embeddings can be added for semantic search using the `embedding` column.

## Best Practices

1. **Keep content focused**: Each document should address one specific template/pattern
2. **Include examples**: Show real configuration files, not just descriptions
3. **Use consistent formatting**: Follow the established patterns
4. **Tag appropriately**: Use existing tags when possible, add new ones sparingly
5. **Test the output**: Verify generated configurations work with OpenCode
6. **Document assumptions**: Note any prerequisites or dependencies
