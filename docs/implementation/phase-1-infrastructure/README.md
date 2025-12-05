# Phase 1: Infrastructure Setup

**Status: COMPLETE**

Set up the foundational server infrastructure on Hetzner VPS.

## Objectives

1. ~~Install and configure Tailscale on VPS~~
2. ~~Deploy Forgejo via Coolify~~
3. ~~Create and publish OpenCode Docker image~~
4. ~~Verify end-to-end connectivity~~

## Prerequisites

- Hetzner VPS with Coolify already installed
- Coolify API token generated
- Tailscale account

## Duration

**Estimated:** 1-2 days
**Actual:** 1 day

## Deliverables

- [x] Tailscale running on VPS with stable IP (`100.85.212.42`)
- [x] Forgejo deployed and accessible (`https://forgejo.superchotu.com`)
- [x] OpenCode Docker image built via Coolify from Forgejo repo
- [x] Test container deployed and responding to API calls (`https://opencode.superchotu.com`)

## Infrastructure URLs

| Service | URL |
|---------|-----|
| Coolify Dashboard | https://admin.superchotu.com |
| Forgejo (Git) | https://forgejo.superchotu.com |
| OpenCode | https://opencode.superchotu.com |
| VPS Tailscale IP | 100.85.212.42 |

## Success Criteria

1. ~~Can SSH to VPS via Tailscale IP~~ ✓
2. ~~Forgejo web UI accessible~~ ✓ (`https://forgejo.superchotu.com`)
3. ~~Can create a repo in Forgejo via API~~ ✓
4. ~~OpenCode container starts and responds to `GET /app`~~ ✓

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown
- [technical-notes.md](./technical-notes.md) - Commands, configs, and notes
