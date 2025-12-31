# Coolify Analysis & Alternatives

This document analyzes our current Coolify usage and evaluates alternatives for container orchestration in Agentpod.

## Current Coolify Usage

### Overview

Coolify serves as our container orchestration platform, managing OpenCode containers for each project. We use it to:

1. **Deploy containers** from Docker images stored in Forgejo Registry
2. **Manage lifecycle** (start, stop, restart, delete)
3. **Configure networking** (domains, ports, SSL via Traefik)
4. **Inject credentials** via environment variables
5. **Monitor status** and retrieve logs

### API Endpoints Used

| Category | Endpoint | Purpose |
|----------|----------|---------|
| **Applications** | `POST /applications/dockerimage` | Create app from Docker image |
| | `PATCH /applications/{uuid}` | Update app settings |
| | `DELETE /applications/{uuid}` | Delete application |
| | `GET /applications/{uuid}` | Get app details/status |
| | `GET /applications/{uuid}/start` | Start container |
| | `GET /applications/{uuid}/stop` | Stop container |
| | `GET /applications/{uuid}/restart` | Restart container |
| | `GET /applications/{uuid}/logs` | Get container logs |
| **Environment** | `GET /applications/{uuid}/envs` | List env vars |
| | `PATCH /applications/{uuid}/envs/bulk` | Bulk update env vars |
| | `DELETE /applications/{uuid}/envs/{id}` | Delete env var |
| **Deployment** | `GET /deploy?uuid={uuid}` | Trigger deployment |
| **Infrastructure** | `GET /servers` | List servers (health check) |
| | `GET /projects` | List Coolify projects |

### Container Configuration

We configure containers with:

```typescript
{
  ports_exposes: "4096,8080,6080",     // OpenCode, Code Server, VNC
  domains: "opencode-{slug}.domain",   // Traefik routing
  health_check_enabled: false,          // Use container's own healthcheck
  limits_memory: "2Gi",                 // From tier config
  limits_cpus: "1",                     // From tier config
}
```

### Environment Variables Injected

- `OPENCODE_PORT`, `OPENCODE_HOST`
- `FORGEJO_REPO_URL`, `FORGEJO_USER`, `FORGEJO_TOKEN`
- `MANAGEMENT_API_URL`, `USER_ID`, `AUTH_TOKEN`
- LLM credentials (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)

---

## Pain Points with Coolify

### Critical Issues

1. **Git URL Domain Stripping**
   - `/applications/public` endpoint strips domain from git URLs
   - Assumes GitHub, breaks self-hosted Forgejo
   - **Impact**: Had to switch to Docker image deployment instead

2. **API Inconsistencies**
   - Deploy endpoint: `/deploy?uuid={uuid}` (query param, not path)
   - Uses GET for state-changing operations (start/stop/restart)
   - Undocumented response formats

3. **Deployment Tracking Limitations**
   - No persistent deployment history via API
   - `/deployments` returns empty when no active deployments
   - Can't track historical deployments

4. **Health Check Issues**
   - Doesn't work well with dynamic ports
   - Had to disable Coolify's healthcheck entirely

5. **Environment Variable Quirks**
   - Creates duplicate preview/non-preview versions
   - Must filter when listing

### Minor Issues

- UI feels dated
- Dockerfile updates via PATCH unreliable
- Logs response format varies (string, object, array)
- Limited observability/metrics

---

## Alternative Platforms Comparison

### Self-Hosted Options

| Platform | Type | Strengths | Weaknesses | Best For |
|----------|------|-----------|------------|----------|
| **Coolify** | PaaS | Feature-rich UI, Git integration, built-in DBs | API quirks, resource heavy | Teams wanting UI + features |
| **Dokploy** | PaaS | Modern, Traefik, multi-server, Grafana built-in | Newer/less mature | Docker-focused, multi-server |
| **CapRover** | PaaS | Mature, Docker Swarm, one-click apps, stable | Dated UI, less docs | Proven stability, Swarm clustering |
| **Dokku** | CLI | Minimal, Heroku-like, Git push deploy | No UI, single server | CLI lovers, minimal overhead |

### Detailed Analysis

#### 1. Dokploy

**Pros:**
- Modern UI and architecture
- Native Traefik (same as we need)
- Multi-server support via SSH
- Built-in Grafana/Prometheus monitoring
- Docker Compose native support
- Active development

**Cons:**
- Relatively new (smaller community)
- No Kubernetes support
- Less battle-tested

**API Quality:** Well-documented, JWT auth, proper REST conventions

**Migration Effort:** Medium - Similar Docker-based approach

#### 2. CapRover

**Pros:**
- Most mature option (longer than Coolify)
- Docker Swarm built-in (easy scaling)
- Large one-click app marketplace
- Active community, good docs
- Proven stability

**Cons:**
- UI feels dated
- Plugin-based databases (not built-in)
- Documentation gaps

**API Quality:** Good, but less modern than Dokploy

**Migration Effort:** Medium - Different API but similar concepts

#### 3. Dokku

**Pros:**
- Minimal resource usage
- Heroku buildpack compatible
- Git push deployment
- Simple and predictable
- Plugin ecosystem

**Cons:**
- No web UI (CLI only)
- Single server only
- No native multi-container support
- Requires CLI comfort

