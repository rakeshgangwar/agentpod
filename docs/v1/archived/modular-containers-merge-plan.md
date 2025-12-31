# Modular Containers Merge Plan

This document outlines the plan to merge the `feature/modular-containers` branch into our `refactor/agentpod-monorepo` structure, replacing the monolithic `opencode-cli` and `opencode-desktop` images.

## Overview

**Source Branch:** `origin/feature/modular-containers`
**Target Branch:** `refactor/agentpod-monorepo`
**Estimated Effort:** 2-3 days

### Goals

1. Replace monolithic containers (`opencode-cli`, `opencode-desktop`) with modular system
2. Integrate ACP Gateway for multi-agent support
3. Add resource tiers, flavors, and addons to the API
4. Maintain backward compatibility during transition
5. Update CI/CD pipeline for modular builds

---

## Current State Comparison

### Directory Structure

| Current (monorepo) | Modular Branch | Target |
|--------------------|----------------|--------|
| `docker/containers/cli/` | `docker/agentpod-base/` | `docker/base/` |
| `docker/containers/desktop/` | `docker/flavors/*` | `docker/flavors/*` |
| - | `docker/addons/*` | `docker/addons/*` |
| `docker/scripts/` | `docker/scripts/` | `docker/scripts/` |

### API Models

| Current | Modular Branch | Action |
|---------|----------------|--------|
| `container-tier.ts` (4 tiers) | `resource-tier.ts` (4 tiers) | Replace |
| - | `container-flavor.ts` | Add |
| - | `container-addon.ts` | Add |
| - | `image-resolver.ts` | Add |

---

## Phase 1: Prepare Docker Structure (Day 1 Morning)

### 1.1 Backup Current Containers

```bash
# Create backup branch
git checkout refactor/agentpod-monorepo
git checkout -b backup/pre-modular-containers
git push origin backup/pre-modular-containers
git checkout refactor/agentpod-monorepo
```

### 1.2 Remove Old Container Directories

```bash
rm -rf docker/containers/cli
rm -rf docker/containers/desktop
```

### 1.3 Copy Modular Docker Structure

Extract from `feature/modular-containers`:

```bash
# Base image
git show origin/feature/modular-containers:docker/agentpod-base/Dockerfile > docker/base/Dockerfile
git show origin/feature/modular-containers:docker/agentpod-base/README.md > docker/base/README.md
git show origin/feature/modular-containers:docker/agentpod-base/entrypoint.sh > docker/base/entrypoint.sh

# Copy scripts
mkdir -p docker/base/scripts
git show origin/feature/modular-containers:docker/agentpod-base/scripts/common-setup.sh > docker/base/scripts/common-setup.sh

# Copy ACP Gateway
mkdir -p docker/base/acp-gateway/src
# ... copy all acp-gateway files
```

### 1.4 Final Docker Structure

```
docker/
├── base/                          # agentpod-base image
│   ├── Dockerfile
│   ├── README.md
│   ├── entrypoint.sh
│   ├── scripts/
│   │   └── common-setup.sh
│   └── acp-gateway/               # Multi-agent gateway
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── acp-client.ts
│           ├── agent-manager.ts
│           ├── agent-registry.ts
│           ├── auth-handler.ts
│           ├── event-emitter.ts
│           ├── file-handler.ts
│           ├── session-manager.ts
│           └── types.ts
├── flavors/                       # Language-specific images
│   ├── js/
│   │   ├── Dockerfile
│   │   └── README.md
│   ├── python/
│   │   ├── Dockerfile
│   │   └── README.md
│   ├── go/
│   │   ├── Dockerfile
│   │   └── README.md
│   ├── rust/
│   │   ├── Dockerfile
│   │   └── README.md
│   ├── fullstack/
│   │   ├── Dockerfile
│   │   └── README.md
│   └── polyglot/
│       ├── Dockerfile
│       └── README.md
├── addons/                        # Optional feature images
│   ├── gui/
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── entrypoint-addon.sh
│   │   └── config/
│   │       ├── kasmvnc.yaml
│   │       ├── supervisord.conf
│   │       ├── openbox/
│   │       │   ├── autostart
│   │       │   ├── menu.xml
│   │       │   └── rc.xml
│   │       └── tint2/
│   │           └── tint2rc
│   ├── code-server/
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   └── entrypoint-addon.sh
│   ├── databases/
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── entrypoint-addon.sh
│   │   └── config/
│   │       └── supervisord-databases.conf
│   ├── cloud/
│   │   ├── Dockerfile
│   │   └── README.md
│   └── gpu/
│       ├── Dockerfile
│       └── README.md
├── scripts/
│   ├── build.sh                   # Updated for modular
│   ├── build-base.sh
│   ├── build-flavor.sh
│   ├── build-addon.sh
│   ├── push.sh
│   ├── login.sh
│   ├── config.sh
│   └── test-container.sh
├── README.md                      # Updated documentation
└── VERSION
```

