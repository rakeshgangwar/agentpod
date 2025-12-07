# UX Implementation Plan

**Application:** CodeOpen  
**Date:** December 2024

Comprehensive implementation plan for transforming CodeOpen into a true "Portable Command Center."

---

## Overview

This plan transforms CodeOpen from a "projects list with chat" into a true **"Portable Command Center"** with:

- Dashboard-first approach (Needs Attention)
- Mobile-optimized navigation (Bottom Nav - mobile only)
- Comprehensive activity tracking
- Enhanced agentic UX patterns
- Collapsible session sidebar on mobile

---

## Key Decisions

Based on user requirements:

1. **Dashboard approach**: "Needs Attention" dashboard as home page
2. **Bottom Navigation**: Mobile only (hidden on tablet/desktop)
3. **Chat Sidebar**: Collapsible panel on mobile
4. **GitHub Sync**: Deferred (not in current scope)
5. **Activity Feed**: Everything (AI actions, user actions, system events)

---

## Phase 1: Foundation & Accessibility (Week 1)

### 1.1 Design System Enhancements

**Files to modify:** `src/app.css`

**New CSS variables to add:**
```css
/* Status Colors */
--status-active: oklch(0.6 0.2 145);      /* green */
--status-thinking: oklch(0.6 0.2 250);    /* blue */
--status-waiting: oklch(0.75 0.15 85);    /* amber */
--status-paused: oklch(0.7 0.15 50);      /* orange */
--status-error: oklch(0.6 0.25 25);       /* red */
--status-idle: oklch(0.6 0.02 260);       /* gray */

/* Attention surfaces */
--surface-attention: oklch(0.97 0.03 85);
--surface-success: oklch(0.97 0.03 145);
--surface-error: oklch(0.97 0.03 25);

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**New components to create:**

| Component | Path | Purpose |
|-----------|------|---------|
| `status-indicator.svelte` | `src/lib/components/ui/status/` | Dot, badge, bar variants |
| `action-card.svelte` | `src/lib/components/ui/action-card/` | Attention-requiring items |
| `empty-state.svelte` | `src/lib/components/ui/empty-state/` | Consistent empty states |
| `skip-link.svelte` | `src/lib/components/` | Accessibility skip navigation |

### 1.2 Accessibility Fixes

**Files to modify:**
- `src/routes/projects/[id]/chat/+page.svelte` - Add focus-visible to session items
- `src/lib/chat/ChatThread.tsx` - Add ARIA labels to pickers
- `src/lib/chat/PermissionBar.tsx` - Add focus management
- `src/routes/settings/+page.svelte` - Add labels to textareas
- `src/routes/+layout.svelte` - Add skip link

**Specific changes:**
1. Add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to all interactive `div` elements
2. Add `aria-label` to all icon-only buttons
3. Add `role="status"` and `aria-live="polite"` to loading indicators
4. Add `<svelte:head><title>` to each page
5. Add reduced motion media query to app.css

---

## Phase 2: Dashboard & Navigation (Week 2)

### 2.1 New Dashboard Home Page

**Files to create:**
- `src/routes/+page.svelte` - Replace redirect with dashboard
- `src/lib/stores/activity.svelte.ts` - Activity tracking store

**Dashboard structure:**
```
┌─────────────────────────────────────────┐
│ Header: "Good morning, Alex"     [+][⚙] │
├─────────────────────────────────────────┤
│ NEEDS ATTENTION (if any)                │
│ ┌─────────────────────────────────────┐ │
│ │ 🔴 Permission: edit src/api.ts      │ │
│ │ 🟡 Waiting: backend needs input     │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ ACTIVE NOW (if any)                     │
│ ┌─────────────────────────────────────┐ │
│ │ 🟢 frontend: "Adding auth..." 65%   │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ RECENT PROJECTS                         │
│ [card] [card] [card] →                  │
├─────────────────────────────────────────┤
│ RECENT ACTIVITY                         │
│ • frontend: Edited 3 files - 2m ago     │
│ • backend: Ran npm install - 5m ago     │
└─────────────────────────────────────────┘
```

**Data requirements:**
- Aggregate project statuses from `projects` store
- Track pending permissions via SSE across all projects
- Track activity via new `activity` store

### 2.2 Bottom Navigation (Mobile Only)

**Files to create:**
- `src/lib/components/bottom-nav.svelte` - Navigation component

**Modify:** `src/routes/+layout.svelte` - Include conditionally

**Structure:**
```svelte
<BottomNav class="md:hidden">
  <BottomNav.Item href="/" icon={Home} label="Home" badge={attentionCount} />
  <BottomNav.Item href="/projects" icon={Folder} label="Projects" />
  <BottomNav.Item href="/activity" icon={Activity} label="Activity" />
  <BottomNav.Item href="/settings" icon={Settings} label="Settings" />
