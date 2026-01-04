# Phase 4: Migration to ACP

## Overview

After implementing ACP support alongside the existing OpenCode SDK integration, this phase migrates existing functionality to use ACP, eventually deprecating the legacy OpenCode SDK routes.

## Objectives

1. Migrate OpenCode communication from REST/SSE to ACP
2. Deprecate legacy `/api/projects/:id/opencode/*` routes
3. Unify all agent communication through ACP Gateway
4. Maintain backward compatibility during transition

## Migration Strategy

### Current State (After Phase 3)

```
Frontend
├── OpenCode SDK Adapter (legacy) → Management API → OpenCode SDK → Container:4096
└── ACP Adapter (new)            → Management API → ACP Gateway → Container:4097
```

### Target State (After Phase 4)

```
Frontend
└── ACP Adapter (unified) → Management API → ACP Gateway → Container:4097
                                                        ├── opencode acp
                                                        ├── claude-code-acp
                                                        └── gemini --acp
```

## Migration Steps

### Step 1: OpenCode via ACP

1. Ensure `opencode acp` works reliably
2. Create feature flag for ACP mode
3. Update OpenCode adapter to use ACP when flag is enabled
4. Test thoroughly with existing sessions

### Step 2: Parallel Running

1. Keep both adapters available
2. Add logging to compare behavior
3. Monitor for regressions
4. Collect metrics on both paths

### Step 3: ACP Default

1. Make ACP adapter the default for OpenCode
2. Keep legacy adapter as fallback
3. Add deprecation warnings to legacy routes
4. Update documentation

### Step 4: Legacy Deprecation

1. Remove legacy adapter from frontend
2. Mark legacy routes as deprecated in API
3. Plan removal timeline (e.g., 3 months)
4. Notify users of deprecation

### Step 5: Cleanup

1. Remove legacy `/api/projects/:id/opencode/*` routes
2. Remove OpenCode SDK dependency from Management API
3. Update container to only run ACP Gateway
4. Clean up old code and documentation

## Feature Flag

```typescript
// config.ts
export const config = {
  features: {
    useAcpForOpencode: process.env.USE_ACP_FOR_OPENCODE === 'true',
  },
};

// adapter-factory.ts
function createChatAdapter(projectId: string, agentId: string): ChatAdapter {
  if (agentId === 'opencode' && !config.features.useAcpForOpencode) {
    return new LegacyOpencodeAdapter(projectId);
  }
  return new AcpChatAdapter(projectId, agentId);
}
```

## Deprecation Timeline

| Date | Milestone |
|------|-----------|
| T+0 | Phase 4 starts, ACP optional |
| T+2w | ACP default for new projects |
| T+4w | ACP default for all projects |
| T+8w | Legacy routes deprecated |
| T+12w | Legacy routes removed |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| ACP bugs affect existing users | Feature flag, gradual rollout |
| Performance regression | Benchmark before migration |
| Session compatibility | Support both formats during transition |
| Container stability | Run both services in parallel |

## Tasks

### 1. Preparation
- [ ] Document current OpenCode SDK behavior
- [ ] Create comprehensive test suite
- [ ] Set up performance benchmarks
- [ ] Add feature flag infrastructure

### 2. Migration Code
- [ ] Update adapter factory with flag
- [ ] Add metrics/logging for comparison
- [ ] Create migration scripts for sessions
- [ ] Update documentation

### 3. Testing
- [ ] Unit tests for both paths
- [ ] Integration tests comparing behavior
- [ ] Performance testing
- [ ] User acceptance testing

### 4. Rollout
- [ ] Enable for internal testing
- [ ] Enable for subset of users
- [ ] Enable for all users
- [ ] Monitor for issues

### 5. Cleanup
- [ ] Remove legacy code
- [ ] Update dependencies
- [ ] Archive legacy documentation
- [ ] Update CHANGELOG

## Success Criteria

1. All existing functionality works via ACP
2. No performance regression (< 5% latency increase)
3. Zero data loss during migration
4. Successful deprecation of legacy routes
5. Simplified codebase with single communication path
