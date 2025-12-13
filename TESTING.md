# Testing Guide

This document outlines the testing strategy, conventions, and best practices for the AgentPod/CodeOpen project.

## Quick Start

```bash
# API tests
cd apps/api && bun test              # Run all tests
cd apps/api && bun test:unit         # Run unit tests only
cd apps/api && bun test:integration  # Run integration tests only
cd apps/api && bun test:coverage     # Run with coverage

# Rust tests (Tauri backend)
cd apps/frontend/src-tauri && cargo test

# Frontend tests (Svelte)
cd apps/frontend && pnpm test

# E2E tests
pnpm test:e2e
```

## Philosophy: Test-Driven Development (TDD)

We follow **strict TDD** - tests are written before implementation code.

### The TDD Cycle

1. **Red** - Write a failing test that describes the expected behavior
2. **Green** - Write the minimum code to make the test pass
3. **Refactor** - Improve the code while keeping tests green

### TDD Workflow

```bash
# 1. Create test file first
touch apps/api/tests/unit/services/my-service.test.ts

# 2. Write failing test
# 3. Run test to confirm it fails
bun test tests/unit/services/my-service.test.ts

# 4. Implement the feature
# 5. Run test to confirm it passes
# 6. Refactor if needed
```

## Test Structure

### Directory Layout

```
apps/api/
├── tests/
│   ├── setup.ts              # Global test setup
│   ├── helpers/
│   │   ├── request.ts        # HTTP request utilities
│   │   ├── factories.ts      # Test data factories
│   │   ├── assertions.ts     # Custom assertions
│   │   └── database.ts       # Database utilities
│   ├── mocks/
│   │   ├── docker.ts         # Dockerode mock
│   │   ├── opencode-sdk.ts   # OpenCode SDK mock
│   │   ├── git.ts            # isomorphic-git mock
│   │   └── auth.ts           # Auth mock
│   ├── unit/
│   │   ├── utils/            # Pure function tests
│   │   ├── models/           # Database model tests
│   │   ├── services/         # Service tests (mocked deps)
│   │   └── middleware/       # Middleware tests
│   └── integration/
│       ├── routes/           # API route tests
│       └── workflows/        # Multi-route workflows

apps/frontend/
├── tests/
│   ├── setup.ts
│   ├── mocks/
│   │   └── tauri.ts          # Tauri API mocks
│   ├── unit/
│   │   ├── stores/           # Svelte store tests
│   │   └── lib/              # Utility tests
│   └── components/           # Component tests

apps/frontend/src-tauri/
├── src/
│   ├── commands/
│   │   └── *_test.rs         # Command tests (in-file)
│   └── services/
│       └── *_test.rs         # Service tests (in-file)

e2e/
├── playwright.config.ts
├── fixtures/
│   └── test-data.ts
└── specs/
    ├── auth.spec.ts
    ├── sandbox.spec.ts
    └── settings.spec.ts
```

## Naming Conventions

### Test Files

| Module | Pattern | Example |
|--------|---------|---------|
| API Unit | `*.test.ts` | `sandbox-manager.test.ts` |
| API Integration | `*.test.ts` | `sandboxes.test.ts` |
| Frontend | `*.test.ts` | `auth-store.test.ts` |
| Rust | `*_test.rs` or `mod tests` | In-file modules |
| E2E | `*.spec.ts` | `auth.spec.ts` |

### Test Descriptions

Use the **"should [expected behavior] when [condition]"** pattern:

```typescript
describe("SandboxManager", () => {
  describe("createSandbox", () => {
    it("should create a new sandbox when valid config is provided", async () => {
      // ...
    });

    it("should throw ValidationError when sandbox name is empty", async () => {
      // ...
    });

    it("should use default flavor when flavor is not specified", async () => {
      // ...
    });
  });
});
```

### Test Organization

Group tests by:
1. **Class/Module** - Top-level `describe`
2. **Method/Function** - Nested `describe`
3. **Scenario** - Individual `it` blocks