---

## Phase 2: Add API Models (Day 1 Afternoon)

### 2.1 Create Resource Tier Model

**File:** `apps/api/src/models/resource-tier.ts`

```typescript
/**
 * Resource Tier Model
 * Replaces container-tier.ts with more granular resource allocation
 */

export interface ResourceTier {
  id: string;                    // 'starter', 'builder', 'creator', 'power'
  name: string;
  description: string | null;
  cpuCores: number;
  memoryGb: number;
  storageGb: number;
  priceMonthly: number;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// CRUD operations...
```

### 2.2 Create Container Flavor Model

**File:** `apps/api/src/models/container-flavor.ts`

```typescript
/**
 * Container Flavor Model
 * Language/framework-specific container images
 */

export interface ContainerFlavor {
  id: string;                    // 'js', 'python', 'go', 'rust', 'fullstack', 'polyglot'
  name: string;
  description: string | null;
  languages: string[];
  imageSizeMb: number | null;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// CRUD operations...
```

### 2.3 Create Container Addon Model

**File:** `apps/api/src/models/container-addon.ts`

```typescript
/**
 * Container Addon Model
 * Optional features that can be added to containers
 */

export type AddonCategory = 'interface' | 'compute' | 'storage' | 'devops';

export interface ContainerAddon {
  id: string;                    // 'gui', 'code-server', 'gpu', 'databases', 'cloud'
  name: string;
  description: string | null;
  category: AddonCategory;
  imageSizeMb: number | null;
  port: number | null;
  requiresGpu: boolean;
  requiresFlavor: string | null;
  priceMonthly: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// CRUD operations...
```

### 2.4 Create Image Resolver Service

**File:** `apps/api/src/services/image-resolver.ts`

```typescript
/**
 * Image Resolution Service
 * Resolves flavor + addons to Docker image name
 */

export interface ImageResolution {
  imageName: string;
  imageTag: string;
  imageRef: string;
  flavor: ContainerFlavor;
  addons: ContainerAddon[];
  resourceTier: ResourceTier;
  resourceLimits: { limits_memory: string; limits_cpus: string; };
  exposedPorts: number[];
  portsExposes: string;
  requiresGpu: boolean;
  warnings: string[];
}

export function resolveImage(options: ResolveImageOptions): ImageResolution;
export function validateContainerConfig(options: ResolveImageOptions): ValidationResult;
export function generateProjectUrls(slug: string, addons: ContainerAddon[]): ProjectUrls;
```

### 2.5 Update Models Index

**File:** `apps/api/src/models/index.ts` (if exists, or create)

```typescript
export * from './project.ts';
export * from './provider.ts';
export * from './provider-credentials.ts';
export * from './resource-tier.ts';
export * from './container-flavor.ts';
export * from './container-addon.ts';
```

---

## Phase 3: Database Migration (Day 1 Evening)

### 3.1 Create Migration File

**File:** `apps/api/src/db/migrations/003_modular_containers.ts`

