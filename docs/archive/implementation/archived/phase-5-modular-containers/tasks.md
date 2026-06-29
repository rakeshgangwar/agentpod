# Phase 5: Modular Containers - Tasks

## Status: 🔄 In Progress

---

## 1. Docker Structure

### 1.1 Base Image (`docker/codeopen-base/`)
- [ ] Create `Dockerfile` with multi-stage build for ACP Gateway
- [ ] Move `acp-gateway/` from `docker/opencode/`
- [ ] Create `scripts/common-setup.sh` (shared entrypoint functions)
- [ ] Create `scripts/start-services.sh` (OpenCode + ACP Gateway startup)
- [ ] Create `entrypoint.sh`
- [ ] Create `README.md`

### 1.2 JavaScript Flavor (`docker/flavors/js/`)
- [ ] Create `Dockerfile` extending codeopen-base
- [ ] Include: pnpm, yarn, tsx, esbuild, vite
- [ ] Create `README.md`

### 1.3 Python Flavor (`docker/flavors/python/`)
- [ ] Create `Dockerfile` extending codeopen-base
- [ ] Include: Python 3.12, pip, uv, poetry, jupyter
- [ ] Create `README.md`

### 1.4 Go Flavor (`docker/flavors/go/`)
- [ ] Create `Dockerfile` extending codeopen-base
- [ ] Include: Go 1.22, gopls, golangci-lint, air
- [ ] Create `README.md`

### 1.5 Rust Flavor (`docker/flavors/rust/`)
- [ ] Create `Dockerfile` extending codeopen-base
- [ ] Include: Rust toolchain, clippy, rustfmt, rust-analyzer
- [ ] Create `README.md`

### 1.6 Full-Stack Flavor (`docker/flavors/fullstack/`)
- [ ] Create `Dockerfile` extending codeopen-base
- [ ] Include: Node.js + Python combination
- [ ] Create `README.md`

### 1.7 Polyglot Flavor (`docker/flavors/polyglot/`)
- [ ] Create `Dockerfile` extending codeopen-base
- [ ] Include: All languages (JS, Python, Go, Rust)
- [ ] Create `README.md`

---

## 2. Add-ons

### 2.1 GUI Add-on (`docker/addons/gui/`)
- [ ] Create `Dockerfile` with ARG BASE_IMAGE
- [ ] Move config from `docker/opencode-desktop/config/`
- [ ] Include: KasmVNC, Openbox, tint2, xterm
- [ ] Create `config/supervisord.conf`
- [ ] Create `README.md`

### 2.2 Code Server Add-on (`docker/addons/code-server/`)
- [ ] Create `Dockerfile` with ARG BASE_IMAGE
- [ ] Include: code-server installation
- [ ] Create startup script
- [ ] Create `README.md`

### 2.3 GPU Add-on (`docker/addons/gpu/`)
- [ ] Create `Dockerfile` with ARG BASE_IMAGE
- [ ] Include: CUDA toolkit dependencies
- [ ] Set NVIDIA environment variables
- [ ] Create `README.md`
- [ ] Test locally with NVIDIA GPU

### 2.4 Database Tools Add-on (`docker/addons/databases/`)
- [ ] Create `Dockerfile` with ARG BASE_IMAGE
- [ ] Include: psql, redis-cli, mongosh
- [ ] Create `README.md`

### 2.5 Cloud CLIs Add-on (`docker/addons/cloud/`)
- [ ] Create `Dockerfile` with ARG BASE_IMAGE
- [ ] Include: AWS CLI, gcloud, az, terraform, kubectl
- [ ] Create `README.md`

---

## 3. Build Scripts

### 3.1 Configuration
- [ ] Update `docker/scripts/config.sh` for new structure
- [ ] Add image naming functions

### 3.2 Build Scripts
- [ ] Create `docker/scripts/build-base.sh`
- [ ] Create `docker/scripts/build-flavor.sh`
- [ ] Create `docker/scripts/build-addon.sh`
- [ ] Create `docker/scripts/build-on-demand.sh`
- [ ] Update `docker/scripts/build.sh` as orchestrator

