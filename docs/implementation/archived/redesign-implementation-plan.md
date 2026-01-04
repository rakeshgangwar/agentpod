# Terminal/Cyberpunk UI Redesign Implementation Plan

## Overview

This document outlines the complete redesign of all frontend pages and components to match the Terminal/Cyberpunk design system established in `apps/frontend/src/app.css`.

**Design Philosophy:**
- Terminal-inspired aesthetic with futuristic cyberpunk elements
- Atmospheric backgrounds (noise, grid, mesh gradients)
- Neon accent colors (cyan, emerald, magenta, amber, red)
- Monospace typography with staggered animations
- Glassmorphic cards with glowing borders

**Core Fonts:**
- **Body/Code**: JetBrains Mono (monospace)
- **Headings**: Space Grotesk (display)

**Key Colors:**
- `--cyber-cyan`: Primary accent
- `--cyber-emerald`: Success/running states
- `--cyber-amber`: Warning/transitional states
- `--cyber-red`: Error/danger states
- `--cyber-magenta`: Secondary accent

---

## Phase 1: Foundation (Layout & Login)

### 1.1 Root Layout (`/+layout.svelte`)
**Lines:** 73 | **Complexity:** Medium

**Current State:**
- Basic app shell with auth guard
- Initializes theme, settings, auth, connection stores
- Renders Toaster for notifications

**Redesign Goals:**
- Keep all functionality intact (auth guard, initialization, Toaster)
- No visual changes needed (just a wrapper)
- Ensure Toaster styling matches design system

**Changes Required:**
- Minimal - Toaster already styled via app.css
- Verify theme initialization prevents FOUC

---

### 1.2 Login Page (`/login/+page.svelte`)
**Lines:** 283 | **Complexity:** High

**Current State:**
- Two-step flow (API setup → login)
- Card-based form layout
- Email/password + GitHub OAuth

**Redesign Goals:**
- Full atmospheric background (noise, grid, mesh)
- Cyber-styled form cards with corner accents
- Neon input focus states
- Animated page entrance
- Glitch hover on title
- Terminal-style labels

**Key Patterns to Apply:**
```svelte
<!-- Page structure -->
<div class="noise-overlay"></div>
<main class="min-h-screen grid-bg mesh-gradient flex items-center justify-center p-4">
  <div class="w-full max-w-md animate-fade-in-up">
    <div class="cyber-card corner-accent p-8">
      <!-- Form content -->
    </div>
  </div>
</main>

<!-- Input styling -->
<Input class="font-mono bg-background/50 border-border focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]" />

<!-- Button styling -->
<Button class="w-full font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black">
```

**Functionality to Preserve:**
- `step` derived state (setup/login)
- `authMode` toggle (signin/signup)
- `handleSetup()`, `handleGitHubLogin()`, `handleEmailSubmit()`
- Error handling and display
- Loading states
- Auto-redirect when authenticated

---

### 1.3 Root Page (`/+page.svelte`)
**Lines:** 31 | **Complexity:** Low

**Current State:**
- Loading spinner during redirect
- Connection check logic

**Redesign Goals:**
- Cyber-styled loading state
- Maintain redirect logic

**Changes:**
- Add noise overlay
- Style loading spinner with cyber colors
- Add subtle pulse animation

---

### 1.4 Setup Page (`/setup/+page.svelte`)
**Lines:** 14 | **Complexity:** Low

**Current State:**
- Simple redirect to /login

**Redesign Goals:**
- Match root page loading style
- Minimal changes needed

---

## Phase 2: Project Detail Flow

### 2.1 Project Layout (`/projects/[id]/+layout.svelte`)
**Lines:** 230 | **Complexity:** Medium

**Current State:**
- Header with project name, status badge, actions
- Tab navigation (Chat, Files, Logs, Terminal, Git, Settings)
- Start/Stop/Restart controls
- Restart confirmation dialog

**Redesign Goals:**
- Cyber-styled header with glitch hover on name
- Status indicators with pulse animations
- Terminal-style tab navigation
- Cyber-styled dialog

