---
description: Check component or page for accessibility (a11y) compliance
agent: ui-review
subtask: true
---

# Accessibility Audit: $ARGUMENTS

Perform a WCAG 2.1 AA compliance check on the specified component/page.

## Automated Checks

Run these checks mentally or suggest running:
- axe-core browser extension
- Lighthouse accessibility audit
- Color contrast checker

## Manual Checklist

### Perceivable

#### 1.1 Text Alternatives
- [ ] All images have alt text (or aria-hidden if decorative)
- [ ] Icons have accessible labels
- [ ] Complex graphics have descriptions

#### 1.3 Adaptable
- [ ] Information structure uses semantic HTML
- [ ] Reading order makes sense without CSS
- [ ] Form inputs have visible labels

#### 1.4 Distinguishable
- [ ] Text contrast ≥ 4.5:1 (3:1 for large text)
- [ ] UI component contrast ≥ 3:1
- [ ] Focus indicators are visible
- [ ] Text can be resized to 200%
- [ ] Content reflows at 320px width
- [ ] prefers-reduced-motion is respected

### Operable

#### 2.1 Keyboard Accessible
- [ ] All functionality available via keyboard
- [ ] No keyboard traps
- [ ] Focus order is logical
- [ ] Focus is visible at all times
- [ ] Custom shortcuts don't conflict

#### 2.4 Navigable
- [ ] Skip links available (if needed)
- [ ] Page has descriptive title
- [ ] Focus doesn't move unexpectedly
- [ ] Link purpose is clear

#### 2.5 Input Modalities
- [ ] Touch targets ≥ 44x44px
- [ ] Gestures have alternatives
- [ ] Motion-triggered actions can be disabled

### Understandable

#### 3.1 Readable
- [ ] Language is specified (lang attribute)
- [ ] Unusual words are explained

#### 3.2 Predictable
- [ ] Navigation is consistent
- [ ] Components behave consistently
- [ ] Changes don't happen unexpectedly

#### 3.3 Input Assistance
- [ ] Errors are identified clearly
- [ ] Labels or instructions provided
- [ ] Error suggestions are helpful
- [ ] Important submissions can be reviewed

### Robust

#### 4.1 Compatible
- [ ] Valid HTML
- [ ] ARIA used correctly
- [ ] Custom components are accessible
- [ ] Status messages are announced

## Common Issues in This Codebase

Based on the tech stack (SvelteKit + Tailwind + shadcn):

### Watch For:
1. **Missing button types**: `<button>` without `type="button"`
2. **Click handlers on divs**: Should be buttons or links
3. **Missing aria-labels**: Icon-only buttons need them
4. **Focus rings removed**: `outline-none` without alternative
5. **Color-only meaning**: Status indicated only by color
6. **Modals**: Focus trapping, escape to close
7. **Dynamic content**: Live regions for updates

### shadcn Components
Most shadcn/ui components are accessible by default, but verify:
- Dialog: Focus trapped, escape closes
- Dropdown: Arrow key navigation
- Select: Keyboard selection works
- Tabs: Arrow key navigation

## Output Format

```markdown
## Accessibility Audit: [Component Name]

### WCAG Compliance Summary
| Criterion | Status | Notes |
|-----------|--------|-------|
| Perceivable | PASS/FAIL | ... |
| Operable | PASS/FAIL | ... |
| Understandable | PASS/FAIL | ... |
| Robust | PASS/FAIL | ... |

### Critical Issues (A violations)
1. **Issue**: [Description]
   - **WCAG**: [Criterion number]
   - **Impact**: [Who is affected]
   - **Fix**: [Specific solution]

### Important Issues (AA violations)
...

### Recommendations (AAA / best practices)
...

### Code Fixes
\`\`\`svelte
<!-- Before -->
<div onclick={handleClick}>Click me</div>

<!-- After -->
<button type="button" onclick={handleClick}>Click me</button>
\`\`\`
```

If $ARGUMENTS is empty, ask which component or page to audit.