## Coverage Requirements

| Type | Target | Enforced |
|------|--------|----------|
| Statements | 100% | Yes |
| Branches | 100% | Yes |
| Functions | 100% | Yes |
| Lines | 100% | Yes |

Coverage is enforced in CI - builds fail if coverage drops below targets.

## Mocking Strategy

### Boundary Mocking

Mock at service boundaries, not internal implementation details:

```typescript
// GOOD - Mock the entire service
const mockDocker = createMockDocker();
const manager = new SandboxManager(mockDocker);

// BAD - Mock individual methods
jest.spyOn(docker, 'createContainer');
```

### Mock Implementations

Located in `tests/mocks/`:

| Mock | Purpose |
|------|---------|
| `docker.ts` | Dockerode container operations |
| `opencode-sdk.ts` | OpenCode API client |
| `git.ts` | isomorphic-git operations |
| `auth.ts` | Authentication middleware |
| `tauri.ts` | Tauri IPC (frontend) |

### Using Mocks

```typescript
import { createMockDocker, MockContainer } from '../mocks/docker';
import { createMockOpenCode } from '../mocks/opencode-sdk';

describe("SandboxManager", () => {
  let mockDocker: MockDocker;
  let mockOpenCode: MockOpenCode;
  let manager: SandboxManager;

  beforeEach(() => {
    mockDocker = createMockDocker();
    mockOpenCode = createMockOpenCode();
    manager = new SandboxManager(mockDocker, mockOpenCode);
  });

  afterEach(() => {
    mockDocker.reset();
    mockOpenCode.reset();
  });
});
```

## Test Data

### Factories

Use factories for consistent test data:

```typescript
import { createSandbox, createUser, createSession } from '../helpers/factories';

it("should return sandbox details", async () => {
  const sandbox = createSandbox({ name: "test-sandbox" });
  // ...
});
```

### Database Seeding

For integration tests:

```typescript
import { seedDatabase, clearDatabase } from '../helpers/database';

beforeEach(async () => {
  await clearDatabase();
  await seedDatabase({
    users: [createUser()],
    sandboxes: [createSandbox()],
  });
});
```

## API Testing

### Unit Tests

Test services and utilities in isolation:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { SandboxManager } from '../../../src/services/sandbox-manager';
import { createMockDocker } from '../../mocks/docker';

describe("SandboxManager", () => {
  let manager: SandboxManager;
  let mockDocker: MockDocker;

  beforeEach(() => {
    mockDocker = createMockDocker();
    manager = new SandboxManager(mockDocker);
  });

  describe("createSandbox", () => {
    it("should create container with correct config", async () => {
      const result = await manager.createSandbox({
        name: "test",
        flavor: "js",
      });

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: expect.stringContaining("js"),
        })
      );
      expect(result.id).toBeDefined();
    });
  });
});
```

### Integration Tests

Test complete request/response cycles:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp } from '../../helpers/request';
import { seedDatabase, clearDatabase } from '../../helpers/database';

describe("POST /api/sandboxes", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
    await seedDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await app.close();
  });

  it("should create sandbox and return 201", async () => {
    const response = await app.post("/api/sandboxes", {
      name: "test-sandbox",
      flavor: "js",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: "test-sandbox",
      status: "creating",
    });
  });

  it("should return 400 when name is missing", async () => {
    const response = await app.post("/api/sandboxes", {
      flavor: "js",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("name");
  });
});
```

## Frontend Testing

### Store Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { authStore, resetAuthStore } from '$lib/stores/auth';
import { mockTauri } from '../mocks/tauri';

describe("authStore", () => {
  beforeEach(() => {
    resetAuthStore();
    mockTauri.reset();
  });

  it("should update isAuthenticated when login succeeds", async () => {
    mockTauri.invoke.mockResolvedValue({ token: "test-token" });

    await authStore.login("user@example.com", "password");

    expect(authStore.isAuthenticated).toBe(true);
  });
});
```

### Component Tests

```typescript
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SandboxCard from '$lib/components/SandboxCard.svelte';