**API Quality:** CLI-based, no REST API

**Migration Effort:** High - Would need to rebuild management layer

#### 4. Direct Docker/Podman + Traefik

**Pros:**
- Full control
- No abstraction overhead
- Exactly what we need, nothing more
- Predictable behavior

**Cons:**
- Build everything ourselves
- No UI for users
- More operational complexity

**Migration Effort:** High - Build from scratch

---

## Feature Comparison Matrix

| Feature | Coolify | Dokploy | CapRover | Dokku |
|---------|---------|---------|----------|-------|
| Web UI | ✅ | ✅ | ✅ | ❌ |
| Docker Support | ✅ | ✅ | ✅ | ✅ |
| Multi-Server | ✅ | ✅ | ✅ (Swarm) | ❌ |
| Built-in Databases | ✅ | ✅ | ⚠️ Plugin | ⚠️ Plugin |
| Traefik/Reverse Proxy | ✅ | ✅ (Traefik) | ✅ (Nginx) | ⚠️ Plugin |
| Auto SSL | ✅ | ✅ | ✅ | ⚠️ Plugin |
| Git Deployments | ✅ | ❌ UI-based | ✅ | ✅ |
| CI/CD Integration | ✅ | ✅ | ✅ | ❌ |
| Monitoring Built-in | ✅ | ✅ (Grafana) | ⚠️ Add-on | ❌ |
| One-Click Apps | ✅ | ❌ | ✅ | ❌ |
| Auto-Scaling | ✅ | ✅ | ✅ | ❌ |
| API Quality | ⚠️ Quirky | ✅ Modern | ✅ Good | ❌ CLI |
| Community Size | Medium | Small | Large | Large |
| Maturity | Medium | Low | High | High |

---

## Recommendation

### Stay with Coolify (For Now)

**Reasoning:**

1. **Working Implementation**: Despite quirks, our integration works
2. **Feature Set**: Has everything we need (UI, Docker, env vars, domains)
3. **Migration Cost**: Switching platforms requires significant effort
4. **Known Issues**: We've documented workarounds for all pain points

### Consider Switching If:

1. **API issues become blocking** - If Coolify API changes break our integration
2. **Scaling needs grow** - If we need better multi-server orchestration
3. **Monitoring becomes critical** - Dokploy's built-in Grafana is compelling
4. **Community/support declines** - If Coolify development slows

### Future Considerations

#### Short-term (Keep Coolify)
- Document all API quirks and workarounds
- Monitor Coolify releases for improvements
- Build abstraction layer to ease future migration

#### Medium-term (Evaluate Dokploy)
- Dokploy is the most promising alternative
- Similar architecture (Docker + Traefik)
- Better API design
- Built-in monitoring

#### Long-term (Consider Direct Docker)
- If our needs become very specific
- Build custom orchestration layer
- Use Docker API directly with Traefik

---

## Migration Path (If Needed)

### To Dokploy

1. **API Mapping**: Both use similar concepts
   - Applications → Services
   - Environment variables → Same
   - Domains → Same (Traefik)

2. **Key Changes**:
   - Different API endpoints/auth
   - UI-based workflows (no git deploy)
   - Built-in monitoring setup

3. **Effort**: ~2-3 days for service layer rewrite

### To CapRover

1. **API Mapping**: Similar but different terminology
   - Applications → Apps
   - Servers → Cluster nodes

2. **Key Changes**:
   - Docker Swarm instead of standalone
   - Different domain configuration
   - Nginx instead of Traefik

3. **Effort**: ~3-5 days including testing

---

## Abstraction Recommendation

To reduce future migration pain, consider:

```typescript
// Abstract interface for container orchestration
interface ContainerOrchestrator {
  // Application lifecycle
  createApplication(config: AppConfig): Promise<App>;
  deleteApplication(id: string): Promise<void>;
  startApplication(id: string): Promise<void>;
  stopApplication(id: string): Promise<void>;
  restartApplication(id: string): Promise<void>;
  
  // Configuration
  setEnvironmentVariables(id: string, vars: EnvVar[]): Promise<void>;
  setDomains(id: string, domains: string[]): Promise<void>;
  setResources(id: string, resources: Resources): Promise<void>;
  
  // Monitoring
  getStatus(id: string): Promise<AppStatus>;
  getLogs(id: string, lines?: number): Promise<string>;
  
  // Infrastructure
  healthCheck(): Promise<boolean>;
}

// Implementations
class CoolifyOrchestrator implements ContainerOrchestrator { ... }
class DokployOrchestrator implements ContainerOrchestrator { ... }
class CapRoverOrchestrator implements ContainerOrchestrator { ... }
```

This abstraction would:
- Isolate platform-specific code
- Enable easy A/B testing of platforms
- Reduce migration effort to implementing new adapter

---

## Conclusion

**Current Status**: Coolify is working but has friction points

**Recommendation**: Stay with Coolify, but:
1. Document all workarounds
2. Consider abstraction layer
3. Monitor Dokploy maturity
4. Re-evaluate in 6 months

**Best Alternative**: Dokploy (if we need to switch)
- Most similar architecture
- Better API design
- Active development
- Built-in monitoring
