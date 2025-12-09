/**
 * ACP Gateway Tests
 * 
 * Integration tests for the ACP Gateway HTTP API.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

// Test server instance
let serverProcess: ReturnType<typeof Bun.spawn> | null = null;
const TEST_PORT = 4199;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to make requests
async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  return {
    status: response.status,
    data: await response.json(),
  };
}

// Start the server before tests
beforeAll(async () => {
  console.log('Starting ACP Gateway test server...');
  
  serverProcess = Bun.spawn(['bun', 'run', 'src/index.ts'], {
    cwd: '/home/rakeshgangwar/Projects/CodeOpen/docker/opencode/acp-gateway',
    env: {
      ...process.env,
      ACP_GATEWAY_PORT: String(TEST_PORT),
      WORKSPACE_DIR: '/tmp/acp-gateway-test',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Verify server is running
  try {
    const response = await fetch(`${BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('Server health check failed');
    }
    console.log('Test server started successfully');
  } catch (error) {
    console.error('Failed to start test server:', error);
    throw error;
  }
});

// Stop the server after tests
afterAll(() => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

// =============================================================================
// Health and Info Tests
// =============================================================================

describe('Health and Info Endpoints', () => {
  test('GET /health returns healthy status', async () => {
    const { status, data } = await request('/health');
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('healthy');
    expect(data.data.timestamp).toBeDefined();
  });

  test('GET /info returns gateway info', async () => {
    const { status, data } = await request('/info');
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('ACP Gateway');
    expect(data.data.version).toBe('0.1.0');
    expect(data.data.workingDirectory).toBe('/tmp/acp-gateway-test');
    expect(typeof data.data.runningAgents).toBe('number');
    expect(typeof data.data.activeSessions).toBe('number');
    expect(typeof data.data.connectedClients).toBe('number');
  });
});

// =============================================================================
// Agent Registry Tests
// =============================================================================

describe('Agent Registry', () => {
  test('GET /agents returns list of available agents', async () => {
    const { status, data } = await request('/agents');
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.agents)).toBe(true);
    expect(data.data.agents.length).toBeGreaterThan(0);
    
    // Check for expected agents
    const agentIds = data.data.agents.map((a: { id: string }) => a.id);
    expect(agentIds).toContain('opencode');
    expect(agentIds).toContain('claude-code');
    expect(agentIds).toContain('gemini-cli');
    
    // Check agent structure
    const opencode = data.data.agents.find((a: { id: string }) => a.id === 'opencode');
    expect(opencode).toBeDefined();
    expect(opencode.name).toBe('OpenCode');
    expect(opencode.requiresAuth).toBe(false);
    expect(opencode.status).toBeDefined();
  });

  test('agents have correct auth requirements', async () => {
    const { data } = await request('/agents');
    
    const agents = data.data.agents;
    
    // OpenCode doesn't require auth
    const opencode = agents.find((a: { id: string }) => a.id === 'opencode');
    expect(opencode.requiresAuth).toBe(false);
    
    // Claude Code requires auth
    const claudeCode = agents.find((a: { id: string }) => a.id === 'claude-code');
    expect(claudeCode.requiresAuth).toBe(true);
    
    // Gemini CLI requires auth
    const geminiCli = agents.find((a: { id: string }) => a.id === 'gemini-cli');
    expect(geminiCli.requiresAuth).toBe(true);
  });
});

// =============================================================================
// Agent Status Tests
// =============================================================================

describe('Agent Status', () => {
  test('GET /agents/:id/status returns stopped for non-running agent', async () => {
    const { status, data } = await request('/agents/opencode/status');
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('opencode');
    expect(data.data.status).toBe('stopped');
    expect(data.data.sessionCount).toBe(0);
  });

  test('GET /agents/:id/status returns 200 for unknown agent', async () => {
    // Unknown agents return 200 with stopped status (not 404)
    const { status, data } = await request('/agents/unknown-agent/status');
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('stopped');
  });
});

// =============================================================================
// Auth Routes Tests
// =============================================================================

describe('Auth Routes', () => {
  test('GET /agents/:id/auth/status returns unauthenticated by default', async () => {
    const { status, data } = await request('/agents/claude-code/auth/status');
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.authenticated).toBe(false);
  });

  test('POST /agents/:id/auth/init returns auth init response', async () => {
    const { status, data } = await request('/agents/claude-code/auth/init', {
      method: 'POST',
    });
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.message).toBeDefined();
  });

  test('POST /agents/:id/auth/token stores token', async () => {
    const { status, data } = await request('/agents/claude-code/auth/token', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test-token-12345',
        expiresIn: 3600,
      }),
    });
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.authenticated).toBe(true);
  });

  test('POST /agents/:id/auth/token requires token', async () => {
    const { status, data } = await request('/agents/claude-code/auth/token', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    
    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Token is required');
  });

  test('POST /agents/unknown/auth/init returns 404', async () => {
    const { status, data } = await request('/agents/unknown-agent/auth/init', {
      method: 'POST',
    });
    
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

// =============================================================================
// Session Routes Tests (without agent spawn)
// =============================================================================

describe('Session Routes', () => {
  test('GET /sessions returns empty list initially', async () => {
    const { status, data } = await request('/sessions');
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.sessions)).toBe(true);
  });

  test('GET /session/:id returns 404 for non-existent session', async () => {
    const { status, data } = await request('/session/non-existent-session');
    
    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Session not found');
  });

  test('POST /session/:id/prompt returns 404 for non-existent session', async () => {
    const { status, data } = await request('/session/non-existent-session/prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Hello' }),
    });
    
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('POST /session/:id/cancel returns 404 for non-existent session', async () => {
    const { status, data } = await request('/session/non-existent-session/cancel', {
      method: 'POST',
    });
    
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('DELETE /session/:id returns 404 for non-existent session', async () => {
    const { status, data } = await request('/session/non-existent-session', {
      method: 'DELETE',
    });
    
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('POST /session requires agentId', async () => {
    const { status, data } = await request('/session', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    
    // Should fail because agentId is not provided or invalid
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('POST /session rejects unknown agent', async () => {
    const { status, data } = await request('/session', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'unknown-agent' }),
    });
    
    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Unknown agent');
  });
});

// =============================================================================
// Permission Routes Tests
// =============================================================================

describe('Permission Routes', () => {
  test('POST /permission/:id handles permission response', async () => {
    const { status, data } = await request('/permission/test-permission-id', {
      method: 'POST',
      body: JSON.stringify({ granted: true }),
    });
    
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('test-permission-id');
    expect(data.data.granted).toBe(true);
  });
});

// =============================================================================
// CORS Tests
// =============================================================================

describe('CORS Configuration', () => {
  test('OPTIONS request returns CORS headers', async () => {
    const response = await fetch(`${BASE_URL}/health`, {
      method: 'OPTIONS',
    });
    
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