### 3.3 Push Scripts
- [ ] Update `docker/scripts/push.sh` for new images

---

## 4. Database Migration

### 4.1 Schema Changes
- [ ] Create migration 10: modular container tables
- [ ] Create `resource_tiers` table
- [ ] Create `container_flavors` table
- [ ] Create `container_addons` table
- [ ] Add columns to `projects` table
- [ ] Seed initial data

### 4.2 Data Migration
- [ ] Migrate existing `container_tier_id` to new schema
- [ ] Map lite→starter, standard→builder, pro→creator, desktop→power+gui

---

## 5. Models

### 5.1 Resource Tier Model
- [ ] Create `management-api/src/models/resource-tier.ts`
- [ ] Implement CRUD functions
- [ ] Add helper functions for resource calculation

### 5.2 Container Flavor Model
- [ ] Create `management-api/src/models/container-flavor.ts`
- [ ] Implement CRUD functions
- [ ] Add helper for image name resolution

### 5.3 Container Addon Model
- [ ] Create `management-api/src/models/container-addon.ts`
- [ ] Implement CRUD functions
- [ ] Add compatibility checking

### 5.4 Update Existing Models
- [ ] Update `project.ts` with new fields
- [ ] Update `container-tier.ts` or deprecate

---

## 6. API Routes

### 6.1 Resource Tiers API
- [ ] Create `management-api/src/routes/resource-tiers.ts`
- [ ] `GET /api/resource-tiers` - List all
- [ ] `GET /api/resource-tiers/:id` - Get by ID

### 6.2 Flavors API
- [ ] Create `management-api/src/routes/flavors.ts`
- [ ] `GET /api/flavors` - List all
- [ ] `GET /api/flavors/:id` - Get by ID

### 6.3 Add-ons API
- [ ] Create `management-api/src/routes/addons.ts`
- [ ] `GET /api/addons` - List all
- [ ] `GET /api/addons/:id` - Get by ID
- [ ] `GET /api/addons/:id/compatibility` - Check compatibility

### 6.4 Update Project Routes
- [ ] Accept `resourceTierId`, `flavorId`, `addonIds` on create
- [ ] Accept same fields on update
- [ ] Return computed image name in response

---

## 7. Services

### 7.1 Image Resolution Service
- [ ] Create or update service to resolve image name from flavor + addons
- [ ] Handle image suffix ordering (alphabetical)
- [ ] Calculate total resources (tier + addon extras)

### 7.2 Update Project Manager
- [ ] Use new image resolution logic
- [ ] Pass correct image to Coolify
- [ ] Handle add-on port mappings

---

## 8. CI/CD

### 8.1 Forgejo Workflow
- [ ] Update `.forgejo/workflows/build-containers.yml`
- [ ] Add workflow_dispatch for on-demand builds
- [ ] Support flavor + addon combinations
- [ ] Update job dependencies

---

## 9. Cleanup

### 9.1 Remove Legacy Containers
- [ ] Remove `docker/opencode-cli/` (after verification)
- [ ] Remove `docker/opencode-desktop/` (after verification)
- [ ] Keep `docker/opencode/` for development reference

### 9.2 Update Documentation
- [ ] Update `docker/README.md`
- [ ] Update VERSION to 0.1.0

---

## 10. Testing

### 10.1 Local Testing
- [ ] Build base image locally
- [ ] Build at least one flavor locally
- [ ] Test GUI add-on locally
- [ ] Test GPU add-on with NVIDIA GPU

### 10.2 Integration Testing
- [ ] Test with Management API
- [ ] Test container deployment via Coolify
- [ ] Verify port mappings work correctly

---

## Notes

- Build on-demand: Only build images when first requested
- Image naming: `codeopen-{flavor}[-addon1][-addon2]:{version}`
- Add-on suffixes sorted alphabetically for consistency
- GPU add-on requires `--gpus all` docker flag
- Code Server moved from base to add-on