```typescript
import { Database } from 'bun:sqlite';

export function up(db: Database) {
  // Resource Tiers table
  db.run(`
    CREATE TABLE IF NOT EXISTS resource_tiers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cpu_cores INTEGER NOT NULL,
      memory_gb INTEGER NOT NULL,
      storage_gb INTEGER NOT NULL,
      price_monthly REAL NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Container Flavors table
  db.run(`
    CREATE TABLE IF NOT EXISTS container_flavors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      languages TEXT NOT NULL DEFAULT '[]',
      image_size_mb INTEGER,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Container Addons table
  db.run(`
    CREATE TABLE IF NOT EXISTS container_addons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      image_size_mb INTEGER,
      port INTEGER,
      requires_gpu INTEGER NOT NULL DEFAULT 0,
      requires_flavor TEXT,
      price_monthly REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add new columns to projects table
  db.run(`ALTER TABLE projects ADD COLUMN resource_tier_id TEXT DEFAULT 'starter'`);
  db.run(`ALTER TABLE projects ADD COLUMN flavor_id TEXT DEFAULT 'fullstack'`);
  db.run(`ALTER TABLE projects ADD COLUMN addon_ids TEXT DEFAULT '[]'`);

  // Seed resource tiers
  db.run(`
    INSERT INTO resource_tiers (id, name, description, cpu_cores, memory_gb, storage_gb, price_monthly, is_default, sort_order) VALUES
    ('starter', 'Starter', 'Perfect for learning and small projects', 1, 2, 20, 0, 1, 1),
    ('builder', 'Builder', 'For active development and medium projects', 2, 4, 30, 10, 0, 2),
    ('creator', 'Creator', 'For professional development and larger projects', 4, 8, 50, 25, 0, 3),
    ('power', 'Power', 'Maximum resources for demanding workloads', 8, 16, 100, 50, 0, 4)
  `);

  // Seed container flavors
  db.run(`
    INSERT INTO container_flavors (id, name, description, languages, image_size_mb, is_default, sort_order) VALUES
    ('js', 'JavaScript', 'JavaScript and TypeScript development', '["javascript","typescript"]', 800, 0, 1),
    ('python', 'Python', 'Python development with data science tools', '["python"]', 900, 0, 2),
    ('go', 'Go', 'Go development environment', '["go"]', 700, 0, 3),
    ('rust', 'Rust', 'Rust development environment', '["rust"]', 1200, 0, 4),
    ('fullstack', 'Fullstack', 'JavaScript + Python for full-stack development', '["javascript","typescript","python"]', 1100, 1, 5),
    ('polyglot', 'Polyglot', 'All languages for maximum flexibility', '["javascript","typescript","python","go","rust"]', 2000, 0, 6)
  `);

  // Seed container addons
  db.run(`
    INSERT INTO container_addons (id, name, description, category, image_size_mb, port, requires_gpu, price_monthly, sort_order) VALUES
    ('gui', 'Desktop GUI', 'Full desktop environment via KasmVNC', 'interface', 800, 6080, 0, 5, 1),
    ('code-server', 'VS Code', 'VS Code in browser via code-server', 'interface', 200, 8080, 0, 0, 2),
    ('databases', 'Databases', 'PostgreSQL, Redis, and SQLite', 'storage', 500, NULL, 0, 5, 3),
    ('cloud', 'Cloud Tools', 'AWS CLI, gcloud, Terraform, kubectl', 'devops', 400, NULL, 0, 0, 4),
    ('gpu', 'GPU Support', 'NVIDIA CUDA toolkit for ML/AI workloads', 'compute', 2000, NULL, 1, 20, 5)
  `);

  // Migrate existing projects from containerTierId to new fields
  // Map old tiers to new resource tiers + flavors
  db.run(`
    UPDATE projects SET 
      resource_tier_id = CASE container_tier_id
        WHEN 'lite' THEN 'starter'
        WHEN 'standard' THEN 'builder'
        WHEN 'pro' THEN 'creator'
        WHEN 'desktop' THEN 'creator'
        ELSE 'starter'
      END,
      flavor_id = 'fullstack',
      addon_ids = CASE container_tier_id
        WHEN 'desktop' THEN '["gui","code-server"]'
        ELSE '["code-server"]'
      END
  `);
}