</BottomNav>
```

**Behavior:**
- Fixed to bottom on mobile (`< md` breakpoint)
- Hidden on tablet/desktop
- Badge shows count of items needing attention
- Active state highlighted

### 2.3 Activity Page (New)

**Files to create:**
- `src/routes/activity/+page.svelte` - Activity feed page

**Content:**
- Timeline of all actions across projects
- Filter by type (AI actions, permissions, user actions, system events)
- Grouped by date (Today, Yesterday, This Week)

---

## Phase 3: Chat UX Improvements (Week 3)

### 3.1 Collapsible Session Sidebar (Mobile)

**Files to modify:**
- `src/routes/projects/[id]/chat/+page.svelte`

**Add dependency:**
- Sheet component from shadcn/ui (if not present)

**Changes:**
```svelte
<!-- Desktop: Always visible sidebar -->
<div class="hidden md:flex w-64 border-r ...">
  <!-- Session list -->
</div>

<!-- Mobile: Collapsible panel -->
<div class="md:hidden">
  <Sheet.Root bind:open={sidebarOpen}>
    <Sheet.Trigger asChild let:builder>
      <Button builders={[builder]} variant="ghost" size="icon">
        <MenuIcon />
      </Button>
    </Sheet.Trigger>
    <Sheet.Content side="left">
      <!-- Session list -->
    </Sheet.Content>
  </Sheet.Root>
</div>
```

### 3.2 Enhanced Status Transparency

**Files to modify:**
- `src/lib/chat/RuntimeProvider.tsx` - Expose streaming state
- `src/lib/chat/ChatThread.tsx` - Enhanced loading indicator

**New loading indicator:**
```tsx
function EnhancedLoadingIndicator({ streamStatus }) {
  return (
    <div className="rounded-lg bg-muted p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-medium">{streamStatus.phase || "Processing..."}</span>
      </div>
      {streamStatus.currentAction && (
        <p className="text-sm text-muted-foreground font-mono">
          {streamStatus.currentAction}
        </p>
      )}
      {streamStatus.toolsCompleted > 0 && (
        <p className="text-xs text-muted-foreground">
          {streamStatus.toolsCompleted} actions completed
        </p>
      )}
    </div>
  );
}
```

### 3.3 Pause/Resume Capability (Optional)

**Note:** Requires checking if OpenCode API supports pause. If not, implement client-side "soft pause":
- Stops sending new messages
- Shows "Paused" indicator
- Allows resuming conversation

---

## Phase 4: Project & Settings Polish (Week 4)

### 4.1 Project Cards Enhancement

**Files to modify:**
- `src/routes/projects/+page.svelte`

**Changes:**
- Add current task preview to running projects
- Add progress indicator for active sessions
- Consider swipe actions on mobile (start/stop) - optional

### 4.2 Chat Tabs Responsive Fix

**Files to modify:**
- `src/routes/projects/[id]/+layout.svelte`

**Changes:**
```svelte
<!-- Responsive tabs -->
<Tabs.List class="flex overflow-x-auto scrollbar-hide">
  <Tabs.Trigger value="chat" class="flex-shrink-0">
    <span class="hidden sm:inline">Chat</span>
    <MessageSquareIcon class="sm:hidden h-5 w-5" />
  </Tabs.Trigger>
  <!-- ... other tabs -->
</Tabs.List>
```

### 4.3 Settings Page Refinement

**Files to modify:**
- `src/routes/settings/+page.svelte`

**Changes:**
- Add labels to all form fields
- Group related settings visually
- Add section navigation on mobile

---

## Phase 5: Final Polish (Week 5)

### 5.1 Page Transitions

**Files to modify:**
- `src/routes/+layout.svelte`

**Implementation:**
```svelte
<script>
  import { fade } from 'svelte/transition';
  import { page } from '$app/stores';
</script>