**Key Patterns:**
```svelte
<!-- Header -->
<header class="border-b border-border/30 bg-background/80 backdrop-blur-sm">
  <div class="container mx-auto px-4 py-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <h1 class="text-2xl font-bold glitch-hover" style="font-family: 'Space Grotesk'">
          {sandbox.name}
        </h1>
        <div class="status-indicator {getStatusClass(status)}">
          <span class="status-dot {status === 'running' ? 'animate-pulse-dot' : ''}"></span>
          <span>{status}</span>
        </div>
      </div>
    </div>
  </div>
</header>

<!-- Tabs -->
<div class="font-mono text-xs uppercase tracking-wider">
```

**Functionality to Preserve:**
- Sandbox lookup from store
- Tab navigation with URL sync
- Start/Stop/Restart handlers
- Dialog confirmation flow
- Loading/error states

---

### 2.2 Chat Page (`/projects/[id]/chat/+page.svelte`)
**Lines:** 840 | **Complexity:** Very High

**Current State:**
- Session sidebar with hierarchy (parent/child)
- Model/Agent selectors with keyboard shortcuts
- Onboarding banner integration
- File picker modal
- React chat components (RuntimeProvider, ChatThread)

**Redesign Goals:**
- Cyber-styled session sidebar
- Terminal-style session list
- Neon accent on active session
- Maintain all React component integration
- Update sidebar toggle button style

**Key Patterns:**
```svelte
<!-- Sidebar -->
<aside class="w-64 border-r border-border/30 bg-background/50 backdrop-blur-sm flex flex-col">
  <div class="p-4 border-b border-border/30">
    <Button class="w-full font-mono text-xs uppercase tracking-wider">
      <span class="mr-2">+</span> New Session
    </Button>
  </div>
  
  <!-- Session list -->
  <div class="flex-1 overflow-y-auto">
    {#each sessions as session, i}
      <button class="w-full text-left px-4 py-3 hover:bg-[var(--cyber-cyan)]/5 
                     {activeSession === session.id ? 'bg-[var(--cyber-cyan)]/10 border-l-2 border-[var(--cyber-cyan)]' : ''}
                     font-mono text-sm transition-colors">
        {session.name}
      </button>
    {/each}
  </div>
</aside>
```

**Functionality to Preserve:**
- Session CRUD operations
- Parent/child hierarchy display
- Keyboard shortcuts (Alt+,/., Cmd+,/.)
- Model/Agent detection callbacks
- File picker integration
- React component bridge (sveltify)
- SSE real-time updates

---

### 2.3 Files Page (`/projects/[id]/files/+page.svelte`)
**Lines:** 514 | **Complexity:** High

**Current State:**
- Two-panel layout (tree + content)
- Lazy-loaded folder contents
- Syntax highlighting via CodeBlock
- Markdown preview toggle
- Download/Copy actions

**Redesign Goals:**
- Cyber-styled file tree
- Terminal-style file icons
- Neon hover states
- Glassmorphic content panel
- Update action buttons

**Key Patterns:**
```svelte
<!-- File tree item -->
<button class="flex items-center gap-2 px-3 py-1.5 w-full text-left 
               hover:bg-[var(--cyber-cyan)]/5 font-mono text-sm
               {selected ? 'bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]' : ''}">
  <span class="text-muted-foreground">{icon}</span>
  <span>{name}</span>
</button>

<!-- Content panel -->
<div class="cyber-card flex-1 overflow-hidden">
  <div class="p-4 border-b border-border/30 flex items-center justify-between">
    <span class="font-mono text-sm text-muted-foreground">{path}</span>
    <div class="flex gap-2">
      <!-- Action buttons -->
    </div>
  </div>
  <div class="p-4 overflow-auto">
    <!-- CodeBlock or MarkdownViewer -->
  </div>
</div>
```

**Functionality to Preserve:**
- Lazy folder loading with cache
- Base64 decoding for content
- Binary file detection
- Markdown preview toggle
- Download functionality
- Use in Chat navigation

---

### 2.4 Terminal Page (`/projects/[id]/terminal/+page.svelte`)
**Lines:** 87 | **Complexity:** Low

