# Phase 5: Modular Container Architecture

## Overview

Replace the monolithic container approach with a modular, composable system consisting of:

- **Resource Tiers**: CPU/Memory/Storage allocation (starter, builder, creator, power)
- **Container Flavors**: Language-specific images (js, python, go, rust, fullstack, polyglot)
- **Add-ons**: Optional features (gui, code-server, gpu, databases, cloud)

## Goals

1. **Flexibility**: Users choose exactly what they need
2. **Efficiency**: Smaller images for common use cases
3. **Scalability**: Build images on-demand
4. **Maintainability**: DRY codebase with shared base layer

## Prerequisites

- Phase 1 (ACP Gateway): ✅ Complete
- Phase 2 (Management API): ✅ Complete

## Key Deliverables

### Docker Structure

- [ ] `docker/codeopen-base/` - Foundation image with ACP Gateway
- [ ] `docker/flavors/{js,python,go,rust,fullstack,polyglot}/` - Language images
- [ ] `docker/addons/{gui,code-server,gpu,databases,cloud}/` - Add-on images
- [ ] `docker/scripts/` - Build automation

### Database Schema

- [ ] `resource_tiers` table
- [ ] `container_flavors` table
- [ ] `container_addons` table
- [ ] Project fields: `resource_tier_id`, `flavor_id`, `addon_ids`

### API Endpoints

- [ ] `GET /api/resource-tiers`
- [ ] `GET /api/flavors`
- [ ] `GET /api/addons`
- [ ] Update project create/update for new schema

### Build System

- [ ] On-demand image building
- [ ] Forgejo workflow updates
- [ ] Local build scripts

## Related Documents

- [Modular Containers Architecture](../modular-containers.md)
- [Tasks Checklist](./tasks.md)
