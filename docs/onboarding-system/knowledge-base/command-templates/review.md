---
id: cmd_review
title: Code/Content Review
description: Triggers a comprehensive review of code or content using a dedicated reviewer agent
tags:
  - review
  - quality
  - code
  - content
  - feedback
applicable_to: null
metadata:
  agent: reviewer
  subtask: true
  supports_arguments: true
---

# Review Command

A command that triggers a comprehensive review of code, content, or any other artifact using a dedicated reviewer agent.

## Command Definition

Place this file at `.opencode/command/review.md`:

```markdown
---
description: Review code or content for quality and best practices
agent: reviewer
subtask: true
---

# Review Request

Review the following for quality, consistency, and best practices:

$ARGUMENTS

## Review Checklist

Please evaluate:

1. **Quality**
   - Is the code/content clear and well-organized?
   - Does it follow established conventions?
   - Is it maintainable?

2. **Correctness**
   - Are there any bugs or errors?
   - Does it handle edge cases?
   - Is the logic sound?

3. **Best Practices**
   - Does it follow industry standards?
   - Are there any anti-patterns?
   - Could it be improved?

## Output Format

Provide your review in this format:

### Summary
[Brief overall assessment]

### Issues Found
[List of issues with severity and location]

### Recommendations
[Prioritized list of improvements]

### Positive Highlights
[What was done well]
```

## Usage Examples

### Review a Specific File
```
/review @src/auth/login.ts
```

### Review Multiple Files
```
/review @src/components/Button.tsx @src/components/Input.tsx
```

### Review with Context
```
/review @src/api/users.ts - Focus on security and SQL injection vulnerabilities
```

### Review a Directory
```
/review @src/utils/ - Check for code duplication and optimization opportunities
```

### Review Content (Non-code)
```
/review @docs/README.md - Check for clarity, grammar, and completeness
```

## Variants

### Security-Focused Review

Create `.opencode/command/security-review.md`:

```markdown
---
description: Security-focused code review
agent: security-reviewer
subtask: true
---

Perform a security-focused review of:

$ARGUMENTS

## Security Checklist

Focus specifically on:

1. **Input Validation**
   - All user inputs sanitized
   - SQL injection prevention
   - XSS prevention

2. **Authentication/Authorization**
   - Proper session handling
   - Token management
   - Permission checks

3. **Data Protection**
   - Sensitive data handling
   - Encryption usage
   - Logging of sensitive info

4. **Dependencies**
   - Known vulnerabilities
   - Outdated packages
   - Supply chain risks

Report all findings with CVSS severity ratings where applicable.
```

### Performance Review

Create `.opencode/command/perf-review.md`:

```markdown
---
description: Performance-focused code review
agent: reviewer
subtask: true
---

Analyze performance characteristics of:

$ARGUMENTS

## Performance Checklist

1. **Algorithm Efficiency**
   - Time complexity
   - Space complexity
   - Unnecessary operations

2. **Resource Usage**
   - Memory allocation patterns
   - Database query efficiency
   - Network call optimization

3. **Caching Opportunities**
   - Memoization candidates
   - Cache invalidation
   - Repeated computations

4. **Bottlenecks**
   - I/O operations
   - Synchronous blocking
   - Resource contention

Provide specific metrics and benchmarks where possible.
```

### Content Review (Non-code)

Create `.opencode/command/content-review.md`:

```markdown
---
description: Review written content for quality
agent: editor
subtask: true
---

Review the following content:

$ARGUMENTS

## Review Criteria

1. **Clarity**
   - Is the message clear?
   - Is the structure logical?
   - Are there confusing sections?

2. **Grammar & Style**
   - Grammar and spelling
   - Consistent tone
   - Active vs passive voice

3. **Completeness**
   - Are all points covered?
   - Missing information?
   - Unnecessary content?

4. **Audience Fit**
   - Appropriate for target audience?
   - Technical level correct?
   - Engaging tone?

Provide inline suggestions and an overall assessment.
```

## Customization Tips

### Project-Specific Review Criteria

Modify the review checklist based on your project:

```markdown
## Project-Specific Criteria

- [ ] Follows our naming conventions (camelCase for functions, PascalCase for components)
- [ ] Uses our custom error handling pattern
- [ ] Includes required JSDoc comments
- [ ] Has corresponding test file
- [ ] Updates API documentation if needed
```

### Team Standards Integration

Reference your team's standards:

```markdown
## Standards References

- Code style: See `docs/code-style.md`
- API design: See `docs/api-guidelines.md`
- Security: See `docs/security-policy.md`

Ensure all code adheres to these documented standards.
```

### CI/CD Integration

Add checks that align with your CI pipeline:

```markdown
## CI Alignment

Before approving, verify:
- [ ] Would pass linting (`pnpm lint`)
- [ ] Would pass type checking (`pnpm check`)
- [ ] Tests would pass (`pnpm test`)
- [ ] No new security warnings
```

## Dependencies

This command works best with the `code-reviewer` agent pattern. See `agent-patterns/code-reviewer.md` for the recommended agent definition.
