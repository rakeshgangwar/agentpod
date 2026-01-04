# Git Features Implementation Plan

## Overview

This document outlines the implementation plan for enhanced Git features in the AgentPod frontend, including branch management and diff viewing capabilities.

**Status**: Planning  
**Created**: 2024-12-18  
**Last Updated**: 2024-12-18

---

## Table of Contents

1. [Goals & Scope](#goals--scope)
2. [Current State](#current-state)
3. [Architecture](#architecture)
4. [UI/UX Design](#uiux-design)
5. [Implementation Phases](#implementation-phases)
6. [API Specifications](#api-specifications)
7. [Component Specifications](#component-specifications)
8. [Testing Strategy](#testing-strategy)
9. [Open Questions](#open-questions)

---

## Goals & Scope

### Primary Goals

1. **Branch Management**: Enable users to create, switch, and delete Git branches
2. **Diff Viewing**: Visual diff viewer for reviewing code changes before committing
3. **Improved Commit Workflow**: Better staging and commit experience
4. **Mobile Support**: Full functionality on mobile devices

### Out of Scope (Future Phases)

- Pull/push to remote repositories
- Merge conflict resolution UI
- Interactive rebase
- Git stash management
- Branch comparison views

---

## Current State

### Backend API (Already Available)

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/v2/repos/:name/branches` | GET | List all branches | ✅ Available |
| `/api/v2/repos/:name/branches` | POST | Create branch | ✅ Available |
| `/api/v2/repos/:name/branches/:branch` | DELETE | Delete branch | ✅ Available |
| `/api/v2/repos/:name/checkout` | POST | Switch branch | ✅ Available |
| `/api/v2/repos/:name/diff` | GET | Get diff summary | ✅ Available |
| `/api/v2/sandboxes/:id/git/status` | GET | Working directory status | ✅ Available |
| `/api/v2/sandboxes/:id/git/log` | GET | Commit history | ✅ Available |
| `/api/v2/sandboxes/:id/git/commit` | POST | Commit changes | ✅ Available |

### Frontend (Current Capabilities)

| Feature | Status |
|---------|--------|
| View git status (changed files) | ✅ Implemented |
| View commit history | ✅ Implemented |
| Commit all changes | ✅ Implemented |
| List branches | ❌ Not implemented |
| Switch branches | ❌ Not implemented |
| Create/delete branches | ❌ Not implemented |
| View file diffs | ❌ Not implemented |

### Current Git Tab Location

```
apps/frontend/src/routes/projects/[id]/sync/+page.svelte
```

---

## Architecture

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Svelte    │────▶│   Tauri     │────▶│  Management │────▶│    Git      │
│  Frontend   │◀────│   Backend   │◀────│     API     │◀────│  Backend    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
    UI Layer         IPC Bridge          REST API          isomorphic-git
```

### New API Routes Needed

The existing repo routes use repository name, but we need sandbox-aware routes:

```typescript
// Routes to add in apps/api/src/routes/sandboxes.ts

GET  /api/v2/sandboxes/:id/git/branches      // List branches
POST /api/v2/sandboxes/:id/git/branches      // Create branch
POST /api/v2/sandboxes/:id/git/checkout      // Switch branch  
DELETE /api/v2/sandboxes/:id/git/branches/:branch  // Delete branch
GET  /api/v2/sandboxes/:id/git/diff          // Get all file diffs
GET  /api/v2/sandboxes/:id/git/diff/:path    // Get single file diff
```

### New Tauri Commands Needed

```rust
// Commands to add in apps/frontend/src-tauri/src/commands/sandboxes.rs

list_sandbox_branches(id: String) -> BranchListResponse
create_sandbox_branch(id: String, name: String, ref: Option<String>) -> ()
checkout_sandbox_branch(id: String, branch: String) -> ()
delete_sandbox_branch(id: String, branch: String) -> ()
get_sandbox_diff(id: String) -> DiffResponse
get_sandbox_file_diff(id: String, path: String) -> FileDiffResponse
```

---

## UI/UX Design

### Desktop Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Git                                                      [↻ Refresh]         │
│ ┌─────────────────┐                                                          │
│ │ 🌿 main ▼       │  ← Branch selector dropdown                              │
│ └─────────────────┘                                                          │
├────────────────────────┬─────────────────────────────────────────────────────┤
│ CHANGES                │ DIFF VIEWER                                         │
│ ────────               │ ───────────                                         │
│                        │                                                     │
│ ▼ Staged (1)           │ ┌─ src/components/Button.tsx ─────────────────────┐ │
│   [+] new-file.ts      │ │ Modified • +15 -3 lines              [Collapse] │ │
│                        │ ├─────────────────────────────────────────────────┤ │
│ ▼ Unstaged (2)         │ │ @@ -15,7 +15,10 @@                             │ │
│   [~] Button.tsx    ◀──│ │  15     return (                                │ │
│   [-] old.json         │ │  16       <button                               │ │
│                        │ │  17 -       className="btn"                     │ │
│ ─────────────────────  │ │  17 +       className={cn(                      │ │
│ [Commit message...  ]  │ │  18 +         "btn",                            │ │
│ [   Commit Changes   ] │ │  19 +         variant && styles[variant]        │ │
│                        │ │  20 +       )}                                  │ │
├────────────────────────┤ │  21       onClick={onClick}                     │ │
│ BRANCHES               │ └─────────────────────────────────────────────────┘ │
│ ────────               │                                                     │
│ ● main (current)       │                                                     │
│ ○ feature/auth         │                                                     │
│ ○ fix/button-style     │                                                     │
│                        │                                                     │
│ [+ New Branch]         │                                                     │
├────────────────────────┴─────────────────────────────────────────────────────┤
│ HISTORY                                                                      │
│ ● abc1234 main    Add button variants                              2h ago   │
│ ○ def5678 main    Initial commit                                   1d ago   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌────────────────────────────────┐
│ Git                       [↻]  │
├────────────────────────────────┤
│ Branch: 🌿 main           [▼]  │
│ ┌────────────────────────────┐ │
│ │ ● main (current)           │ │
│ │ ○ feature/auth             │ │
│ │ ─────────────────────────  │ │
│ │ [+ New Branch]             │ │
│ └────────────────────────────┘ │
├────────────────────────────────┤
│ ▼ CHANGES (3)                  │
│ ┌────────────────────────────┐ │
│ │ [~] Button.tsx        [▼]  │ │
│ │     Modified • +15 -3      │ │
│ │  ┌──────────────────────┐  │ │
│ │  │ - className="btn"    │  │ │
│ │  │ + className={cn(     │  │ │
│ │  └──────────────────────┘  │ │
│ └────────────────────────────┘ │
│                                │
│ [Commit message...          ]  │
│ [       Commit Changes       ] │
├────────────────────────────────┤
│ ▶ HISTORY (10 commits)         │
└────────────────────────────────┘
```

### Color Scheme

| Element | CSS Variable | Hex Value |
|---------|--------------|-----------|
| Added line background | `--diff-add-bg` | `rgba(34,197,94,0.1)` |
| Added line indicator | `--cyber-emerald` | `#22c55e` |
| Deleted line background | `--diff-del-bg` | `rgba(239,68,68,0.1)` |
| Deleted line indicator | `--cyber-red` | `#ef4444` |
| Modified file badge | `--cyber-amber` | `#f59e0b` |
| Hunk header background | `--cyber-cyan/10` | `rgba(34,211,238,0.1)` |
| Current branch indicator | `--cyber-cyan` | `#22d3ee` |

---

## Implementation Phases

### Phase 1: API & Backend (Est: 1 day)

**Goal**: Expose branch and diff operations through sandbox-aware API endpoints.

#### Tasks

- [ ] **1.1** Add branch routes to sandbox API
  - File: `apps/api/src/routes/sandboxes.ts`
  - Endpoints: list, create, checkout, delete branches

- [ ] **1.2** Add diff route to sandbox API
  - File: `apps/api/src/routes/sandboxes.ts`
  - Endpoints: get diff summary, get file diff with hunks

- [ ] **1.3** Implement diff parsing utility
  - File: `apps/api/src/services/git/filesystem.ts`
  - Parse unified diff format into structured hunks/lines

- [ ] **1.4** Add Tauri commands for branch operations
  - File: `apps/frontend/src-tauri/src/commands/sandboxes.rs`
  - Commands: list, create, checkout, delete branches

- [ ] **1.5** Add Tauri commands for diff operations
  - File: `apps/frontend/src-tauri/src/commands/sandboxes.rs`
  - Commands: get diff, get file diff

- [ ] **1.6** Add TypeScript types and API functions
  - File: `apps/frontend/src/lib/api/tauri.ts`
  - Types: Branch, DiffHunk, DiffLine, etc.

#### Deliverables
- All new API endpoints functional
- Tauri commands registered and working
- TypeScript types defined

---

### Phase 2: Branch Management UI (Est: 1-2 days)

**Goal**: Users can view, create, switch, and delete branches.

#### Tasks

- [ ] **2.1** Create BranchSelector component
  - File: `apps/frontend/src/lib/components/git/branch-selector.svelte`
  - Dropdown showing current branch, click to see all

- [ ] **2.2** Create BranchList component
  - File: `apps/frontend/src/lib/components/git/branch-list.svelte`
  - List of all branches with current indicator

- [ ] **2.3** Create BranchItem component
  - File: `apps/frontend/src/lib/components/git/branch-item.svelte`
  - Single branch with switch/delete actions

- [ ] **2.4** Create CreateBranchDialog component
  - File: `apps/frontend/src/lib/components/git/create-branch-dialog.svelte`
  - Modal for entering new branch name

- [ ] **2.5** Create git store for state management
  - File: `apps/frontend/src/lib/stores/git.svelte.ts`
  - Manage branches, current branch, loading states

- [ ] **2.6** Integrate branch selector into Git tab header
  - File: `apps/frontend/src/routes/projects/[id]/sync/+page.svelte`
  - Replace static header with BranchSelector

- [ ] **2.7** Add uncommitted changes warning dialog
  - Warn when switching branches with uncommitted changes

#### Deliverables
- Branch selector dropdown in Git tab
- Create new branch dialog
- Switch branch functionality
- Delete branch with confirmation

---

### Phase 3: Diff View - Basic (Est: 2 days)

**Goal**: Users can see file-level diffs for changed files.

#### Tasks

- [ ] **3.1** Create DiffFileList component
  - File: `apps/frontend/src/lib/components/git/diff-file-list.svelte`
  - List of changed files with status badges

- [ ] **3.2** Create DiffFileItem component
  - File: `apps/frontend/src/lib/components/git/diff-file-item.svelte`
  - Expandable file card with diff content

- [ ] **3.3** Create DiffStats component
  - File: `apps/frontend/src/lib/components/git/diff-stats.svelte`
  - Shows +N / -N line counts

- [ ] **3.4** Create basic DiffHunk component
  - File: `apps/frontend/src/lib/components/git/diff-hunk.svelte`
  - Renders a single diff chunk

- [ ] **3.5** Create DiffLine component
  - File: `apps/frontend/src/lib/components/git/diff-line.svelte`
  - Single line with proper coloring

- [ ] **3.6** Update Git tab layout for diff panel
  - File: `apps/frontend/src/routes/projects/[id]/sync/+page.svelte`
  - Two-column layout: files list + diff viewer

- [ ] **3.7** Implement lazy loading for file diffs
  - Only fetch diff when file is expanded

#### Deliverables
- Changed files list with status indicators
- Click file to expand and see diff
- Colored diff lines (green/red)
- Line numbers in gutter

---

### Phase 4: Diff View - Enhanced (Est: 1-2 days)

**Goal**: Polish the diff viewing experience.

#### Tasks

- [ ] **4.1** Add syntax highlighting to diff
  - Use Shiki or highlight.js for code coloring

- [ ] **4.2** Add collapsible context lines
  - Collapse unchanged lines, show "N more lines" link

- [ ] **4.3** Add diff navigation
  - "Next change" / "Previous change" buttons
  - Keyboard shortcuts (] and [)

- [ ] **4.4** Add copy button for code blocks
  - Copy individual hunks or entire file diff

- [ ] **4.5** Handle binary files
  - Show "Binary file changed" message

- [ ] **4.6** Handle large diffs
  - Truncate at 500 lines, "Show all" button

#### Deliverables
- Syntax highlighted diffs
- Collapsible context
- Navigation between changes
- Proper handling of edge cases

---

### Phase 5: Mobile Optimization (Est: 1 day)

**Goal**: Full Git functionality on mobile devices.

#### Tasks

- [ ] **5.1** Implement accordion layout for mobile
  - Single-column, expandable sections

- [ ] **5.2** Add touch gestures
  - Swipe between files
  - Pull to refresh

- [ ] **5.3** Optimize touch targets
  - Minimum 44x44px for all interactive elements

- [ ] **5.4** Test and fix responsive breakpoints
  - Ensure smooth transition between layouts

- [ ] **5.5** Add mobile-specific loading states
  - Skeleton screens for better perceived performance

#### Deliverables
- Fully functional Git tab on mobile
- Touch-friendly interactions
- Responsive layout

---

### Phase 6: Testing & Polish (Est: 1 day)

**Goal**: Ensure reliability and good UX.

#### Tasks

- [ ] **6.1** Add unit tests for git store
  - Test state management logic

- [ ] **6.2** Add component tests
  - Test BranchSelector, DiffFileItem, etc.

- [ ] **6.3** Add E2E tests for Git workflows
  - Test branch creation, switching, committing

- [ ] **6.4** Accessibility audit
  - ARIA labels, keyboard navigation, screen reader testing

- [ ] **6.5** Performance optimization
  - Virtual scrolling for large diffs
  - Memoization where appropriate

- [ ] **6.6** Error handling improvements
  - User-friendly error messages
  - Retry mechanisms

#### Deliverables
- Test coverage for new features
- Accessibility compliance
- Performance benchmarks

---

## API Specifications

### Branch Types

```typescript
// Branch information
interface Branch {
  name: string;           // "main", "feature/auth"
  sha: string;            // Commit SHA the branch points to
  current: boolean;       // Is this the current branch?
  upstream?: string;      // Remote tracking branch (if any)
}

// Response for listing branches
interface BranchListResponse {
  branches: Branch[];
  current: string;        // Name of current branch
}

// Request for creating a branch
interface CreateBranchRequest {
  name: string;           // New branch name
  ref?: string;           // Base ref (default: HEAD)
}
```

### Diff Types

```typescript
// Summary of all changes
interface DiffResponse {
  summary: {
    added: number;        // Number of added files
    modified: number;     // Number of modified files
    deleted: number;      // Number of deleted files
  };
  files: FileDiffSummary[];
}

// Summary for a single file
interface FileDiffSummary {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;       // For renamed files
  additions: number;      // Lines added
  deletions: number;      // Lines removed
}

// Detailed diff for a single file
interface FileDiffResponse {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

// A chunk of changes
interface DiffHunk {
  header: string;         // "@@ -15,7 +15,10 @@"
  oldStart: number;       // Starting line in old file
  oldLines: number;       // Number of lines from old file
  newStart: number;       // Starting line in new file
  newLines: number;       // Number of lines in new file
  lines: DiffLine[];
}

// A single line in the diff
interface DiffLine {
  type: "context" | "add" | "delete";
  content: string;        // Line content (without +/- prefix)
  oldNumber?: number;     // Line number in old file
  newNumber?: number;     // Line number in new file
}
```

---

## Component Specifications

### Component Tree

```
src/lib/components/git/
├── index.ts                    # Re-exports all components
├── branch-selector.svelte      # Dropdown to switch branches
├── branch-list.svelte          # List of all branches  
├── branch-item.svelte          # Single branch with actions
├── create-branch-dialog.svelte # Modal for new branch
├── diff-viewer.svelte          # Main diff container
├── diff-file-list.svelte       # List of changed files
├── diff-file-item.svelte       # Expandable file with diff
├── diff-hunk.svelte            # Single diff chunk
├── diff-line.svelte            # Single diff line
├── diff-stats.svelte           # +N / -N indicator
├── commit-form.svelte          # Message input + button
└── commit-history.svelte       # List of commits
```

### Component Props

```typescript
// BranchSelector
interface BranchSelectorProps {
  sandboxId: string;
  currentBranch: string;
  branches: Branch[];
  disabled?: boolean;
  onSwitch: (branch: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
}

// DiffFileItem
interface DiffFileItemProps {
  file: FileDiffSummary;
  expanded: boolean;
  diff?: FileDiffResponse;
  loading?: boolean;
  onToggle: () => void;
  onLoadDiff: () => Promise<void>;
}

// DiffHunk
interface DiffHunkProps {
  hunk: DiffHunk;
  showLineNumbers?: boolean;
  syntaxHighlight?: boolean;
}

// DiffLine
interface DiffLineProps {
  line: DiffLine;
  showOldNumber?: boolean;
  showNewNumber?: boolean;
}
```

---

## Testing Strategy

### Unit Tests

- Git store state management
- Diff parsing utilities
- Branch name validation

### Component Tests

- BranchSelector renders correctly
- DiffFileItem expands/collapses
- DiffLine shows correct colors

### Integration Tests

- Branch creation flow
- Branch switching flow
- Commit with message flow

### E2E Tests

- Create branch → make changes → commit → switch back
- View diff → verify content matches

---

## Open Questions

### Resolved

1. **Q: Should switching branches with uncommitted changes be blocked?**  
   A: Show warning dialog, allow user to proceed or cancel.

2. **Q: How to handle merge conflicts?**  
   A: Out of scope for this implementation. Show error message with guidance.

### Pending

1. **Q: Should we cache diffs between component re-renders?**  
   Recommendation: Yes, in component state. Clear on manual refresh.

2. **Q: Maximum diff size before truncation?**  
   Recommendation: 500 lines per file, with "Show all" option.

3. **Q: Should syntax highlighting be enabled by default?**  
   Recommendation: Yes, with option to disable in settings.

---

## Dependencies

### External Packages (Already Available)

- `isomorphic-git` - Git operations in API
- `@lucide/svelte` - Icons
- `svelte-sonner` - Toast notifications

### Packages to Consider Adding

- `shiki` or `highlight.js` - Syntax highlighting for diffs
- `diff` - Diff parsing utilities (may implement custom)

---

## Timeline Estimate

| Phase | Description | Estimate |
|-------|-------------|----------|
| Phase 1 | API & Backend | 1 day |
| Phase 2 | Branch Management UI | 1-2 days |
| Phase 3 | Diff View - Basic | 2 days |
| Phase 4 | Diff View - Enhanced | 1-2 days |
| Phase 5 | Mobile Optimization | 1 day |
| Phase 6 | Testing & Polish | 1 day |
| **Total** | | **7-10 days** |

---

## References

- [Current Git Tab Implementation](../../apps/frontend/src/routes/projects/[id]/sync/+page.svelte)
- [Git Backend Types](../../apps/api/src/services/git/types.ts)
- [Git Backend Implementation](../../apps/api/src/services/git/filesystem.ts)
- [Repo Routes](../../apps/api/src/routes/repos.ts)
- [Tauri Commands](../../apps/frontend/src-tauri/src/commands/sandboxes.rs)
