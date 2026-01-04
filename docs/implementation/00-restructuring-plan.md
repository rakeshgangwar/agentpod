# Documentation Restructuring Plan

> **Created:** January 4, 2026  
> **Status:** In Progress  
> **Purpose:** Consolidate v1/v2 documentation, remove version confusion, establish single source of truth

## Executive Summary

This plan consolidates the fragmented v1/v2 documentation structure into a unified, maintainable hierarchy. The vision folder will be symlinked to the external `The-Agentic-Space` repository.

### Key Changes

| Before | After |
|--------|-------|
| `docs/v1/` (44 files) | Archived or merged into `docs/implementation/` |
| `docs/v2/` (16 files) | Merged into `docs/architecture/` and `docs/implementation/` |
| `docs/vision/` (125 files) | Symlinked to external repo `The-Agentic-Space` |
| Scattered architecture docs | Consolidated in `docs/architecture/` |
| Feature docs in phases | Moved to `docs/features/` |

---

## New Documentation Structure

```
docs/
├── README.md                          # Master index (rewritten)
├── ROADMAP.md                         # Project status & timeline
│
├── getting-started/                   # User-facing guides
│   ├── README.md
│   ├── quick-start.md
│   ├── self-hosting.md
│   └── configuration.md
│
├── architecture/                      # System design (consolidated)
│   ├── README.md
│   ├── system-overview.md             # Merged from technical-architecture.md
│   ├── acp-protocol.md                # From v2/
│   ├── authentication.md              # From v2/
│   ├── session-persistence.md         # From v2/
│   ├── cloudflare-integration.md      # From v1/
│   ├── modular-containers.md          # From v2/
│   └── monorepo-structure.md
│
├── implementation/                    # Build status & tasks
│   ├── README.md
│   ├── 00-restructuring-plan.md       # THIS FILE
│   ├── current-features.md            # What's implemented
│   ├── pending-work.md                # What's remaining
│   └── archived/                      # Historical reference
│       ├── README.md
│       ├── v1-infrastructure/         # Coolify/Forgejo docs
│       ├── opencode-sdk-analysis.md
│       └── completed-migrations/
│
├── features/                          # Independent feature docs
│   ├── README.md
│   ├── workflow-builder/
│   ├── agent-management/
│   ├── admin-panel/
│   └── web-preview/
│
├── agents/                            # KEEP AS-IS
├── design/                            # Consolidated from ui-ux/
├── operations/                        # Renamed from production-readiness/
├── testing/                           # KEEP AS-IS
├── onboarding-system/                 # KEEP AS-IS
├── research/                          # KEEP AS-IS
├── ideas/                             # KEEP AS-IS
│
└── vision/ -> ../The-Agentic-Space    # SYMLINK to external repo
```

---

## Execution Steps

### Phase 1: Setup (Prerequisites)

#### Step 1.1: Clone The-Agentic-Space Repository

```bash
# Clone the private repo using GitHub CLI (handles auth automatically)
cd /Users/rakeshgangwar/Projects
gh repo clone rakeshgangwar/The-Agentic-Space

# Verify clone succeeded
ls -la The-Agentic-Space/
```

#### Step 1.2: Create New Directory Structure

```bash
cd /Users/rakeshgangwar/Projects/agentpod

# Create new directories
mkdir -p docs/implementation/archived
mkdir -p docs/features/{workflow-builder,agent-management,admin-panel,web-preview}
mkdir -p docs/getting-started
mkdir -p docs/design/mockups
```

---

### Phase 2: Vision Folder Symlink

#### Step 2.1: Fix Broken References First

Before removing vision folder, fix these broken links:

**File: `docs/README.md`**
- Change: `./reference/agentic-space/` → `./vision/`

**File: `docs/v1/agent-management-redesign.md`**
- Change: `../reference/agentic-space/` → `../vision/`

#### Step 2.2: Create Symlink

```bash
# Remove current vision folder
rm -rf docs/vision

# Create symlink to external repo (relative path for portability)
ln -s ../../The-Agentic-Space docs/vision

# Verify symlink works
ls -la docs/vision/
```

#### Step 2.3: Update .gitignore (Optional)

If you don't want to track the symlink in git:
```bash
echo "docs/vision" >> .gitignore
```

Or add a note in README about cloning The-Agentic-Space repo.

---