{#key $page.url.pathname}
  <div in:fade={{ duration: 150, delay: 150 }} out:fade={{ duration: 150 }}>
    <slot />
  </div>
{/key}
```

### 5.2 Skeleton Loaders

**Files to modify:**
- All pages with loading states

**Pattern:**
```svelte
{#if isLoading}
  <ProjectCardSkeleton />
  <ProjectCardSkeleton />
  <ProjectCardSkeleton />
{:else}
  {#each projects as project}
    <ProjectCard {project} />
  {/each}
{/if}
```

### 5.3 Pull-to-Refresh (Optional)

**Files to create:**
- `src/lib/components/pull-to-refresh.svelte`

### 5.4 Onboarding Flow (Optional)

**Files to create:**
- `src/routes/onboarding/+page.svelte` - Welcome flow
- `src/lib/stores/onboarding.svelte.ts` - Track completion

---

## Component Inventory

### New Components to Create

| Component | Priority | Complexity |
|-----------|----------|------------|
| `status-indicator.svelte` | P1 | Low |
| `action-card.svelte` | P1 | Medium |
| `bottom-nav.svelte` | P1 | Medium |
| `empty-state.svelte` | P2 | Low |
| `skip-link.svelte` | P2 | Low |
| `sheet.svelte` (shadcn) | P2 | Low (add from shadcn) |
| `pull-to-refresh.svelte` | P3 | Medium |
| `project-card-skeleton.svelte` | P3 | Low |

### Existing Components to Modify

| Component | Changes |
|-----------|---------|
| All `button` uses | Add aria-label to icon-only |
| `ChatThread.tsx` | Enhanced loading, focus management |
| `PermissionBar.tsx` | Context expansion, batch actions |
| `RuntimeProvider.tsx` | Expose streaming state |

---

## File Changes Summary

### New Files

```
src/
├── lib/
│   ├── components/
│   │   ├── bottom-nav.svelte
│   │   ├── skip-link.svelte
│   │   └── ui/
│   │       ├── status/
│   │       │   ├── status-indicator.svelte
│   │       │   └── index.ts
│   │       ├── action-card/
│   │       │   ├── action-card.svelte
│   │       │   └── index.ts
│   │       ├── empty-state/
│   │       │   ├── empty-state.svelte
│   │       │   └── index.ts
│   │       └── sheet/ (from shadcn)
│   │           └── ...
│   └── stores/
│       └── activity.svelte.ts
└── routes/
    └── activity/
        └── +page.svelte
```

### Modified Files

```
src/
├── app.css                                    # Status colors, a11y
├── routes/
│   ├── +page.svelte                          # Dashboard (was redirect)
│   ├── +layout.svelte                        # Bottom nav, skip link
│   ├── projects/
│   │   ├── +page.svelte                      # Card enhancements
│   │   └── [id]/
│   │       ├── +layout.svelte                # Responsive tabs
│   │       └── chat/
│   │           └── +page.svelte              # Collapsible sidebar
│   └── settings/
│       └── +page.svelte                      # Form labels
└── lib/
    └── chat/
        ├── ChatThread.tsx                     # Enhanced loading, a11y
        ├── PermissionBar.tsx                  # Context, batch
        └── RuntimeProvider.tsx                # Streaming state
```

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | Week 1 | Foundation & Accessibility |
| Phase 2 | Week 2 | Dashboard & Navigation |
| Phase 3 | Week 3 | Chat UX Improvements |
| Phase 4 | Week 4 | Project & Settings Polish |
| Phase 5 | Week 5 | Final Polish |

**Total estimated time: 5 weeks**

---

## Success Metrics

### Accessibility
- [ ] WCAG 2.1 AA compliance for focus indicators
- [ ] All interactive elements keyboard accessible
- [ ] Screen reader announcements for dynamic content
- [ ] Reduced motion support

### Mobile UX
- [ ] Touch targets >= 44px
- [ ] Bottom navigation functional
- [ ] Chat sidebar collapsible
- [ ] Tabs responsive

### Agentic UX
- [ ] Dashboard shows attention items
- [ ] Activity feed tracks all actions
- [ ] Enhanced status transparency
- [ ] Permission context visible

### Performance
- [ ] Page transitions smooth
- [ ] Skeleton loaders prevent layout shift
- [ ] No blocking operations on UI thread

---

*Document generated: December 2024*