export function down(db: Database) {
  db.run(`DROP TABLE IF EXISTS resource_tiers`);
  db.run(`DROP TABLE IF EXISTS container_flavors`);
  db.run(`DROP TABLE IF EXISTS container_addons`);
  // Note: Can't easily remove columns in SQLite
}
```

---

## Phase 4: Update API Routes (Day 2 Morning)

### 4.1 Create Resource Tiers Route

**File:** `apps/api/src/routes/resource-tiers.ts`

```typescript
import { Hono } from 'hono';
import { getAllResourceTiers, getResourceTierById } from '../models/resource-tier.ts';

const app = new Hono();

// GET /api/resource-tiers
app.get('/', (c) => {
  const tiers = getAllResourceTiers();
  return c.json({ tiers });
});

// GET /api/resource-tiers/:id
app.get('/:id', (c) => {
  const tier = getResourceTierById(c.req.param('id'));
  if (!tier) {
    return c.json({ error: 'Resource tier not found' }, 404);
  }
  return c.json({ tier });
});

export default app;
```

### 4.2 Create Flavors Route

**File:** `apps/api/src/routes/flavors.ts`

```typescript
import { Hono } from 'hono';
import { getAllFlavors, getFlavorById } from '../models/container-flavor.ts';

const app = new Hono();

// GET /api/flavors
app.get('/', (c) => {
  const flavors = getAllFlavors();
  return c.json({ flavors });
});

// GET /api/flavors/:id
app.get('/:id', (c) => {
  const flavor = getFlavorById(c.req.param('id'));
  if (!flavor) {
    return c.json({ error: 'Flavor not found' }, 404);
  }
  return c.json({ flavor });
});

export default app;
```

### 4.3 Create Addons Route

**File:** `apps/api/src/routes/addons.ts`

```typescript
import { Hono } from 'hono';
import { getAllAddons, getAddonById, getAddonsByCategory } from '../models/container-addon.ts';

const app = new Hono();

// GET /api/addons
app.get('/', (c) => {
  const category = c.req.query('category');
  const addons = category 
    ? getAddonsByCategory(category as any)
    : getAllAddons();
  return c.json({ addons });
});

// GET /api/addons/:id
app.get('/:id', (c) => {
  const addon = getAddonById(c.req.param('id'));
  if (!addon) {
    return c.json({ error: 'Addon not found' }, 404);
  }
  return c.json({ addon });
});

export default app;
```

### 4.4 Update Main Router

**File:** `apps/api/src/index.ts`

```typescript
// Add new routes
import resourceTiersRoutes from './routes/resource-tiers.ts';
import flavorsRoutes from './routes/flavors.ts';
import addonsRoutes from './routes/addons.ts';

// Mount routes
app.route('/api/resource-tiers', resourceTiersRoutes);
app.route('/api/flavors', flavorsRoutes);
app.route('/api/addons', addonsRoutes);
```

---

## Phase 5: Update Project Manager (Day 2 Afternoon)

### 5.1 Update Project Model

**File:** `apps/api/src/models/project.ts`

Add new fields:

```typescript
export interface Project {
  // ... existing fields
  
  // Legacy field (deprecated, kept for backward compatibility)
  containerTierId: string | null;
  
  // New modular fields
  resourceTierId: string;
  flavorId: string;
  addonIds: string[];
}
```

### 5.2 Update Project Manager Service

**File:** `apps/api/src/services/project-manager.ts`

```typescript
import { resolveImage, generateProjectUrls } from './image-resolver.ts';

