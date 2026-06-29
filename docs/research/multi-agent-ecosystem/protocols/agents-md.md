# AGENTS.md Specification

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production Standard

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Full Name** | AGENTS.md |
| **Originator** | OpenAI |
| **Current Governance** | AAIF (Linux Foundation) |
| **Purpose** | Agent instruction specification |
| **Website** | https://agents.md |

---

## What is AGENTS.md?

AGENTS.md is a file-based convention for providing structured instructions to AI coding agents. Similar to how `.gitignore` tells Git what to ignore, `AGENTS.md` tells AI agents how to work with your project.

### Key Problem Solved

Without AGENTS.md:
- Agents don't know project conventions
- Build/test commands are guessed
- Code style preferences are inconsistent
- Each agent interaction starts from scratch

With AGENTS.md:
- Project context is immediately available
- Build commands are documented
- Code style is explicitly defined
- Agents work consistently across sessions

---

## File Structure

### Location

AGENTS.md files can be placed at:
- **Repository root** - Project-wide instructions
- **Directory level** - Directory-specific instructions (override/supplement root)

```
my-project/
├── AGENTS.md           # Root instructions
├── src/
│   ├── AGENTS.md       # Source-specific instructions
│   └── components/
│       └── AGENTS.md   # Component-specific instructions
└── tests/
    └── AGENTS.md       # Test-specific instructions
```

### Inheritance

Agents read AGENTS.md files from root to current directory, with later files supplementing or overriding earlier ones.

---

## Content Structure

### Basic Template

```markdown
# AGENTS.md

## Project Overview
Brief description of what this project does.

## Build Commands
- `npm install` - Install dependencies
- `npm run build` - Production build
- `npm run dev` - Development server
- `npm test` - Run tests

## Code Style
- Use TypeScript strict mode
- Prefer functional components
- Use named exports

## Architecture
- `src/` - Source code
- `tests/` - Test files
- `docs/` - Documentation

## Constraints
- Do not modify `package-lock.json` directly
- Always run tests before committing
- Use conventional commits
```

### Comprehensive Template

```markdown
# AGENTS.md

## Project Information
- **Name**: My Awesome Project
- **Language**: TypeScript
- **Framework**: Next.js 14
- **Package Manager**: pnpm

## Getting Started
```bash
pnpm install
pnpm dev
```

## Directory Structure
```
src/
├── app/          # Next.js app router pages
├── components/   # React components
├── lib/          # Utility functions
├── hooks/        # Custom React hooks
└── types/        # TypeScript type definitions
```

## Code Conventions

### Naming
- Components: PascalCase (`UserProfile.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Types: PascalCase with suffix (`UserProfileProps`)
- Constants: SCREAMING_SNAKE_CASE

### File Structure
Each component file should follow:
```tsx
// 1. Imports
// 2. Types
// 3. Component
// 4. Exports
```

### Styling
- Use Tailwind CSS for styling
- No inline styles
- Use `cn()` for conditional classes

## Testing

### Commands
- `pnpm test` - Run all tests
- `pnpm test:watch` - Watch mode
- `pnpm test:coverage` - With coverage

### Conventions
- Test files: `*.test.ts` or `*.spec.ts`
- Use `describe` and `it` blocks
- Mock external dependencies

## Git Workflow
- Branch naming: `feature/`, `fix/`, `docs/`
- Commit format: Conventional Commits
- PR required for main branch

## Dependencies
When adding dependencies:
1. Prefer well-maintained packages
2. Check bundle size impact
3. Update this file if architecture changes

## Security
- Never commit secrets
- Use environment variables for config
- Sanitize user input

## Performance
- Lazy load heavy components
- Optimize images with next/image
- Use React.memo for expensive renders

## Known Issues
- [ ] Auth redirect loop in Safari
- [ ] Slow initial load on mobile

