---
description: Check component or page for responsive design issues
agent: ui-review
subtask: true
---

# Responsive Design Check: $ARGUMENTS

Analyze the specified component/page for responsive design quality across all breakpoints.

## Breakpoints to Test

| Breakpoint | Width | Device Examples |
|------------|-------|-----------------|
| xs | < 640px | iPhone SE, small phones |
| sm | 640-767px | Large phones, small tablets portrait |
| md | 768-1023px | Tablets, small laptops |
| lg | 1024-1279px | Laptops, small desktops |
| xl | 1280-1535px | Desktops |
| 2xl | 1536px+ | Large monitors |

## Check Each Breakpoint For

### Layout
- [ ] Layout adapts appropriately (single column on mobile, multi-column on desktop)
- [ ] No horizontal scrolling
- [ ] Content hierarchy remains clear
- [ ] Adequate whitespace at all sizes

### Typography
- [ ] Text remains readable (16px+ on mobile)
- [ ] Line lengths are comfortable (45-75 characters)
- [ ] Headings scale appropriately
- [ ] No text truncation issues

### Touch Targets (Mobile)
- [ ] Minimum 44x44px touch targets
- [ ] Adequate spacing between targets
- [ ] No hover-only interactions

### Navigation
- [ ] Navigation accessible at all sizes
- [ ] Mobile nav pattern appropriate (hamburger, bottom tabs, etc.)
- [ ] Current location is clear

### Images & Media
- [ ] Images scale appropriately
- [ ] No images overflowing containers
- [ ] Appropriate image sizes loaded per viewport

### Forms
- [ ] Input fields are adequate size on mobile
- [ ] Labels don't overlap
- [ ] Submit buttons are prominent

## Tailwind Patterns to Look For

```svelte
<!-- Good responsive patterns -->
<div class="flex flex-col md:flex-row">
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
<div class="w-full max-w-md mx-auto lg:max-w-none">
<div class="hidden md:block"> <!-- Show on desktop -->
<div class="block md:hidden"> <!-- Show on mobile -->

<!-- Problematic patterns -->
<div class="w-[350px]"> <!-- Fixed width -->
<div class="absolute left-[calc(50%-175px)]"> <!-- Magic numbers -->
<div class="text-xs"> <!-- Might be too small on mobile -->
```

## Output Format

```markdown
## Responsive Review: [Component Name]

### Mobile (xs, sm)
- Status: PASS / FAIL / NEEDS WORK
- Issues: [List]
- Recommendations: [List]

### Tablet (md, lg)
- Status: PASS / FAIL / NEEDS WORK
- Issues: [List]
- Recommendations: [List]

### Desktop (xl, 2xl)
- Status: PASS / FAIL / NEEDS WORK
- Issues: [List]
- Recommendations: [List]

### Code Changes Needed
\`\`\`diff
- <div class="problem-class">
+ <div class="fixed-class">
\`\`\`
```

If $ARGUMENTS is empty, ask which component or page to review.