export async function createProject(input: CreateProjectInput) {
  // Resolve container configuration
  const resolution = resolveImage({
    resourceTierId: input.resourceTierId || 'starter',
    flavorId: input.flavorId || 'fullstack',
    addonIds: input.addonIds || ['code-server'],
  });

  // Generate URLs based on addons
  const urls = generateProjectUrls(projectSlug, resolution.addons);

  // Create Coolify app with resolved image
  const coolifyApp = await coolify.createDockerImageApp(
    config.coolify.projectUuid,
    config.coolify.serverUuid,
    {
      name: projectSlug,
      image: resolution.imageRef,
      instant_deploy: false,
    }
  );

  // Update with resource limits and ports
  await coolify.updateApplication(coolifyApp.uuid, {
    ports_exposes: resolution.portsExposes,
    domains: urls.domainsConfig,
    ...resolution.resourceLimits,
    health_check_enabled: false,
  });

  // ... rest of project creation
}
```

### 5.3 Update Projects Route

**File:** `apps/api/src/routes/projects.ts`

Update create endpoint to accept new fields:

```typescript
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sourceUrl: z.string().url().optional(),
  
  // New modular fields
  resourceTierId: z.string().optional().default('starter'),
  flavorId: z.string().optional().default('fullstack'),
  addonIds: z.array(z.string()).optional().default(['code-server']),
  
  // Legacy field (deprecated)
  containerTierId: z.string().optional(),
});
```

---

## Phase 6: Update CI/CD Pipeline (Day 2 Evening)

### 6.1 Update Build Workflow

**File:** `.forgejo/workflows/build-containers.yml`

```yaml
name: Build Container Images

on:
  push:
    branches: [main]
    paths:
      - 'docker/**'
  workflow_dispatch:
    inputs:
      target:
        description: 'Build target'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - base
          - flavors
          - addons

jobs:
  build-base:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build base image
        run: ./docker/scripts/build-base.sh
      - name: Push base image
        run: ./docker/scripts/push.sh base

  build-flavors:
    needs: build-base
    runs-on: ubuntu-latest
    strategy:
      matrix:
        flavor: [js, python, go, rust, fullstack, polyglot]
    steps:
      - uses: actions/checkout@v4
      - name: Build flavor
        run: ./docker/scripts/build-flavor.sh ${{ matrix.flavor }}
      - name: Push flavor
        run: ./docker/scripts/push.sh flavor ${{ matrix.flavor }}

  build-addons:
    needs: build-flavors
    runs-on: ubuntu-latest
    strategy:
      matrix:
        flavor: [js, python, fullstack, polyglot]
        addon: [gui, code-server, databases, cloud]
    steps:
      - uses: actions/checkout@v4
      - name: Build addon
        run: ./docker/scripts/build-addon.sh ${{ matrix.addon }} --base agentpod-${{ matrix.flavor }}:latest
      - name: Push addon image
        run: ./docker/scripts/push.sh addon ${{ matrix.flavor }} ${{ matrix.addon }}
```

---

## Phase 7: Update Shared Types (Day 3 Morning)

### 7.1 Add Types to Shared Package

**File:** `packages/types/src/container.ts`

```typescript
// Resource Tiers
export interface ResourceTier {
  id: string;
  name: string;
  description: string | null;
  cpuCores: number;
  memoryGb: number;
  storageGb: number;
  priceMonthly: number;
  isDefault: boolean;
  sortOrder: number;
}

// Container Flavors
export interface ContainerFlavor {
  id: string;
  name: string;
  description: string | null;
  languages: string[];
  imageSizeMb: number | null;
  isDefault: boolean;
  sortOrder: number;
}

// Container Addons
export type AddonCategory = 'interface' | 'compute' | 'storage' | 'devops';

export interface ContainerAddon {
  id: string;
  name: string;
  description: string | null;
  category: AddonCategory;
  imageSizeMb: number | null;
  port: number | null;
  requiresGpu: boolean;
  priceMonthly: number;
  sortOrder: number;
}

// Image Resolution
export interface ImageResolution {
  imageRef: string;
  exposedPorts: number[];
  requiresGpu: boolean;
}
```

### 7.2 Update Project Type

**File:** `packages/types/src/project.ts`

```typescript
export interface Project {
  // ... existing fields
  
  // New modular fields
  resourceTierId: string;
  flavorId: string;
  addonIds: string[];
  
