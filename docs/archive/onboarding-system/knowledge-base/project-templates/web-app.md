---
id: tpl_web_app
title: Web Application
description: Full-stack web application with modern frontend framework and optional backend
tags:
  - coding
  - web
  - frontend
  - backend
  - fullstack
  - react
  - vue
  - svelte
  - nextjs
applicable_to: null
metadata:
  default_model: anthropic/claude-sonnet-4-20250514
  recommended_agents:
    - code-reviewer
    - technical-writer
  interview_questions:
    - What frontend framework? (React, Vue, Svelte, Next.js, etc.)
    - TypeScript or JavaScript?
    - Need a backend? (API routes, separate service, serverless)
    - What styling approach? (CSS, Tailwind, styled-components)
    - What state management? (built-in, Redux, Zustand, Pinia)
    - Any specific integrations? (auth, database, payments)
---

# Web Application Template

A comprehensive template for building modern web applications with your choice of frontend framework and optional backend integration.

## Recommended Folder Structure

```
project-root/
├── .opencode/
│   ├── agent/
│   │   └── reviewer.md           # Code review agent
│   └── command/
│       ├── test.md               # Run tests
│       ├── lint.md               # Run linting
│       └── build.md              # Build for production
├── src/
│   ├── components/               # Reusable UI components
│   ├── pages/                    # Page components (or routes/)
│   ├── hooks/                    # Custom React hooks (if React)
│   ├── utils/                    # Utility functions
│   ├── styles/                   # Global styles
│   ├── types/                    # TypeScript types (if TS)
│   └── api/                      # API client/routes
├── public/                       # Static assets
├── tests/                        # Test files
├── opencode.json                 # OpenCode configuration
├── AGENTS.md                     # Project instructions
├── package.json
├── tsconfig.json                 # If TypeScript
└── README.md
```

## Generated Configuration Files

### opencode.json

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": {
    "agentpod_knowledge": {
      "type": "remote",
      "url": "{env:MANAGEMENT_API_URL}/api/mcp/knowledge",
      "headers": {
        "Authorization": "Bearer {env:AGENTPOD_API_TOKEN}"
      }
    }
  },
  "agent": {
    "reviewer": {
      "description": "Reviews code for quality, performance, and best practices",
      "mode": "subagent"
    }
  },
  "command": {
    "test": {
      "description": "Run test suite with coverage",
      "template": "Run the test suite with coverage report. Analyze any failures and suggest fixes."
    },
    "lint": {
      "description": "Run linting and fix issues",
      "template": "Run the linter and automatically fix any issues that can be auto-fixed. Report remaining issues."
    },
    "build": {
      "description": "Build for production",
      "template": "Build the application for production. Report any warnings or errors."
    }
  },
  "formatter": {
    "prettier": {
      "extensions": [".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".md"]
    }
  }
}
```

### AGENTS.md

```markdown
# Web Application Project

This is a modern web application built with [FRAMEWORK].

## Project Structure

- `src/components/` - Reusable UI components
- `src/pages/` - Page-level components
- `src/hooks/` - Custom React hooks
- `src/utils/` - Utility functions
- `src/api/` - API client and routes
- `tests/` - Test files

## Code Standards

- Use TypeScript with strict mode
- Follow [FRAMEWORK] best practices
- Write unit tests for utilities and components
- Use CSS modules or Tailwind for styling
- Keep components small and focused

## Development Workflow

1. Create feature branch from main
2. Write tests first (TDD encouraged)
3. Implement feature
4. Run `/test` to verify
5. Run `/lint` to check style
6. Request review with `@reviewer`

## Available Commands

- `/test` - Run tests with coverage
- `/lint` - Run linter and fix issues
- `/build` - Build for production

## Available Agents

- `@reviewer` - Code review for PRs and changes
```

### .opencode/agent/reviewer.md

```markdown
---
description: Reviews code for quality, performance, and best practices
mode: subagent
model: anthropic/claude-sonnet-4-20250514
tools:
  write: false
  edit: false
  bash: false
---

# Code Reviewer

You are a senior frontend developer reviewing code for a web application.

## Review Focus Areas

1. **Code Quality**
   - Clean, readable code
   - Proper naming conventions
   - DRY principles
   - Single responsibility

2. **Performance**
   - Unnecessary re-renders
   - Bundle size impact
   - Lazy loading opportunities
   - Memoization where appropriate

3. **Best Practices**
   - Framework-specific patterns
   - Accessibility (a11y)
   - Responsive design
   - Error handling

4. **Security**
   - XSS vulnerabilities
   - Proper input validation
   - Secure API calls
   - No sensitive data exposure

## Review Format

For each issue found:
1. File and line number
2. Issue description
3. Severity (critical/major/minor/suggestion)
4. Recommended fix with code example

End with a summary of:
- Overall code quality assessment
- Most important issues to address
- Positive aspects of the code
```

### .opencode/command/test.md

```markdown
---
description: Run test suite with coverage
agent: build
---

Run the test suite with the following steps:

1. Execute the test command:
   !`npm test -- --coverage`

2. Analyze the results:
   - List any failing tests
   - Identify uncovered code paths
   - Suggest missing test cases

3. For each failure:
   - Explain why it might be failing
   - Suggest a fix

4. Report coverage summary and recommend areas needing more tests.
```

## Framework-Specific Variations

### React with Next.js

**Additional folder structure:**
```
├── app/                    # App router (Next.js 13+)
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/               # API routes
├── components/
└── lib/                   # Shared utilities
```

**Additional to opencode.json:**
```json
{
  "instructions": ["next.config.js"]
}
```

### Vue.js

**Additional folder structure:**
```
├── src/
│   ├── views/             # Vue views
│   ├── components/
│   ├── composables/       # Vue 3 composables
│   ├── stores/            # Pinia stores
│   └── router/
```

### Svelte/SvelteKit

**Additional folder structure:**
```
├── src/
│   ├── routes/            # SvelteKit routes
│   ├── lib/
│   │   ├── components/
│   │   └── stores/
│   └── app.html
```

## Interview Questions for Customization

The onboarding agent should ask:

1. **Framework Choice**
   - "Which frontend framework would you like to use?"
   - Options: React, Vue, Svelte, Next.js, Nuxt, SvelteKit

2. **Language**
   - "TypeScript or JavaScript?"
   - Recommend TypeScript for larger projects

3. **Styling**
   - "How would you like to handle styling?"
   - Options: CSS Modules, Tailwind, styled-components, Sass

4. **State Management**
   - "Do you need global state management?"
   - Options: Built-in (Context/Pinia/stores), Redux, Zustand

5. **Backend Needs**
   - "Does this project need a backend?"
   - Options: None, API routes, Separate service, Serverless

6. **Testing**
   - "What testing approach?"
   - Options: Jest, Vitest, Playwright, Cypress

## Customization Logic

Based on answers, the onboarding agent should:

1. Adjust folder structure for chosen framework
2. Configure appropriate build tools
3. Set up testing framework
4. Add framework-specific agents/commands
5. Include relevant documentation links in AGENTS.md