**Current State:**
- TerminalTabs component wrapper
- Sandbox running check
- Listener initialization

**Redesign Goals:**
- Full-bleed terminal container
- Subtle grid background
- Update wrapper styling

**Changes:**
- Minimal - mostly styling the container
- TerminalTabs component handles most UI

**Functionality to Preserve:**
- Terminal listener initialization
- Sandbox running check
- Backend sync

---

### 2.5 Logs Page (`/projects/[id]/logs/+page.svelte`)
**Lines:** 163 | **Complexity:** Medium

**Current State:**
- Line count configuration
- Manual/auto refresh
- CodeBlock log display

**Redesign Goals:**
- Cyber-styled controls bar
- Terminal-style log display
- Neon refresh button
- Auto-refresh indicator

**Key Patterns:**
```svelte
<!-- Controls -->
<div class="cyber-card p-4 mb-4 flex items-center gap-4">
  <div class="flex items-center gap-2">
    <Label class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Lines:</Label>
    <Input type="number" class="w-20 h-8 font-mono text-sm" />
  </div>
  
  <div class="flex-1"></div>
  
  <div class="flex items-center gap-2">
    <Label class="font-mono text-xs">Auto-refresh</Label>
    <Switch />
  </div>
  
  <Button variant="ghost" class="font-mono text-xs uppercase">
    Refresh
  </Button>
</div>

<!-- Log display -->
<div class="cyber-card p-0 overflow-hidden">
  <CodeBlock code={logs} language="log" />
</div>
```

**Functionality to Preserve:**
- Auto-refresh with interval cleanup
- Line count validation
- Log fetching

---

### 2.6 Sync Page (`/projects/[id]/sync/+page.svelte`)
**Lines:** 309 | **Complexity:** Medium

**Current State:**
- Staged/unstaged file lists
- Commit form
- Commit history

**Redesign Goals:**
- Cyber-styled file status badges
- Terminal-style commit form
- Git log with cyber styling
- Color-coded status indicators

**Key Patterns:**
```svelte
<!-- File status badge -->
<span class="px-2 py-0.5 rounded font-mono text-xs uppercase
             {status === 'M' ? 'bg-[var(--cyber-amber)]/10 text-[var(--cyber-amber)]' : ''}
             {status === 'A' ? 'bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)]' : ''}
             {status === 'D' ? 'bg-[var(--cyber-red)]/10 text-[var(--cyber-red)]' : ''}">
  {status}
</span>

<!-- Commit form -->
<div class="cyber-card p-4">
  <Input placeholder="Commit message..." class="font-mono" />
  <Button class="mt-3 font-mono text-xs uppercase tracking-wider">
    Commit Changes
  </Button>
</div>
```

**Functionality to Preserve:**
- Staged/unstaged separation
- Git status codes
- Commit flow
- History display

---

### 2.7 Project Settings (`/projects/[id]/settings/+page.svelte`)
**Lines:** 318 | **Complexity:** Medium

**Current State:**
- Service URLs with actions
- Container status/stats
- Repository info
- Quick actions

**Redesign Goals:**
- Cyber-styled info cards
- Terminal-style URL display
- Stats with cyber colors
- Action buttons update

**Key Patterns:**
```svelte
<!-- Service URL row -->
<div class="flex items-center justify-between py-3 border-b border-border/20">
  <div class="flex-1">
    <span class="font-mono text-xs text-muted-foreground uppercase tracking-wider">Homepage</span>
    <p class="font-mono text-sm text-foreground mt-1">{url}</p>
  </div>
  <div class="flex gap-2">
    <Button size="sm" variant="ghost" class="font-mono text-xs">
      Open
    </Button>
  </div>
</div>

<!-- Stats grid -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
  <div class="cyber-card p-4 text-center">
    <span class="text-2xl font-bold text-[var(--cyber-cyan)]">{cpu}</span>
    <span class="block text-xs font-mono text-muted-foreground mt-1">CPU</span>
  </div>
</div>
```

**Functionality to Preserve:**
- Service URL display
- Window opening logic
- Stats formatting
- Repository info display

---

## Phase 3: Forms & Global Settings