describe("SandboxCard", () => {
  it("should display sandbox name", () => {
    const { getByText } = render(SandboxCard, {
      props: { sandbox: { name: "my-sandbox", status: "running" } },
    });

    expect(getByText("my-sandbox")).toBeInTheDocument();
  });

  it("should emit delete event when delete button is clicked", async () => {
    const { getByRole, component } = render(SandboxCard, {
      props: { sandbox: { id: "123", name: "test", status: "running" } },
    });

    const deleteHandler = vi.fn();
    component.$on("delete", deleteHandler);

    await fireEvent.click(getByRole("button", { name: /delete/i }));

    expect(deleteHandler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { id: "123" } })
    );
  });
});
```

## Rust Testing

### Unit Tests (in-file)

```rust
// src/commands/sandbox.rs

#[tauri::command]
pub async fn create_sandbox(name: String) -> Result<Sandbox, String> {
    // implementation
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_sandbox_success() {
        let result = create_sandbox("test".to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().name, "test");
    }

    #[tokio::test]
    async fn test_create_sandbox_empty_name() {
        let result = create_sandbox("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("name"));
    }
}
```

### Integration Tests

```rust
// tests/integration/sandbox_tests.rs

use agentpod_tauri::commands::sandbox::*;

#[tokio::test]
async fn test_sandbox_lifecycle() {
    let sandbox = create_sandbox("test".to_string()).await.unwrap();
    assert_eq!(sandbox.status, "creating");

    let started = start_sandbox(sandbox.id.clone()).await.unwrap();
    assert_eq!(started.status, "running");

    let stopped = stop_sandbox(sandbox.id.clone()).await.unwrap();
    assert_eq!(stopped.status, "stopped");
}
```

## E2E Testing

### Playwright Setup

```typescript
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
  ],
});
```

### E2E Test Example

```typescript
// e2e/specs/sandbox.spec.ts
import { test, expect } from '@playwright/test';

test.describe("Sandbox Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-loaded"]');
  });

  test("should create a new sandbox", async ({ page }) => {
    await page.click('[data-testid="create-sandbox-btn"]');
    await page.fill('[data-testid="sandbox-name-input"]', 'e2e-test-sandbox');
    await page.selectOption('[data-testid="flavor-select"]', 'js');
    await page.click('[data-testid="confirm-create-btn"]');

    await expect(page.locator('[data-testid="sandbox-card"]')).toContainText(
      'e2e-test-sandbox'
    );
  });
});
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test:coverage
        working-directory: apps/api
      - uses: codecov/codecov-action@v3

  rust-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test
        working-directory: apps/frontend/src-tauri

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm test:e2e
```

### Pre-commit Hooks

```bash
# .husky/pre-commit
#!/bin/sh
pnpm test:unit --bail
```

## Troubleshooting

### Common Issues

**Tests hang or timeout**
- Check for unresolved promises
- Ensure all mocks are properly reset in `afterEach`
- Verify database connections are closed

**Flaky tests**
- Avoid time-dependent assertions
- Use `waitFor` for async operations
- Isolate test data between tests

**Coverage not accurate**
- Ensure source maps are enabled
- Check that all files are included in coverage config

### Debug Tips

```bash
# Run single test file
bun test tests/unit/services/sandbox-manager.test.ts

# Run tests matching pattern
bun test --grep "should create sandbox"

# Verbose output
bun test --verbose

# Debug mode (Node.js inspector)
bun test --inspect-brk
```

## Resources

- [Bun Test Runner](https://bun.sh/docs/cli/test)
- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [Rust Testing](https://doc.rust-lang.org/book/ch11-00-testing.html)

---

See also:
- `docs/testing/tdd-workflow.md` - Detailed TDD workflow
- `docs/testing/api-testing-guide.md` - API-specific patterns
- `docs/testing/frontend-testing-guide.md` - Svelte/Tauri testing
- `docs/testing/e2e-testing-guide.md` - End-to-end testing
