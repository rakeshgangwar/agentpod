---
description: Perform a comprehensive UX audit of the application or specific component
agent: ux-design
subtask: true
---

# UX Audit for $ARGUMENTS

Perform a comprehensive UX audit following these dimensions:

## 1. Information Architecture
- Is the navigation logical and predictable?
- Can users find what they're looking for?
- Is the hierarchy of information clear?

## 2. Visual Design Consistency
- Are colors, typography, and spacing consistent?
- Do components follow the design system?
- Are there any visual anomalies?

## 3. Interaction Design
- Are interactive elements obvious?
- Is feedback provided for all actions?
- Are loading, error, and empty states handled?

## 4. Responsive Adaptation
- How does the UI adapt across mobile/tablet/desktop?
- Are touch targets adequate on mobile (44x44px)?
- Does layout reflow appropriately?

## 5. Accessibility
- Is keyboard navigation complete?
- Do screen readers convey meaning?
- Is color contrast sufficient (4.5:1)?

## 6. Agentic UX Patterns
- Is AI activity transparent?
- Can users pause/stop/undo AI actions?
- Are permission requests non-intrusive?
- Is status communication clear?

## Output Format

Provide findings in this structure:

```markdown
## UX Audit: [Component/Screen Name]

### Executive Summary
[2-3 sentence overview]

### Critical Issues (Must Fix)
1. Issue: [Description]
   - Impact: [How it affects users]
   - Recommendation: [Specific fix]
   - Effort: Low/Medium/High

### Important Improvements (Should Fix)
...

### Suggestions (Nice to Have)
...

### What's Working Well
...

### Platform-Specific Notes
- Mobile: ...
- Tablet: ...
- Desktop: ...
```

If $ARGUMENTS is empty, audit the entire application starting with the main user flows.