### 3.1 New Project Page (`/projects/new/+page.svelte`)
**Lines:** 475 | **Complexity:** High

**Current State:**
- Tabbed creation (Scratch / GitHub)
- Flavor/Resource/Addon selectors
- Progress tracking with messages
- Health polling

**Redesign Goals:**
- Cyber-styled tab navigation
- Glassmorphic form cards
- Animated progress steps
- Terminal-style waiting messages

**Key Patterns:**
```svelte
<!-- Progress indicator -->
<div class="space-y-3">
  {#each progress as step, i}
    <div class="flex items-center gap-3 animate-fade-in-up stagger-{i+1}">
      <span class="w-6 h-6 rounded-full flex items-center justify-center
                   {step.done ? 'bg-[var(--cyber-emerald)]' : 'bg-muted animate-pulse'}">
        {#if step.done}✓{/if}
      </span>
      <span class="font-mono text-sm {step.done ? 'text-[var(--cyber-emerald)]' : 'text-muted-foreground'}">
        {step.label}
      </span>
    </div>
  {/each}
</div>

<!-- Waiting message -->
<div class="text-center py-8">
  <div class="font-mono text-lg text-[var(--cyber-cyan)] animate-pulse">
    {currentMessage}<span class="typing-cursor"></span>
  </div>
</div>
```

**Functionality to Preserve:**
- Tab-based creation flow
- Selector components integration
- Progress tracking
- Health polling logic
- Form validation

---

### 3.2 Global Settings (`/settings/+page.svelte`)
**Lines:** 1167 | **Complexity:** Very High

**Current State:**
- 5 tabs: Connection, Appearance, AI Models, OpenCode, About
- Multiple sub-forms and editors
- Import/Export functionality

**Redesign Goals:**
- Cyber-styled tab navigation
- Consistent form styling throughout
- Terminal-style code editors
- Update all sub-components used

**Key Patterns:**
```svelte
<!-- Tab list -->
<div class="flex gap-1 p-1 bg-muted/30 rounded-lg mb-6">
  {#each tabs as tab}
    <button class="flex-1 px-4 py-2 rounded font-mono text-xs uppercase tracking-wider
                   {active === tab.id ? 'bg-background text-[var(--cyber-cyan)]' : 'text-muted-foreground hover:text-foreground'}
                   transition-colors">
      {tab.label}
    </button>
  {/each}
</div>

<!-- Settings section -->
<div class="cyber-card p-6 space-y-6">
  <h3 class="font-bold text-lg" style="font-family: 'Space Grotesk'">
    Section Title
  </h3>
  <!-- Content -->
</div>
```

**Functionality to Preserve:**
- All 5 tab sections
- Permission management
- AGENTS.md editor
- Config file CRUD
- Theme picker integration
- LLM providers settings
- Import/Export/Reset

---

## Phase 4: Sub-Components

### 4.1 Terminal Components

#### `Terminal.svelte` (224 lines)
**Redesign Goals:**
- Connect theme to CSS variables (currently hardcoded Catppuccin)
- Update container styling

#### `TerminalTabs.svelte` (309 lines)
**Redesign Goals:**
- Cyber-styled tab bar
- Neon active tab indicator
- Update empty/error states
- Convert scoped CSS to Tailwind

---

### 4.2 Selector Components

#### `resource-tier-selector.svelte` (159 lines)
#### `flavor-selector.svelte` (173 lines)
#### `addon-selector.svelte` (203 lines)

**Common Redesign Goals:**
- Cyber-styled selection cards
- Neon border on selected
- Terminal-style labels
- Consistent loading/error states

---

### 4.3 Chat Selectors

#### `model-selector.svelte` (173 lines)
#### `agent-selector.svelte` (174 lines)

**Redesign Goals:**
- Cyber-styled dropdown
- Terminal-style items
- Maintain compact mode

---

### 4.4 Settings Components

#### `llm-providers-settings.svelte` (526 lines)
**Redesign Goals:**
- Cyber-styled provider cards
- Terminal-style search
- Update modal styling

#### `theme-picker.svelte` (172 lines)
**Redesign Goals:**
- Cyber-styled mode selector
- Update theme grid cards