  // Computed URLs
  fqdnUrl: string | null;
  codeServerUrl: string | null;
  vncUrl: string | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  sourceUrl?: string;
  resourceTierId?: string;
  flavorId?: string;
  addonIds?: string[];
}
```

---

## Phase 8: Testing & Documentation (Day 3 Afternoon)

### 8.1 Add Tests

**File:** `apps/api/tests/unit/image-resolver.test.ts`

```typescript
import { describe, test, expect } from 'bun:test';
import { resolveImage, validateContainerConfig } from '../../src/services/image-resolver';

describe('Image Resolver', () => {
  test('resolves default configuration', () => {
    const result = resolveImage({});
    expect(result.flavor.id).toBe('fullstack');
    expect(result.resourceTier.id).toBe('starter');
  });

  test('resolves JS flavor with code-server', () => {
    const result = resolveImage({
      flavorId: 'js',
      addonIds: ['code-server'],
    });
    expect(result.imageRef).toContain('agentpod-js-code-server');
    expect(result.exposedPorts).toContain(8080);
  });

  test('validates invalid flavor', () => {
    const result = validateContainerConfig({
      flavorId: 'invalid',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Flavor 'invalid' not found");
  });
});
```

### 8.2 Update Documentation

**File:** `docker/README.md` - Complete rewrite for modular system

**File:** `docs/implementation/README.md` - Add reference to modular containers

**File:** `AGENTS.md` - Update container information

---

## Migration Checklist

### Pre-Migration
- [ ] Create backup branch
- [ ] Document current container tier mappings
- [ ] List all running projects and their tiers

### Phase 1: Docker Structure
- [ ] Remove `docker/containers/cli/`
- [ ] Remove `docker/containers/desktop/`
- [ ] Add `docker/base/`
- [ ] Add `docker/flavors/*`
- [ ] Add `docker/addons/*`
- [ ] Update build scripts
- [ ] Test local builds

### Phase 2: API Models
- [ ] Add `resource-tier.ts`
- [ ] Add `container-flavor.ts`
- [ ] Add `container-addon.ts`
- [ ] Add `image-resolver.ts`
- [ ] Update model exports

### Phase 3: Database
- [ ] Create migration file
- [ ] Test migration locally
- [ ] Backup production database
- [ ] Run migration

### Phase 4: API Routes
- [ ] Add `/api/resource-tiers`
- [ ] Add `/api/flavors`
- [ ] Add `/api/addons`
- [ ] Update main router
- [ ] Test endpoints

### Phase 5: Project Manager
- [ ] Update project model
- [ ] Update project-manager service
- [ ] Update projects route
- [ ] Test project creation

### Phase 6: CI/CD
- [ ] Update build workflow
- [ ] Test workflow locally
- [ ] Push and verify builds

### Phase 7: Shared Types
- [ ] Update `@agentpod/types`
- [ ] Rebuild packages

### Phase 8: Testing & Docs
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Update documentation
- [ ] Update AGENTS.md

### Post-Migration
- [ ] Deploy to staging
- [ ] Test all project operations
- [ ] Migrate existing projects
- [ ] Deploy to production
- [ ] Monitor for issues

---

## Rollback Plan

If issues occur:

1. **Revert to backup branch:**
   ```bash
   git checkout backup/pre-modular-containers
   ```

2. **Restore database:**
   ```bash
   sqlite3 data.db < backup.sql
   ```

3. **Rebuild old containers:**
   ```bash
   ./docker/scripts/build.sh all
   ```

---

## Post-Migration Cleanup

After successful migration:

1. Remove deprecated `containerTierId` field (after 30 days)
2. Remove legacy container tier mappings
3. Archive backup branch
4. Update all documentation references

---

## Timeline Summary

| Day | Phase | Tasks |
|-----|-------|-------|
| Day 1 AM | Phase 1 | Docker structure |
| Day 1 PM | Phase 2 | API models |
| Day 1 Eve | Phase 3 | Database migration |
| Day 2 AM | Phase 4 | API routes |
| Day 2 PM | Phase 5 | Project manager |
| Day 2 Eve | Phase 6 | CI/CD pipeline |
| Day 3 AM | Phase 7 | Shared types |
| Day 3 PM | Phase 8 | Testing & docs |

**Total: 2-3 days**
