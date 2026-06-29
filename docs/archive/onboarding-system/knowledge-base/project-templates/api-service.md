---
id: tpl_api_service
title: API Service
description: Backend API service with REST or GraphQL endpoints, database integration, and authentication
tags:
  - coding
  - backend
  - api
  - rest
  - graphql
  - nodejs
  - python
  - database
applicable_to: null
metadata:
  default_model: anthropic/claude-sonnet-4-20250514
  recommended_agents:
    - code-reviewer
    - qa-engineer
  interview_questions:
    - What language/runtime? (Node.js, Python, Go, Rust)
    - REST or GraphQL?
    - What database? (PostgreSQL, MySQL, MongoDB, SQLite)
    - Need authentication? (JWT, OAuth, API keys)
    - Deployment target? (Docker, serverless, traditional)
---

# API Service Template

A robust template for building backend API services with database integration, authentication, and comprehensive testing.

## Recommended Folder Structure

```
project-root/
├── .opencode/
│   ├── agent/
│   │   ├── reviewer.md           # Code review agent
│   │   └── qa.md                 # QA/testing agent
│   └── command/
│       ├── test.md               # Run tests
│       ├── migrate.md            # Run database migrations
│       └── docs.md               # Generate API docs
├── src/
│   ├── routes/                   # API route handlers
│   │   ├── index.ts
│   │   └── users.ts
│   ├── services/                 # Business logic
│   ├── models/                   # Data models/entities
│   ├── middleware/               # Express/Hono middleware
│   │   ├── auth.ts
│   │   └── validation.ts
│   ├── db/                       # Database configuration
│   │   ├── index.ts
│   │   ├── schema.sql
│   │   └── migrations/
│   ├── utils/                    # Utility functions
│   ├── types/                    # TypeScript types
│   └── index.ts                  # Entry point
├── tests/
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── helpers/                  # Test utilities
├── scripts/                      # Utility scripts
│   ├── seed.ts                   # Database seeding
│   └── migrate.ts                # Migration runner
├── opencode.json
├── AGENTS.md
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
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
      "description": "Reviews API code for quality, security, and best practices",
      "mode": "subagent"
    },
    "qa": {
      "description": "Helps write and improve tests",
      "mode": "subagent"
    }
  },
  "command": {
    "test": {
      "description": "Run test suite",
      "template": "Run the test suite with coverage. Analyze failures and suggest fixes."
    },
    "migrate": {
      "description": "Run database migrations",
      "template": "Run pending database migrations. Report any issues."
    },
    "docs": {
      "description": "Generate API documentation",
      "template": "Generate or update API documentation based on the current routes and schemas."
    }
  },
  "formatter": {
    "prettier": {
      "extensions": [".ts", ".js", ".json"]
    }
  }
}
```

### AGENTS.md

```markdown
# API Service

A backend API service built with [FRAMEWORK].

## Project Structure

- `src/routes/` - API endpoint handlers
- `src/services/` - Business logic layer
- `src/models/` - Database models and entities
- `src/middleware/` - Request middleware (auth, validation)
- `src/db/` - Database configuration and migrations
- `tests/` - Unit and integration tests

## API Design Principles

- RESTful resource naming
- Consistent error responses
- Input validation on all endpoints
- Proper HTTP status codes
- Pagination for list endpoints
- Rate limiting on public endpoints

## Code Standards

- Use TypeScript with strict mode
- Separate routes from business logic
- Write tests for all endpoints
- Document all public APIs
- Use environment variables for config
- Never commit secrets

## Database Guidelines

- Use migrations for schema changes
- Index frequently queried columns
- Use transactions for multi-step operations
- Sanitize all user inputs

## Security Checklist

- [ ] Input validation
- [ ] SQL injection prevention
- [ ] Authentication on protected routes
- [ ] Rate limiting
- [ ] CORS configuration
- [ ] No sensitive data in logs

## Available Commands

- `/test` - Run tests with coverage
- `/migrate` - Run database migrations
- `/docs` - Generate API documentation

## Available Agents

- `@reviewer` - Code review for API changes
- `@qa` - Help writing tests
```

### .opencode/agent/reviewer.md

