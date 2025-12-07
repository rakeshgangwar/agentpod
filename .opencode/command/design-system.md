---
description: Work within the project's design language and system
agent: ux-design
---

# Design System Guidance: $ARGUMENTS

Help work within the project's design language for: $ARGUMENTS

## Current Design System Foundation

This project uses a design system based on:
- **Component Library**: shadcn/ui (Radix primitives)
- **Styling**: Tailwind CSS with CSS variables
- **Theme**: Light/dark mode support via CSS custom properties

### Core Design Tokens

```css
/* Base colors - defined in app.css */
--background: /* Page background */
--foreground: /* Primary text */
--card: /* Card backgrounds */
--card-foreground: /* Card text */
--popover: /* Popover backgrounds */
--popover-foreground: /* Popover text */
--primary: /* Primary actions */
--primary-foreground: /* Text on primary */
--secondary: /* Secondary elements */
--secondary-foreground: /* Text on secondary */
--muted: /* Muted backgrounds */
--muted-foreground: /* Muted text */
--accent: /* Accent highlights */
--accent-foreground: /* Text on accent */
--destructive: /* Error/danger */
--destructive-foreground: /* Text on destructive */
--border: /* Borders */
--input: /* Input borders */
--ring: /* Focus rings */
```

### Typography Scale

```css
/* Using Tailwind defaults */
text-xs    /* 12px - Fine print, timestamps */
text-sm    /* 14px - Secondary text, labels */
text-base  /* 16px - Body text (mobile minimum) */
text-lg    /* 18px - Emphasized body */
text-xl    /* 20px - Section headers */
text-2xl   /* 24px - Page headers */
text-3xl   /* 30px - Hero text */
```

### Spacing Scale

```css
/* Using Tailwind defaults (4px base) */
1  = 4px   /* Tight spacing */
2  = 8px   /* Related items */
3  = 12px  /* Standard gap */
4  = 16px  /* Section separation */
6  = 24px  /* Component padding */
8  = 32px  /* Large separation */
12 = 48px  /* Major sections */
```

### Border Radius

```css
rounded-sm   /* 2px - Subtle */
rounded      /* 4px - Default */
rounded-md   /* 6px - Cards, buttons */
rounded-lg   /* 8px - Larger cards */
rounded-xl   /* 12px - Prominent elements */
rounded-full /* Circles, pills */
```

### Shadows

```css
shadow-sm    /* Subtle elevation */
shadow       /* Default elevation */
shadow-md    /* Cards */
shadow-lg    /* Modals, dropdowns */
```

## Component Patterns

### Buttons
```svelte
<Button variant="default">Primary Action</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Tertiary</Button>
<Button variant="ghost">Subtle</Button>
<Button variant="destructive">Danger</Button>
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconHere /></Button>
```

### Cards
```svelte
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Forms
```svelte
<div class="space-y-4">
  <div class="space-y-2">
    <Label for="email">Email</Label>
    <Input id="email" type="email" placeholder="Enter email" />
  </div>
  <Button type="submit">Submit</Button>
</div>
```

### Dialogs
```svelte
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    <!-- Content -->
    <DialogFooter>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Design Language Principles

### 1. Purposeful Minimalism
- Every element should have a purpose
- Remove visual noise
- Generous whitespace
- Let content breathe

### 2. Consistent Hierarchy
- Clear visual hierarchy guides the eye
- Size, weight, and color indicate importance
- Primary actions are obvious
- Secondary actions are accessible but subordinate

### 3. Subtle Sophistication
- Avoid garish colors
- Prefer soft shadows over hard edges
- Smooth, subtle animations
- Professional, not playful

### 4. Responsive Fluidity
- Layouts adapt, not break
- Typography scales appropriately
- Touch targets expand on mobile
- Information density adjusts to screen

### 5. Accessible by Default
- Contrast requirements met
- Focus states visible
- Motion respectful
- Semantic structure

## Agentic UI Patterns

For AI-related interfaces, follow these patterns:

### Status Indicators
```svelte
<!-- Use consistent status colors -->
<div class="flex items-center gap-2">
  <span class="size-2 rounded-full bg-green-500"></span>
  <span>Running</span>
</div>
```

### Progress Communication
```svelte
<!-- Show what AI is doing -->
<div class="space-y-1">
  <div class="text-sm text-muted-foreground">Analyzing files...</div>
  <Progress value={progress} />
</div>
```

### Action Cards
```svelte
<!-- For AI actions that need review -->
<Card class="border-l-4 border-l-primary">
  <CardHeader class="pb-2">
    <CardTitle class="text-sm font-medium">
      Proposed Change
    </CardTitle>
  </CardHeader>
  <CardContent>
    <!-- Change details -->
  </CardContent>
  <CardFooter class="flex gap-2">
    <Button size="sm">Approve</Button>
    <Button size="sm" variant="outline">Reject</Button>
  </CardFooter>
</Card>
```

## Usage

When asking for design system help, specify:
- Component being designed
- Context (where it appears)
- Variants needed
- Responsive behavior required

If $ARGUMENTS is empty, provide a general overview of the design system.