### Phase 3: Archive Obsolete v1 Content

These files describe removed technologies (Coolify/Keycloak/Forgejo):

```bash
# Move v1 infrastructure (obsolete)
mv docs/v1/phase-1-infrastructure docs/implementation/archived/v1-infrastructure

# Move obsolete SDK docs
mv docs/v1/opencode-sdk-analysis.md docs/implementation/archived/
mv docs/v1/opencode-config-architecture.md docs/implementation/archived/

# Move completed/superseded plans
mv docs/v1/chat-ui-refactoring-plan.md docs/implementation/archived/
mv docs/ui-ux/06-implementation-plan.md docs/implementation/archived/
mv docs/ui-ux/redesign-implementation-plan.md docs/implementation/archived/
```

---

### Phase 4: Consolidate Architecture Docs

#### Step 4.1: Move v2 Architecture Docs

```bash
# Move v2 architecture docs to docs/architecture/
mv docs/v2/acp-protocol.md docs/architecture/
mv docs/v2/authentication.md docs/architecture/
mv docs/v2/session-persistence.md docs/architecture/
mv docs/v2/modular-containers.md docs/architecture/

# Move cloudflare guide
mv docs/v1/cloudflare-implementation-guide.md docs/architecture/cloudflare-integration.md
```

#### Step 4.2: Create Consolidated System Overview

Merge these files into `docs/architecture/system-overview.md`:
- `docs/technical-architecture.md` (remove Coolify/Keycloak/Forgejo refs)
- `docs/portable-command-center.md`
- `docs/v2/architecture.md`

**Important:** Remove all references to:
- Coolify (replaced by direct Docker API)
- Keycloak (replaced by Better Auth)
- Forgejo (replaced by filesystem Git)

---

### Phase 5: Move Feature Docs

```bash
# Workflow Builder
mv docs/v1/workflow-builder-plan.md docs/features/workflow-builder/README.md
mv docs/v1/workflow-ai-integration.md docs/features/workflow-builder/ai-integration.md
mv docs/v1/workflow-nodes-catalog.md docs/features/workflow-builder/nodes-catalog.md

# Agent Management
mv docs/v1/agent-management-redesign.md docs/features/agent-management/README.md

# Admin Panel
mv docs/v1/admin-functionality.md docs/features/admin-panel/README.md

# Web Preview
# Create README from existing web-preview docs if they exist
```

---

### Phase 6: Consolidate Design Docs

```bash
# Move root design doc
mv docs/design-language.md docs/design/

# Move UI/UX docs (keep the valuable ones)
mv docs/ui-ux/10-component-specifications.md docs/design/component-specifications.md
mv docs/ui-ux/12-responsive-design-plan.md docs/design/responsive-design.md
mv docs/ui-ux/mockups docs/design/

# Merge user journey docs (manual step)
# Combine: user-journey.md + ui-ux/09-user-journey-paths.md → design/user-journeys.md

# Merge agentic UX docs (manual step)
# Combine: ui-ux/02-agentic-ux-analysis.md + ui-ux/08-shape-of-ai-patterns.md → design/agentic-ux-patterns.md
```

---

### Phase 7: Rename & Reorganize

```bash
# Rename production-readiness to operations
mv docs/production-readiness docs/operations

# Move guides to getting-started
mv docs/guides/* docs/getting-started/
rmdir docs/guides
```

---

### Phase 8: Cleanup Old Folders

**Only after all content is migrated:**

```bash
# Remove empty v1 folder (verify nothing valuable remains first)
rm -rf docs/v1

# Remove empty v2 folder
rm -rf docs/v2

# Remove old ui-ux folder
rm -rf docs/ui-ux

# Remove old root docs that were merged
rm docs/technical-architecture.md
rm docs/portable-command-center.md
rm docs/user-journey.md
```

---

### Phase 9: Update Navigation

#### Step 9.1: Rewrite docs/README.md

Create new master index with updated navigation pointing to new structure.

#### Step 9.2: Create docs/ROADMAP.md

Add project status and timeline document.

#### Step 9.3: Add Cross-References

Update all remaining docs to reference the new paths.

---

## File Migration Map

### From v1/ → New Location