```markdown
---
description: Reviews API code for quality, security, and best practices
mode: subagent
model: anthropic/claude-sonnet-4-20250514
tools:
  write: false
  edit: false
  bash: false
---

# API Code Reviewer

You are a senior backend developer reviewing API code.

## Review Focus Areas

1. **API Design**
   - RESTful conventions
   - Consistent naming
   - Proper HTTP methods
   - Response structure

2. **Security**
   - Input validation
   - SQL injection
   - Authentication/Authorization
   - Sensitive data handling
   - Rate limiting

3. **Performance**
   - N+1 queries
   - Missing indexes
   - Unnecessary data fetching
   - Connection pooling

4. **Error Handling**
   - Proper error responses
   - Error logging
   - Graceful degradation
   - Transaction rollbacks

5. **Testing**
   - Test coverage
   - Edge cases
   - Error scenarios
   - Integration tests

## Review Format

For each issue:
1. File and line number
2. Issue type (security/performance/design/etc.)
3. Severity (critical/major/minor)
4. Explanation
5. Recommended fix with code

Summary should include:
- Security assessment
- Performance concerns
- API design feedback
- Test coverage evaluation
```

### .opencode/agent/qa.md

```markdown
---
description: Helps write and improve tests for the API
mode: subagent
model: anthropic/claude-sonnet-4-20250514
tools:
  write: true
  edit: true
  bash: false
---

# QA Engineer

You are a QA engineer helping write comprehensive tests for an API service.

## Testing Strategy

1. **Unit Tests**
   - Service functions
   - Utility functions
   - Validation logic
   - Model methods

2. **Integration Tests**
   - API endpoints
   - Database operations
   - Authentication flows
   - Error handling

3. **Test Cases to Cover**
   - Happy path
   - Validation errors
   - Authentication failures
   - Not found scenarios
   - Edge cases
   - Concurrent operations

## Test Structure

```typescript
describe('Resource API', () => {
  describe('GET /resource', () => {
    it('should return list of resources', async () => {
      // Test implementation
    });
    
    it('should handle pagination', async () => {
      // Test implementation
    });
    
    it('should require authentication', async () => {
      // Test implementation
    });
  });
});
```

## Guidelines

- Use descriptive test names
- One assertion per test when possible
- Set up and tear down properly
- Use factories for test data
- Mock external services
- Test both success and failure cases
```

### .opencode/command/test.md

```markdown
---
description: Run test suite with coverage
agent: build
---

Run the API test suite:

1. Run unit tests:
   !`npm run test:unit -- --coverage`

2. Run integration tests:
   !`npm run test:integration`

3. Analyze results:
   - List failing tests
   - Show coverage report
   - Identify untested code paths

4. For failures, provide:
   - Likely cause
   - Suggested fix
   - Example test correction

5. Recommend additional tests for uncovered areas.
```

### .opencode/command/migrate.md

```markdown
---
description: Run database migrations
agent: build
---

Handle database migrations:

1. Check pending migrations:
   !`npm run migrate:status`

2. If there are pending migrations, run them:
   !`npm run migrate:up`

3. Verify migration success:
   - Check for errors
   - Verify schema changes
   - Test affected endpoints

4. Report:
   - Migrations applied
   - Any issues encountered
   - Recommended next steps
```

## Runtime-Specific Variations

### Node.js (Express/Hono)

**package.json scripts:**
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:unit": "vitest run --dir tests/unit",
    "test:integration": "vitest run --dir tests/integration",
    "migrate:up": "tsx scripts/migrate.ts up",
    "migrate:down": "tsx scripts/migrate.ts down",
    "migrate:status": "tsx scripts/migrate.ts status"
  }
}
```

### Python (FastAPI)

**Folder structure:**
```
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── routers/
│   ├── services/
│   ├── models/
│   └── db/
├── tests/
├── alembic/                  # Migrations
├── requirements.txt
└── pyproject.toml
```

### Go

**Folder structure:**
```
├── cmd/
│   └── api/
│       └── main.go
├── internal/
│   ├── handlers/
│   ├── services/
│   ├── models/
│   └── db/
├── pkg/
├── migrations/
├── go.mod
└── Makefile
```

## Interview Questions for Customization

1. **Language/Runtime**
   - "What language will you use for the API?"
   - Options: Node.js (TypeScript), Python, Go, Rust

2. **Framework**
   - Node.js: Express, Hono, Fastify
   - Python: FastAPI, Flask, Django
   - Go: Gin, Echo, Chi

3. **API Style**
   - "REST or GraphQL?"
   - Affects folder structure and tooling

4. **Database**
   - "What database will you use?"
   - Options: PostgreSQL, MySQL, MongoDB, SQLite

5. **Authentication**
   - "What authentication method?"
   - Options: JWT, OAuth, API keys, Session

6. **Deployment**
   - "How will you deploy?"
   - Options: Docker, Serverless, Traditional

## Customization Logic

Based on answers:

1. Generate language-specific folder structure
2. Set up appropriate testing framework
3. Configure database connection pattern
4. Add auth middleware templates
5. Include deployment configuration (Dockerfile, serverless.yml)
6. Set up OpenAPI/Swagger documentation