## Contact
- Lead: @username
- Slack: #project-channel
```

---

## Section Reference

### Required Sections

| Section | Purpose |
|---------|---------|
| **Project Overview** | What the project does |
| **Build Commands** | How to build/run/test |

### Recommended Sections

| Section | Purpose |
|---------|---------|
| **Code Style** | Formatting and naming conventions |
| **Architecture** | Directory structure and patterns |
| **Testing** | Test commands and conventions |
| **Dependencies** | Rules for adding packages |
| **Constraints** | Things agents should NOT do |

### Optional Sections

| Section | Purpose |
|---------|---------|
| **Git Workflow** | Branch and commit conventions |
| **Security** | Security considerations |
| **Performance** | Performance guidelines |
| **Known Issues** | Current bugs or limitations |
| **Contact** | Who to ask for help |

---

## Agent-Specific Instructions

### Per-Agent Sections

You can include instructions for specific agents:

```markdown
## Agent: Claude Code
- Use XML tags for structured output
- Prefer edit blocks over full file rewrites

## Agent: GitHub Copilot
- Inline suggestions should match existing style
- Avoid suggesting deprecated APIs

## Agent: Cursor
- Use @-mentions for file references
- Composer commands preferred for multi-file changes
```

### Capability Requirements

```markdown
## Required Capabilities
- File read/write
- Terminal access
- Git operations

## Restricted Operations
- No network requests without approval
- No package installation without confirmation
```

---

## Best Practices

### 1. Be Specific

❌ Bad:
```markdown
## Code Style
Use good code style.
```

✅ Good:
```markdown
## Code Style
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters
```

### 2. Include Examples

```markdown
## Component Structure

Example component:
```tsx
import { type FC } from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button: FC<ButtonProps> = ({ label, onClick }) => {
  return (
    <button onClick={onClick} className="btn-primary">
      {label}
    </button>
  );
};
```
```

### 3. Keep Updated

AGENTS.md should be treated as living documentation:
- Update when conventions change
- Remove outdated information
- Version with your code

### 4. Be Actionable

Every instruction should be something an agent can act on:

❌ "Write clean code"  
✅ "Functions should be ≤50 lines, single responsibility"

---

## Tooling Support

### Agent Support

| Agent | AGENTS.md Support |
|-------|-------------------|
| Claude Code | ✅ Native |
| OpenAI Codex | ✅ Native |
| GitHub Copilot | ✅ Native |
| Cursor | ✅ Native |
| Windsurf | ✅ Native |
| OpenCode | ✅ Via AGENTS.md file |
| goose | ✅ Native (AAIF project) |

### Editor Extensions

- **VS Code**: AGENTS.md syntax highlighting
- **JetBrains**: Plugin for AGENTS.md support
- **Vim/Neovim**: Markdown highlighting works

---

## AgentPod Integration

### Current Implementation

AgentPod already reads `AGENTS.md` in the repository root as part of the OpenCode configuration.

### Recommendations

1. **Document in onboarding** - Help users create effective AGENTS.md files
2. **Template library** - Provide AGENTS.md templates for common project types
3. **Validation** - Lint AGENTS.md for common issues

### Template Example for AgentPod Projects

```markdown
# AGENTS.md

## Project Type
AgentPod Sandbox Project

## Environment
- Container: agentpod-fullstack
- Node: 22
- Python: 3.12

## Commands
- `npm run dev` - Start development server
- `npm test` - Run tests
- `npm run build` - Production build

## AgentPod Specific
- Use `agentpod.toml` for sandbox configuration
- Respect resource tier limits
- Use SSE for real-time updates

## Code Style
[Project-specific conventions]
```

---

## Comparison with Similar Files

| File | Purpose | Audience |
|------|---------|----------|
| `README.md` | Project documentation | Humans |
| `AGENTS.md` | Agent instructions | AI agents |
| `CONTRIBUTING.md` | Contribution guide | Human contributors |
| `.editorconfig` | Editor settings | IDEs |
| `agentpod.toml` | Sandbox config | AgentPod runtime |

---

## Resources

- **Specification:** https://agents.md
- **AAIF Project:** https://aaif.io/projects/agents-md
- **Examples:** https://github.com/agents-md/examples
- **Linter:** `npx agents-md-lint`

---

## Related Documentation

- [MCP Protocol](./mcp.md) - Tool integration
- [AAIF Governance](../governance/aaif.md) - Linux Foundation governance

---

*Part of AgentPod Multi-Agent Ecosystem Research*
