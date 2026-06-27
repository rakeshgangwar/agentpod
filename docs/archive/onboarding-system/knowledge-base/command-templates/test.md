---
id: cmd_test
title: Test Runner
description: Runs tests with smart filtering, coverage analysis, and failure diagnosis
tags:
  - testing
  - automation
  - quality
  - ci
  - debugging
applicable_to:
  - web_app
  - api_service
  - cli_tool
  - mobile_app
metadata:
  agent: build
  subtask: false
  supports_arguments: true
---

# Test Command

A command that intelligently runs tests, analyzes results, and helps diagnose failures.

## Command Definition

Place this file at `.opencode/command/test.md`:

```markdown
---
description: Run tests and analyze results
agent: build
subtask: false
---

# Test Runner

Run the test suite and analyze results.

## Arguments

$ARGUMENTS

## Instructions

1. **Determine test scope** based on arguments:
   - No arguments: Run full test suite
   - File path: Run tests for that file/directory
   - `--changed`: Run tests for changed files only
   - `--failed`: Re-run previously failed tests

2. **Run the appropriate test command**:
   - Detect the test framework (Jest, Vitest, pytest, etc.)
   - Apply any filters from arguments
   - Capture full output

3. **Analyze results**:
   - Report pass/fail summary
   - For failures, provide:
     - Clear explanation of what failed
     - The relevant test code
     - The actual vs expected values
     - Suggestions for fixing

4. **Suggest next steps**:
   - If all pass: Suggest coverage improvements
   - If failures: Prioritize fixes
   - If slow: Identify performance issues

## Test Framework Detection

Check for:
- `vitest.config.*` -> Use `pnpm test` or `npx vitest`
- `jest.config.*` -> Use `pnpm test` or `npx jest`
- `pytest.ini` or `pyproject.toml` with pytest -> Use `pytest`
- `Cargo.toml` -> Use `cargo test`
- `go.mod` -> Use `go test ./...`
```

## Usage Examples

### Run All Tests
```
/test
```

### Run Tests for a Specific File
```
/test @src/utils/format.ts
```

### Run Tests for Changed Files
```
/test --changed
```

### Run Tests with Coverage
```
/test --coverage
```

### Re-run Failed Tests
```
/test --failed
```

### Run Tests Matching a Pattern
```
/test auth
```

### Run Tests in Watch Mode
```
/test --watch
```

## Variants

### Test with Coverage Analysis

Create `.opencode/command/test-coverage.md`:

```markdown
---
description: Run tests with coverage analysis
agent: build
subtask: false
---

Run tests with coverage and analyze the results.

$ARGUMENTS

## Instructions

1. Run tests with coverage enabled:
   - Jest/Vitest: `--coverage`
   - pytest: `--cov`
   - Go: `-cover`

2. Analyze coverage report:
   - Overall coverage percentage
   - Files below threshold (typically 80%)
   - Uncovered lines/branches

3. Provide recommendations:
   - High-priority files to add tests
   - Specific uncovered code paths
   - Suggested test cases

## Output Format

### Coverage Summary
| Metric     | Current | Target | Status |
|------------|---------|--------|--------|
| Statements | X%      | 80%    | OK/NEEDS WORK |
| Branches   | X%      | 80%    | OK/NEEDS WORK |
| Functions  | X%      | 80%    | OK/NEEDS WORK |
| Lines      | X%      | 80%    | OK/NEEDS WORK |

### Files Needing Attention
[List of files with low coverage]

### Suggested Test Cases
[Specific tests to write]
```

### Test and Fix

Create `.opencode/command/test-fix.md`:

```markdown
---
description: Run tests and automatically fix failures
agent: build
subtask: false
---

Run tests, diagnose failures, and fix them.

$ARGUMENTS

## Instructions

1. Run the test suite
2. For each failure:
   - Understand what the test expects
   - Examine the implementation
   - Determine if bug is in test or implementation
   - Fix the appropriate code
3. Re-run tests to verify fixes
4. Report summary of changes made

## Fixing Guidelines

- **Test is correct, implementation is wrong**: Fix the implementation
- **Test is outdated**: Update the test to match new requirements
- **Test is flaky**: Identify and fix the source of flakiness
- **Test timeout**: Optimize or increase timeout appropriately

Always explain your reasoning before making changes.
```

### Watch Mode with Smart Re-runs

Create `.opencode/command/test-watch.md`:

```markdown
---
description: Run tests in watch mode with intelligent re-running
agent: build
subtask: false
---

Start tests in watch mode.

$ARGUMENTS

## Instructions

1. Detect test framework
2. Start watch mode:
   - Vitest: `vitest --watch`
   - Jest: `jest --watch`
   - pytest: `pytest-watch`

3. Monitor for failures and provide:
   - Immediate feedback on failures
   - Suggestions for fixes
   - Re-run confirmations

Note: Watch mode runs continuously. User can type 'q' to quit.
```

### Snapshot Update

Create `.opencode/command/test-update-snapshots.md`:

```markdown
---
description: Update test snapshots after intentional changes
agent: build
subtask: false
---

Review and update test snapshots.

$ARGUMENTS

## Instructions

1. Run tests to identify snapshot failures
2. For each failure:
   - Show the diff between old and new snapshot
   - Ask for confirmation before updating
3. Update approved snapshots
4. Report summary

## Safety Checks

Before updating snapshots:
- Ensure changes are intentional
- Verify no regression in functionality
- Check that new snapshot is correct

Use `--all` to update all snapshots without confirmation (use with caution).
```

## Framework-Specific Commands

### Jest/Vitest

```markdown
## Available Options

- `--watch`: Watch mode
- `--coverage`: Coverage report
- `--ui`: Open Vitest UI (Vitest only)
- `--filter <pattern>`: Filter tests by name
- `--file <path>`: Run specific file
- `--bail`: Stop on first failure
```

### pytest

```markdown
## Available Options

- `-v`: Verbose output
- `-x`: Stop on first failure
- `--cov`: Coverage report
- `-k <pattern>`: Filter by keyword
- `--pdb`: Debug on failure
- `-n auto`: Parallel execution
```

### Cargo Test

```markdown
## Available Options

- `--release`: Test in release mode
- `--no-capture`: Show stdout
- `--test <name>`: Run specific test
- `-- --nocapture`: Pass args to test binary
```

## Customization Tips

### Project-Specific Test Setup

Add setup instructions for your project:

```markdown
## Before Running Tests

Ensure:
- Database is running: `docker compose up -d db`
- Environment variables set: `source .env.test`
- Migrations applied: `pnpm db:migrate:test`
```

### Custom Test Patterns

Define patterns for your project:

```markdown
## Test File Conventions

- Unit tests: `*.test.ts` (same directory as source)
- Integration tests: `tests/integration/*.test.ts`
- E2E tests: `tests/e2e/*.spec.ts`
```

### CI Alignment

Match CI configuration:

```markdown
## CI Equivalent Commands

What we run locally should match CI:

1. `pnpm lint` - Linting
2. `pnpm check` - Type checking
3. `pnpm test` - Unit tests
4. `pnpm test:integration` - Integration tests
5. `pnpm test:e2e` - E2E tests (requires running app)
```