| Source | Destination | Action |
|--------|-------------|--------|
| `v1/README.md` | DELETE | Replaced by implementation/README.md |
| `v1/phase-1-infrastructure/*` | `implementation/archived/v1-infrastructure/` | ARCHIVE |
| `v1/phase-2-management-api/*` | `implementation/archived/` | ARCHIVE (concepts in architecture/) |
| `v1/phase-3-mobile-foundation/*` | `implementation/archived/` | ARCHIVE |
| `v1/phase-4-mobile-core/*` | `implementation/archived/` | ARCHIVE |
| `v1/phase-5-mobile-advanced/*` | `implementation/archived/` | ARCHIVE |
| `v1/phase-6-polish/*` | `implementation/archived/` | ARCHIVE |
| `v1/workflow-*.md` | `features/workflow-builder/` | MOVE |
| `v1/agent-management-redesign.md` | `features/agent-management/` | MOVE |
| `v1/admin-functionality.md` | `features/admin-panel/` | MOVE |
| `v1/cloudflare-implementation-guide.md` | `architecture/cloudflare-integration.md` | MOVE |
| `v1/opencode-*.md` | `implementation/archived/` | ARCHIVE |
| `v1/autonomous-agentpod-poc.md` | `research/` | MOVE |
| `v1/archived/*` | `implementation/archived/` | MOVE |

### From v2/ → New Location

| Source | Destination | Action |
|--------|-------------|--------|
| `v2/README.md` | DELETE | Replaced by implementation/README.md |
| `v2/architecture.md` | `architecture/system-overview.md` | MERGE |
| `v2/acp-protocol.md` | `architecture/` | MOVE |
| `v2/authentication.md` | `architecture/` | MOVE |
| `v2/session-persistence.md` | `architecture/` | MOVE |
| `v2/modular-containers.md` | `architecture/` | MOVE |
| `v2/phase-*/*` | `implementation/archived/` | ARCHIVE (pending work extracted) |
| `v2/deferred-v1-tasks/*` | `implementation/pending-work.md` | CONSOLIDATE |

### From ui-ux/ → New Location

| Source | Destination | Action |
|--------|-------------|--------|
| `ui-ux/README.md` | `design/README.md` | REWRITE |
| `ui-ux/02-agentic-ux-analysis.md` | `design/agentic-ux-patterns.md` | MERGE |
| `ui-ux/08-shape-of-ai-patterns.md` | `design/agentic-ux-patterns.md` | MERGE |
| `ui-ux/09-user-journey-paths.md` | `design/user-journeys.md` | MERGE |
| `ui-ux/10-component-specifications.md` | `design/` | MOVE |
| `ui-ux/12-responsive-design-plan.md` | `design/` | MOVE |
| `ui-ux/mockups/*` | `design/mockups/` | MOVE |
| `ui-ux/06-implementation-plan.md` | `implementation/archived/` | ARCHIVE |
| `ui-ux/redesign-implementation-plan.md` | `implementation/archived/` | ARCHIVE |

---

## Verification Checklist

After restructuring, verify:

- [ ] `docs/vision/` symlink works and shows The-Agentic-Space content
- [ ] All internal links in remaining docs are valid
- [ ] No references to Coolify/Keycloak/Forgejo in active docs
- [ ] `docs/README.md` navigation works
- [ ] `docs/architecture/` contains all system design docs
- [ ] `docs/implementation/current-features.md` exists
- [ ] `docs/implementation/pending-work.md` exists
- [ ] Old v1/, v2/, ui-ux/ folders are removed
- [ ] `docs/agents/` is unchanged and functional
- [ ] `docs/testing/` is unchanged and functional

---

## Rollback Plan

If something goes wrong:

```bash
# Git will track all changes - easy to revert
git checkout -- docs/

# Or restore specific files
git checkout HEAD -- docs/v1/
git checkout HEAD -- docs/v2/
```

---

## Timeline

| Day | Tasks |
|-----|-------|
| **Day 1** | Phase 1-2: Setup, clone repo, create symlink |
| **Day 2** | Phase 3-5: Archive obsolete, consolidate architecture, move features |
| **Day 3** | Phase 6-7: Consolidate design, rename folders |
| **Day 4** | Phase 8-9: Cleanup, update navigation |
| **Day 5** | Verification and final review |

---

## Related Documents

- [Current Features](./current-features.md) - What's implemented in the codebase
- [Pending Work](./pending-work.md) - What remains to be done
- [Architecture Overview](../architecture/README.md) - System design (after restructuring)
