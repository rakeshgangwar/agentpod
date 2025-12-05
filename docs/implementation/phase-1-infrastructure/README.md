# Phase 1: Infrastructure Setup

Set up the foundational server infrastructure on Hetzner VPS.

## Objectives

1. Install and configure Tailscale on VPS
2. Deploy Forgejo via Coolify
3. Create and publish OpenCode Docker image
4. Verify end-to-end connectivity

## Prerequisites

- Hetzner VPS with Coolify already installed
- Coolify API token generated
- Tailscale account

## Duration

**Estimated:** 1-2 days

## Deliverables

- [ ] Tailscale running on VPS with stable IP
- [ ] Forgejo deployed and accessible
- [ ] OpenCode Docker image published to registry
- [ ] Test container deployed and responding to API calls

## Success Criteria

1. Can SSH to VPS via Tailscale IP (100.x.x.x)
2. Forgejo web UI accessible at `http://100.x.x.x:3000`
3. Can create a repo in Forgejo via API
4. OpenCode container starts and responds to `GET /app`

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown
- [technical-notes.md](./technical-notes.md) - Commands, configs, and notes
