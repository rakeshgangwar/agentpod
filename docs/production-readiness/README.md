# Production Readiness Plan

This document outlines the comprehensive plan to make CodeOpen/AgentPod production-ready. The plan is organized into four phases, prioritizing security first.

## Current Status

**Overall Production Readiness Score: 6/10**

| Category | Score | Notes |
|----------|-------|-------|
| Security | 6/10 | Good auth, missing rate limiting and headers |
| Infrastructure | 6/10 | Good Docker setup, missing GitHub CI |
| Database | 7/10 | Good ORM setup, missing backups |
| Error Handling | 5/10 | Basic logging, missing observability |
| Testing | 6/10 | Good API tests, missing frontend tests |
| Documentation | 7/10 | Good internal docs, missing API docs |
| Performance | 5/10 | No caching layer |
| Configuration | 7/10 | Good structure, missing validation |

## Infrastructure Context

- **Deployment Target**: Single VPS with Docker
- **Logging Solution**: Loki + Fluent Bit + Grafana (open-source)
- **CI/CD Platform**: GitHub Actions
- **Container Registry**: Forgejo Registry (existing)
- **Alerting**: Telegram bot
- **Budget**: Zero (open-source only)

## Implementation Phases

| Phase | Focus | Priority | Estimated Time |
|-------|-------|----------|----------------|
| [Phase 1](./phase-1-security.md) | Security Hardening | Critical | 4-5 hours |
| [Phase 2](./phase-2-observability.md) | Observability Stack | High | 3-4 hours |
| [Phase 3](./phase-3-ci-cd.md) | CI/CD Pipeline | High | 2-3 hours |
| [Phase 4](./phase-4-backup.md) | Database Backup | Critical | 1-2 hours |

**Total Estimated Time: ~10-14 hours**

## Files Overview

### New Files to Create (11)

| File | Purpose |
|------|---------|
| `apps/api/src/middleware/security-headers.ts` | Security headers middleware |
| `apps/api/src/middleware/rate-limit.ts` | Rate limiting middleware |
| `apps/api/src/middleware/csrf.ts` | CSRF protection middleware |
| `apps/api/src/utils/validate-config.ts` | Startup config validation |
| `config/fluent-bit/fluent-bit.conf` | Log collector configuration |
| `config/fluent-bit/parsers.conf` | Log parser definitions |
| `config/grafana/provisioning/datasources/loki.yaml` | Loki datasource |
| `config/grafana/provisioning/alerting/telegram.yaml` | Telegram alerts |
| `config/loki/local-config.yaml` | Loki storage config |
| `scripts/backup-db.sh` | PostgreSQL backup script |
| `.github/workflows/ci.yml` | GitHub Actions CI workflow |

### Files to Modify (6)

| File | Changes |
|------|---------|
| `apps/api/src/index.ts` | Add middlewares, global error handler |
| `apps/api/src/auth/middleware.ts` | Timing-safe token comparison |
| `apps/api/src/config.ts` | Remove defaults, add validation |
| `apps/api/src/utils/logger.ts` | Structured JSON logging |
| `docker-compose.yml` | Add Loki, Fluent Bit, Grafana, backup |
| `.env.example` | Add new environment variables |

## Quick Start

After implementation, the production deployment process will be:

```bash
# 1. Clone repository
git clone https://github.com/your-org/codeopen.git
cd codeopen

# 2. Configure environment
cp .env.example .env
# Edit .env with production values (see phase-1-security.md)

# 3. Create Docker network
docker network create agentpod-net

# 4. Start services
docker compose up -d

# 5. Access services
# API: http://api.localhost (or your domain)
# Grafana: Internal only (SSH tunnel or Tailscale)
```

## Monitoring Access

Grafana is configured for internal-only access. To view dashboards:

```bash
# Option 1: SSH tunnel
ssh -L 3000:localhost:3000 user@your-vps

# Option 2: Tailscale (if configured)
# Access via Tailscale IP: http://100.x.x.x:3000

# Default credentials (change immediately!)
# Username: admin
# Password: Set via GRAFANA_PASSWORD env var
```

## Alert Configuration

Alerts are sent to Telegram. Setup requires:

1. Create bot via `@BotFather`
2. Get chat ID from bot API
3. Set environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

See [Phase 2: Observability](./phase-2-observability.md) for details.

## Related Documentation

- [Technical Architecture](../technical-architecture.md)
- [Testing Guide](../../TESTING.md)
- [API Documentation](../implementation/phase-2-management-api/README.md)
- [Docker Configuration](../../docker/README.md)

---

*Document created: December 2024*
*Target completion: Phase 1-4 implementation*