---

### 4.5 Other Components

#### `onboarding-banner.svelte` (246 lines)
**Redesign Goals:**
- Cyber-styled banner states
- Terminal-style progress

#### `file-picker-modal.svelte` (313 lines)
**Redesign Goals:**
- Cyber-styled modal
- Terminal-style file tree
- Update search input

---

## Phase 5: React Chat Components

### 5.1 RuntimeProvider.tsx (1,038 lines)
**Redesign Goals:**
- Update error banner styling
- Cyber colors for states

### 5.2 ChatThread.tsx (881 lines)
**Redesign Goals:**
- Cyber-styled message bubbles
- Terminal-style tool call display
- Update composer styling
- Neon accent colors

### 5.3 PermissionBar.tsx (340 lines)
**Redesign Goals:**
- Cyber-styled permission bar
- Terminal-style buttons

### 5.4 FileAttachment.tsx (279 lines)
**Redesign Goals:**
- Cyber-styled attachment preview
- Update icon button

### 5.5 FilePicker.tsx (201 lines)
### 5.6 CommandPicker.tsx (154 lines)
**Redesign Goals:**
- Cyber-styled dropdown
- Terminal-style items

---

## Implementation Guidelines

### DO:
- Use Tailwind utility classes inline
- Apply design system CSS classes (`cyber-card`, `status-indicator`, etc.)
- Maintain all existing functionality
- Preserve component props and exports
- Keep mobile responsiveness
- Test each change doesn't break functionality

### DON'T:
- Create new component variants in shadcn
- Remove or modify existing logic
- Change component APIs
- Break keyboard navigation
- Remove accessibility attributes
- Introduce new dependencies

### Testing Each Phase:
```bash
# Type check
cd apps/frontend && pnpm exec svelte-check --output human

# Run dev server
cd apps/frontend && pnpm dev

# Run full Tauri app
cd apps/frontend && pnpm tauri dev
```

---

## Progress Tracking

| Phase | Component | Status | Notes |
|-------|-----------|--------|-------|
| 1 | +layout.svelte | ✅ Complete | Toaster styled via app.css |
| 1 | login/+page.svelte | ✅ Complete | Full atmospheric background, cyber-styled forms |
| 1 | +page.svelte | ✅ Complete | Cyber-styled loading state |
| 1 | setup/+page.svelte | ✅ Complete | Matches root page loading style |
| 2 | projects/[id]/+layout.svelte | ✅ Complete | Cyber header, status indicators, tab navigation |
| 2 | projects/[id]/chat/+page.svelte | ✅ Complete | Cyber-styled session sidebar, selectors |
| 2 | projects/[id]/files/+page.svelte | ✅ Complete | Cyber file tree, glassmorphic content panel |
| 2 | projects/[id]/terminal/+page.svelte | ✅ Complete | Full-bleed container with grid background |
| 2 | projects/[id]/logs/+page.svelte | ✅ Complete | Cyber controls bar, terminal-style display |
| 2 | projects/[id]/sync/+page.svelte | ✅ Complete | Color-coded status badges, cyber commit form |
| 2 | projects/[id]/settings/+page.svelte | ✅ Complete | Cyber info cards, stats with cyber colors |
| 3 | projects/new/+page.svelte | ✅ Complete | Animated progress steps, terminal-style messages |
| 3 | settings/+page.svelte | ✅ Complete | All 5 tabs redesigned with cyber styling |
| 4 | Terminal components | ✅ Complete | TerminalTabs with cyber tab bar |
| 4 | Selector components | ✅ Complete | All selectors with neon borders on selection |
| 4 | Settings components | ✅ Complete | LLM providers, theme picker redesigned |
| 4 | Other components | ✅ Complete | Onboarding banner, file picker modal |
| 5 | React chat components | ✅ Complete | All 6 components with cyber styling |

---

## Reference Files

- **Design System**: `apps/frontend/src/app.css`
- **Reference Implementation**: `apps/frontend/src/routes/projects/+page.svelte`
- **Font Imports**: `apps/frontend/src/app.html`
