/**
 * Integration Tests for Sandbox Routes (v2)
 * 
 * Tests the full HTTP request/response cycle for sandbox management endpoints.
 * Uses mocks for Docker orchestrator and Git backend to avoid requiring
 * actual Docker daemon and Git operations.
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup';

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import { db } from '../../src/db/drizzle';
import { user } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import * as SandboxModel from '../../src/models/sandbox';

// Mock the sandbox-manager module before importing the app
// This prevents the real Docker orchestrator from being used
import { 
  MockDockerOrchestrator, 
  resetDockerMock, 
  addMockSandbox, 
  getMockSandbox,
  setMockDockerHealth,
  mockCalls as dockerMockCalls 
} from '../mocks/docker';
import { 
  MockGitBackend, 
  resetGitMock, 
  addMockRepo,
  mockCalls as gitMockCalls 
} from '../mocks/git';

// Create mock instances
const mockOrchestrator = new MockDockerOrchestrator();
const mockGitBackend = new MockGitBackend();

// Mock the sandbox-manager module to use our mock orchestrator
mock.module('../../src/services/sandbox-manager', () => {
  const { SandboxManager } = require('../../src/services/sandbox-manager');
  
  // Create a singleton mock instance
  let mockManager: typeof SandboxManager | null = null;
  
  return {
    SandboxManager,
    getSandboxManager: () => {
      if (!mockManager) {
        // Create a real SandboxManager but with injected mock dependencies
        mockManager = {
          // Lifecycle operations - delegate to mock orchestrator
          createSandbox: async (options: any) => {
            // Create in DB first
            const id = `sandbox-${Date.now()}`;
            const slug = options.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const sandbox = SandboxModel.createSandbox({
              id,
              userId: options.userId,
              name: options.name,
              slug,
              description: options.description,
              repoName: `${slug}-repo`,
              resourceTierId: options.resourceTier || 'starter',
              flavorId: options.flavor || 'fullstack',
              addonIds: options.addons || ['code-server'],
            });
            
            // Create in mock Docker
            await mockOrchestrator.createSandbox({
              id,
              name: options.name,
              image: 'agentpod-fullstack:dev',
              workdir: '/workspace',
              labels: { 'agentpod.managed': 'true' },
            } as any);
            
            // Create mock repo
            await mockGitBackend.createRepo(`${slug}-repo`);
            
            // Update DB with container info
            SandboxModel.updateSandbox(id, {
              containerId: `container-${id}`,
              containerName: `agentpod-${slug}`,
              status: 'running',
              opencodeUrl: `http://localhost:4000`,
            });
            
            const updatedSandbox = SandboxModel.getSandboxById(id);
            
            return {
              sandbox: {
                ...updatedSandbox,
                urls: { opencode: `http://localhost:4000` },
              },
              repository: {
                name: `${slug}-repo`,
                path: `/data/repos/${slug}-repo`,
              },
            };
          },
          
          startSandbox: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id, status: 'stopped' });
            await mockOrchestrator.startSandbox(id);
            SandboxModel.updateSandboxStatus(id, 'running');
          },
          
          stopSandbox: async (id: string, timeout?: number) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id, status: 'running' });
            await mockOrchestrator.stopSandbox(id, timeout);
            SandboxModel.updateSandboxStatus(id, 'stopped');
          },
          
          restartSandbox: async (id: string, timeout?: number) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id, status: 'running' });
            await mockOrchestrator.restartSandbox(id, timeout);
          },
          
          pauseSandbox: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id, status: 'running' });
            await mockOrchestrator.pauseSandbox(id);
            SandboxModel.updateSandboxStatus(id, 'stopped');
          },
          
          unpauseSandbox: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id, status: 'paused' });
            await mockOrchestrator.unpauseSandbox(id);
            SandboxModel.updateSandboxStatus(id, 'running');
          },
          
          deleteSandbox: async (id: string, options?: { deleteRepo?: boolean; removeVolumes?: boolean }) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id });
            await mockOrchestrator.deleteSandbox(id, options?.removeVolumes);
            SandboxModel.deleteSandbox(id);
          },
          
          // Query operations
          getSandbox: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) return null;
            
            return {
              ...sandbox,
              urls: { opencode: sandbox.opencodeUrl || '' },
            };
          },
          
          getSandboxInfo: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) return null;
            
            return {
              sandbox: {
                ...sandbox,
                urls: { opencode: sandbox.opencodeUrl || '' },
              },
              repository: sandbox.repoName ? { name: sandbox.repoName } : null,
            };
          },
          
          listSandboxes: async (filter?: { userId?: string; status?: string[] }) => {
            let sandboxes: ReturnType<typeof SandboxModel.listAllSandboxes>;
            
            if (filter?.userId) {
              sandboxes = SandboxModel.listSandboxesByUserId(filter.userId);
            } else {
              sandboxes = SandboxModel.listAllSandboxes();
            }
            
            // Filter by status if provided
            if (filter?.status && filter.status.length > 0) {
              sandboxes = sandboxes.filter(s => filter.status!.includes(s.status));
            }
            
            return sandboxes.map(s => ({
              ...s,
              urls: { opencode: s.opencodeUrl || '' },
            }));
          },
          
          getSandboxStatus: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            return sandbox.status;
          },
          
          getSandboxLogs: async (id: string, options?: any) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id, logs: ['Log line 1', 'Log line 2', 'Log line 3'] });
            return mockOrchestrator.getLogs(id, options);
          },
          
          getSandboxStats: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id });
            return mockOrchestrator.getSandboxStats(id);
          },
          
          exec: async (id: string, command: string[], options?: any) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            
            addMockSandbox({ id });
            return mockOrchestrator.exec(id, command, options);
          },
          
          // Git operations
          commitChanges: async (id: string, message: string, author?: any) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            if (!sandbox.repoName) throw new Error(`Sandbox has no repository: ${id}`);
            
            addMockRepo({ name: sandbox.repoName });
            return mockGitBackend.commit(sandbox.repoName, { message, author });
          },
          
          getGitStatus: async (id: string) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            if (!sandbox.repoName) throw new Error(`Sandbox has no repository: ${id}`);
            
            addMockRepo({ name: sandbox.repoName });
            return mockGitBackend.getStatus(sandbox.repoName);
          },
          
          getGitLog: async (id: string, options?: any) => {
            const sandbox = SandboxModel.getSandboxById(id);
            if (!sandbox) throw new Error(`Sandbox not found: ${id}`);
            if (!sandbox.repoName) throw new Error(`Sandbox has no repository: ${id}`);
            
            addMockRepo({ name: sandbox.repoName });
            return mockGitBackend.getLog(sandbox.repoName, options);
          },
          
          // Health check operations
          healthCheck: async () => mockOrchestrator.healthCheck(),
          getDockerInfo: async () => mockOrchestrator.getInfo(),
        };
      }
      return mockManager;
    },
  };
});

// Import app after mocking
import app from '../../src/index';

// =============================================================================
// Test Constants
// =============================================================================

const TEST_USER_ID = 'test-user-sandbox-routes-001';
const TEST_USER_ID_2 = 'test-user-sandbox-routes-002';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Helper to make requests to the app
 */
async function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
  } = {}
) {
  const { method = 'GET', body, auth = true } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (auth) {
    headers['Authorization'] = 'Bearer test-token';
  }
  
  const response = await app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  );
  
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  
  return { status: response.status, data };
}

/**
 * Helper to create a test user in the database
 */
async function createTestUser(id: string): Promise<void> {
  const now = new Date();
  await db.insert(user).values({
    id,
    name: `Test User ${id}`,
    email: `${id}@test.com`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

/**
 * Helper to delete a test user
 */
async function deleteTestUser(id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id));
}

/**
 * Helper to clean up test sandboxes
 */
async function cleanupTestSandboxes(): Promise<void> {
  try {
    const sandboxes = await SandboxModel.listAllSandboxes();
    for (const s of sandboxes) {
      if (s.id.startsWith('sandbox-') || s.id.startsWith('test-')) {
        await SandboxModel.deleteSandbox(s.id);
      }
    }
  } catch (e) {
    // Ignore errors during cleanup
  }
}

// =============================================================================
// Setup & Teardown
// =============================================================================

beforeAll(async () => {
  // Create test users
  await createTestUser(TEST_USER_ID);
  await createTestUser(TEST_USER_ID_2);
});

afterAll(async () => {
  // Clean up test data
  await cleanupTestSandboxes();
  await deleteTestUser(TEST_USER_ID);
  await deleteTestUser(TEST_USER_ID_2);
});

beforeEach(async () => {
  // Reset mocks before each test
  resetDockerMock();
  resetGitMock();
  await cleanupTestSandboxes();
});

afterEach(async () => {
  // Clean up after each test
  await cleanupTestSandboxes();
});

// =============================================================================
// Tests: Authentication
// =============================================================================

describe('Sandbox Routes Authentication', () => {
  test('GET /api/v2/sandboxes should require authentication', async () => {
    const { status } = await request('/api/v2/sandboxes', { auth: false });
    expect(status).toBe(401);
  });

  test('POST /api/v2/sandboxes should require authentication', async () => {
    const { status } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: { name: 'test', userId: TEST_USER_ID },
      auth: false,
    });
    expect(status).toBe(401);
  });

  test('should reject invalid authorization token', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/v2/sandboxes', {
        headers: {
          'Authorization': 'Bearer invalid-token',
        },
      })
    );
    expect(response.status).toBe(401);
  });
});

// =============================================================================
// Tests: List Sandboxes
// =============================================================================

describe('GET /api/v2/sandboxes - List Sandboxes', () => {
  test('should return empty list when no sandboxes exist', async () => {
    const { status, data } = await request('/api/v2/sandboxes');
    
    expect(status).toBe(200);
    expect((data as any).sandboxes).toBeDefined();
    expect((data as any).sandboxes).toEqual([]);
    expect((data as any).count).toBe(0);
  });

  test('should list all sandboxes', async () => {
    // Create test sandboxes
    SandboxModel.createSandbox({
      id: 'test-list-001',
      userId: TEST_USER_ID,
      name: 'Test Sandbox 1',
      slug: 'test-sandbox-1',
      repoName: 'test-repo-1',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    
    SandboxModel.createSandbox({
      id: 'test-list-002',
      userId: TEST_USER_ID,
      name: 'Test Sandbox 2',
      slug: 'test-sandbox-2',
      repoName: 'test-repo-2',
      resourceTierId: 'builder',
      flavorId: 'python',
      addonIds: [],
    });

    const { status, data } = await request('/api/v2/sandboxes');
    
    expect(status).toBe(200);
    expect((data as any).sandboxes.length).toBe(2);
    expect((data as any).count).toBe(2);
  });

  test('should filter sandboxes by userId', async () => {
    SandboxModel.createSandbox({
      id: 'test-filter-user-001',
      userId: TEST_USER_ID,
      name: 'User 1 Sandbox',
      slug: 'user-1-sandbox',
      repoName: 'user-1-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    
    SandboxModel.createSandbox({
      id: 'test-filter-user-002',
      userId: TEST_USER_ID_2,
      name: 'User 2 Sandbox',
      slug: 'user-2-sandbox',
      repoName: 'user-2-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });

    const { status, data } = await request(`/api/v2/sandboxes?userId=${TEST_USER_ID}`);
    
    expect(status).toBe(200);
    expect((data as any).sandboxes.length).toBe(1);
    expect((data as any).sandboxes[0].userId).toBe(TEST_USER_ID);
  });

  test('should filter sandboxes by status', async () => {
    SandboxModel.createSandbox({
      id: 'test-filter-status-001',
      userId: TEST_USER_ID,
      name: 'Running Sandbox',
      slug: 'running-sandbox',
      repoName: 'running-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    SandboxModel.updateSandboxStatus('test-filter-status-001', 'running');
    
    SandboxModel.createSandbox({
      id: 'test-filter-status-002',
      userId: TEST_USER_ID,
      name: 'Stopped Sandbox',
      slug: 'stopped-sandbox',
      repoName: 'stopped-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    SandboxModel.updateSandboxStatus('test-filter-status-002', 'stopped');

    const { status, data } = await request('/api/v2/sandboxes?status=running');
    
    expect(status).toBe(200);
    expect((data as any).sandboxes.length).toBe(1);
    expect((data as any).sandboxes[0].status).toBe('running');
  });
});

// =============================================================================
// Tests: Create Sandbox
// =============================================================================

describe('POST /api/v2/sandboxes - Create Sandbox', () => {
  test('should create a sandbox with minimal parameters', async () => {
    const { status, data } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        name: 'My New Sandbox',
        userId: TEST_USER_ID,
      },
    });
    
    expect(status).toBe(201);
    expect((data as any).sandbox).toBeDefined();
    expect((data as any).sandbox.name).toBe('My New Sandbox');
    expect((data as any).sandbox.userId).toBe(TEST_USER_ID);
    expect((data as any).repository).toBeDefined();
  });

  test('should create a sandbox with all parameters', async () => {
    const { status, data } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        name: 'Full Config Sandbox',
        description: 'A sandbox with all options',
        userId: TEST_USER_ID,
        flavor: 'python',
        resourceTier: 'builder',
        addons: ['code-server', 'vnc'],
        autoStart: true,
      },
    });
    
    expect(status).toBe(201);
    expect((data as any).sandbox.name).toBe('Full Config Sandbox');
    expect((data as any).sandbox.flavorId).toBe('python');
    expect((data as any).sandbox.resourceTierId).toBe('builder');
  });

  test('should reject sandbox with missing name', async () => {
    const { status, data } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        userId: TEST_USER_ID,
      },
    });
    
    expect(status).toBe(400);
  });

  test('should reject sandbox with missing userId', async () => {
    const { status, data } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        name: 'No User Sandbox',
      },
    });
    
    expect(status).toBe(400);
  });

  test('should reject sandbox with empty name', async () => {
    const { status } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        name: '',
        userId: TEST_USER_ID,
      },
    });
    
    expect(status).toBe(400);
  });

  test('should reject sandbox with name too long', async () => {
    const { status } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        name: 'a'.repeat(101),
        userId: TEST_USER_ID,
      },
    });
    
    expect(status).toBe(400);
  });

  test('should reject sandbox with invalid flavor', async () => {
    const { status } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        name: 'Invalid Flavor',
        userId: TEST_USER_ID,
        flavor: 'invalid-flavor',
      },
    });
    
    expect(status).toBe(400);
  });

  test('should reject sandbox with invalid resource tier', async () => {
    const { status } = await request('/api/v2/sandboxes', {
      method: 'POST',
      body: {
        name: 'Invalid Tier',
        userId: TEST_USER_ID,
        resourceTier: 'invalid-tier',
      },
    });
    
    expect(status).toBe(400);
  });
});

// =============================================================================
// Tests: Get Sandbox
// =============================================================================

describe('GET /api/v2/sandboxes/:id - Get Sandbox', () => {
  test('should get sandbox by ID', async () => {
    SandboxModel.createSandbox({
      id: 'test-get-001',
      userId: TEST_USER_ID,
      name: 'Get Test Sandbox',
      slug: 'get-test-sandbox',
      repoName: 'get-test-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: ['code-server'],
    });

    const { status, data } = await request('/api/v2/sandboxes/test-get-001');
    
    expect(status).toBe(200);
    expect((data as any).sandbox.id).toBe('test-get-001');
    expect((data as any).sandbox.name).toBe('Get Test Sandbox');
  });

  test('should return 404 for non-existent sandbox', async () => {
    const { status, data } = await request('/api/v2/sandboxes/non-existent-id');
    
    expect(status).toBe(404);
    expect((data as any).error).toBe('Sandbox not found');
  });
});

// =============================================================================
// Tests: Delete Sandbox
// =============================================================================

describe('DELETE /api/v2/sandboxes/:id - Delete Sandbox', () => {
  test('should delete a sandbox', async () => {
    SandboxModel.createSandbox({
      id: 'test-delete-001',
      userId: TEST_USER_ID,
      name: 'Delete Test Sandbox',
      slug: 'delete-test-sandbox',
      repoName: 'delete-test-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    addMockSandbox({ id: 'test-delete-001' });

    const { status, data } = await request('/api/v2/sandboxes/test-delete-001', {
      method: 'DELETE',
    });
    
    expect(status).toBe(200);
    expect((data as any).success).toBe(true);
    
    // Verify sandbox is deleted
    const sandbox = SandboxModel.getSandboxById('test-delete-001');
    expect(sandbox).toBeNull();
  });

  test('should delete sandbox with removeVolumes option', async () => {
    SandboxModel.createSandbox({
      id: 'test-delete-volumes-001',
      userId: TEST_USER_ID,
      name: 'Delete Volumes Test',
      slug: 'delete-volumes-test',
      repoName: 'delete-volumes-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    addMockSandbox({ id: 'test-delete-volumes-001' });

    const { status } = await request('/api/v2/sandboxes/test-delete-volumes-001?removeVolumes=true', {
      method: 'DELETE',
    });
    
    expect(status).toBe(200);
    expect(dockerMockCalls.deleteSandbox).toContainEqual({
      id: 'test-delete-volumes-001',
      removeVolumes: true,
    });
  });

  test('should handle delete of non-existent sandbox', async () => {
    const { status, data } = await request('/api/v2/sandboxes/non-existent-delete', {
      method: 'DELETE',
    });
    
    expect(status).toBe(500);
    expect((data as any).error).toContain('Failed to delete sandbox');
  });
});

// =============================================================================
// Tests: Lifecycle Operations (Start, Stop, Restart, Pause, Unpause)
// =============================================================================

describe('Sandbox Lifecycle Operations', () => {
  const LIFECYCLE_SANDBOX_ID = 'test-lifecycle-001';

  beforeEach(() => {
    SandboxModel.createSandbox({
      id: LIFECYCLE_SANDBOX_ID,
      userId: TEST_USER_ID,
      name: 'Lifecycle Test Sandbox',
      slug: 'lifecycle-test-sandbox',
      repoName: 'lifecycle-test-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
  });

  describe('POST /api/v2/sandboxes/:id/start - Start Sandbox', () => {
    test('should start a stopped sandbox', async () => {
      SandboxModel.updateSandboxStatus(LIFECYCLE_SANDBOX_ID, 'stopped');

      const { status, data } = await request(`/api/v2/sandboxes/${LIFECYCLE_SANDBOX_ID}/start`, {
        method: 'POST',
      });
      
      expect(status).toBe(200);
      expect((data as any).message).toBe('Sandbox started');
      expect(dockerMockCalls.startSandbox).toContain(LIFECYCLE_SANDBOX_ID);
    });

    test('should return error for non-existent sandbox', async () => {
      const { status, data } = await request('/api/v2/sandboxes/non-existent/start', {
        method: 'POST',
      });
      
      expect(status).toBe(500);
      expect((data as any).error).toContain('Failed to start sandbox');
    });
  });

  describe('POST /api/v2/sandboxes/:id/stop - Stop Sandbox', () => {
    test('should stop a running sandbox', async () => {
      SandboxModel.updateSandboxStatus(LIFECYCLE_SANDBOX_ID, 'running');

      const { status, data } = await request(`/api/v2/sandboxes/${LIFECYCLE_SANDBOX_ID}/stop`, {
        method: 'POST',
      });
      
      expect(status).toBe(200);
      expect((data as any).message).toBe('Sandbox stopped');
    });

    test('should stop sandbox with custom timeout', async () => {
      SandboxModel.updateSandboxStatus(LIFECYCLE_SANDBOX_ID, 'running');

      const { status } = await request(`/api/v2/sandboxes/${LIFECYCLE_SANDBOX_ID}/stop?timeout=30`, {
        method: 'POST',
      });
      
      expect(status).toBe(200);
      expect(dockerMockCalls.stopSandbox).toContainEqual({
        id: LIFECYCLE_SANDBOX_ID,
        timeout: 30,
      });
    });
  });

  describe('POST /api/v2/sandboxes/:id/restart - Restart Sandbox', () => {
    test('should restart a sandbox', async () => {
      SandboxModel.updateSandboxStatus(LIFECYCLE_SANDBOX_ID, 'running');

      const { status, data } = await request(`/api/v2/sandboxes/${LIFECYCLE_SANDBOX_ID}/restart`, {
        method: 'POST',
      });
      
      expect(status).toBe(200);
      expect((data as any).message).toBe('Sandbox restarted');
    });

    test('should restart sandbox with custom timeout', async () => {
      SandboxModel.updateSandboxStatus(LIFECYCLE_SANDBOX_ID, 'running');

      const { status } = await request(`/api/v2/sandboxes/${LIFECYCLE_SANDBOX_ID}/restart?timeout=20`, {
        method: 'POST',
      });
      
      expect(status).toBe(200);
      expect(dockerMockCalls.restartSandbox).toContainEqual({
        id: LIFECYCLE_SANDBOX_ID,
        timeout: 20,
      });
    });
  });

  describe('POST /api/v2/sandboxes/:id/pause - Pause Sandbox', () => {
    test('should pause a running sandbox', async () => {
      SandboxModel.updateSandboxStatus(LIFECYCLE_SANDBOX_ID, 'running');

      const { status, data } = await request(`/api/v2/sandboxes/${LIFECYCLE_SANDBOX_ID}/pause`, {
        method: 'POST',
      });
      
      expect(status).toBe(200);
      expect((data as any).message).toBe('Sandbox paused');
      expect(dockerMockCalls.pauseSandbox).toContain(LIFECYCLE_SANDBOX_ID);
    });
  });

  describe('POST /api/v2/sandboxes/:id/unpause - Unpause Sandbox', () => {
    test('should unpause a paused sandbox', async () => {
      SandboxModel.updateSandboxStatus(LIFECYCLE_SANDBOX_ID, 'stopped');

      const { status, data } = await request(`/api/v2/sandboxes/${LIFECYCLE_SANDBOX_ID}/unpause`, {
        method: 'POST',
      });
      
      expect(status).toBe(200);
      expect((data as any).message).toBe('Sandbox unpaused');
      expect(dockerMockCalls.unpauseSandbox).toContain(LIFECYCLE_SANDBOX_ID);
    });
  });
});

// =============================================================================
// Tests: Logs and Stats
// =============================================================================

describe('Sandbox Logs and Stats', () => {
  const LOGS_SANDBOX_ID = 'test-logs-001';

  beforeEach(() => {
    SandboxModel.createSandbox({
      id: LOGS_SANDBOX_ID,
      userId: TEST_USER_ID,
      name: 'Logs Test Sandbox',
      slug: 'logs-test-sandbox',
      repoName: 'logs-test-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    SandboxModel.updateSandboxStatus(LOGS_SANDBOX_ID, 'running');
  });

  describe('GET /api/v2/sandboxes/:id/logs - Get Logs', () => {
    test('should get sandbox logs', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${LOGS_SANDBOX_ID}/logs`);
      
      expect(status).toBe(200);
      expect((data as any).logs).toBeDefined();
      expect((data as any).tail).toBeDefined();
    });

    test('should get logs with tail parameter', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${LOGS_SANDBOX_ID}/logs?tail=50`);
      
      expect(status).toBe(200);
      expect((data as any).tail).toBe(50);
    });

    test('should reject invalid tail parameter', async () => {
      const { status } = await request(`/api/v2/sandboxes/${LOGS_SANDBOX_ID}/logs?tail=0`);
      
      expect(status).toBe(400);
    });

    test('should reject tail parameter exceeding max', async () => {
      const { status } = await request(`/api/v2/sandboxes/${LOGS_SANDBOX_ID}/logs?tail=20000`);
      
      expect(status).toBe(400);
    });
  });

  describe('GET /api/v2/sandboxes/:id/stats - Get Stats', () => {
    test('should get sandbox stats', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${LOGS_SANDBOX_ID}/stats`);
      
      expect(status).toBe(200);
      expect((data as any).stats).toBeDefined();
      expect((data as any).stats.cpuPercent).toBeDefined();
      expect((data as any).stats.memoryUsage).toBeDefined();
      expect((data as any).stats.memoryLimit).toBeDefined();
    });

    test('should return error for non-existent sandbox stats', async () => {
      const { status } = await request('/api/v2/sandboxes/non-existent/stats');
      
      expect(status).toBe(500);
    });
  });
});

// =============================================================================
// Tests: Status Endpoint
// =============================================================================

describe('GET /api/v2/sandboxes/:id/status - Get Status', () => {
  test('should get sandbox status', async () => {
    SandboxModel.createSandbox({
      id: 'test-status-001',
      userId: TEST_USER_ID,
      name: 'Status Test Sandbox',
      slug: 'status-test-sandbox',
      repoName: 'status-test-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    SandboxModel.updateSandboxStatus('test-status-001', 'running');

    const { status, data } = await request('/api/v2/sandboxes/test-status-001/status');
    
    expect(status).toBe(200);
    expect((data as any).status).toBe('running');
  });

  test('should return error for non-existent sandbox', async () => {
    const { status, data } = await request('/api/v2/sandboxes/non-existent/status');
    
    expect(status).toBe(500);
    expect((data as any).error).toContain('Failed to get status');
  });
});

// =============================================================================
// Tests: Command Execution
// =============================================================================

describe('POST /api/v2/sandboxes/:id/exec - Execute Command', () => {
  const EXEC_SANDBOX_ID = 'test-exec-001';

  beforeEach(() => {
    SandboxModel.createSandbox({
      id: EXEC_SANDBOX_ID,
      userId: TEST_USER_ID,
      name: 'Exec Test Sandbox',
      slug: 'exec-test-sandbox',
      repoName: 'exec-test-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    SandboxModel.updateSandboxStatus(EXEC_SANDBOX_ID, 'running');
  });

  test('should execute a command in sandbox', async () => {
    const { status, data } = await request(`/api/v2/sandboxes/${EXEC_SANDBOX_ID}/exec`, {
      method: 'POST',
      body: {
        command: ['ls', '-la'],
      },
    });
    
    expect(status).toBe(200);
    expect((data as any).exitCode).toBe(0);
    expect((data as any).stdout).toBeDefined();
    expect((data as any).stderr).toBeDefined();
  });

  test('should execute command with working directory', async () => {
    const { status, data } = await request(`/api/v2/sandboxes/${EXEC_SANDBOX_ID}/exec`, {
      method: 'POST',
      body: {
        command: ['pwd'],
        workingDir: '/workspace',
      },
    });
    
    expect(status).toBe(200);
    expect(dockerMockCalls.exec).toContainEqual({
      id: EXEC_SANDBOX_ID,
      command: ['pwd'],
      options: { workingDir: '/workspace', env: undefined, user: undefined },
    });
  });

  test('should execute command with environment variables', async () => {
    const { status } = await request(`/api/v2/sandboxes/${EXEC_SANDBOX_ID}/exec`, {
      method: 'POST',
      body: {
        command: ['echo', '$MY_VAR'],
        env: { MY_VAR: 'test-value' },
      },
    });
    
    expect(status).toBe(200);
  });

  test('should reject exec with missing command', async () => {
    const { status } = await request(`/api/v2/sandboxes/${EXEC_SANDBOX_ID}/exec`, {
      method: 'POST',
      body: {},
    });
    
    expect(status).toBe(400);
  });

  test('should reject exec with empty command array', async () => {
    const { status } = await request(`/api/v2/sandboxes/${EXEC_SANDBOX_ID}/exec`, {
      method: 'POST',
      body: {
        command: [],
      },
    });
    
    expect(status).toBe(400);
  });
});

// =============================================================================
// Tests: Git Operations
// =============================================================================

describe('Sandbox Git Operations', () => {
  const GIT_SANDBOX_ID = 'test-git-001';

  beforeEach(() => {
    SandboxModel.createSandbox({
      id: GIT_SANDBOX_ID,
      userId: TEST_USER_ID,
      name: 'Git Test Sandbox',
      slug: 'git-test-sandbox',
      repoName: 'git-test-repo',
      resourceTierId: 'starter',
      flavorId: 'js',
      addonIds: [],
    });
    SandboxModel.updateSandboxStatus(GIT_SANDBOX_ID, 'running');
  });

  describe('POST /api/v2/sandboxes/:id/git/commit - Commit Changes', () => {
    test('should commit changes with message', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/commit`, {
        method: 'POST',
        body: {
          message: 'Add new feature',
        },
      });
      
      expect(status).toBe(200);
      expect((data as any).sha).toBeDefined();
      expect((data as any).message).toBe('Changes committed');
    });

    test('should commit with author information', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/commit`, {
        method: 'POST',
        body: {
          message: 'Add feature',
          author: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        },
      });
      
      expect(status).toBe(200);
      expect(gitMockCalls.commit).toContainEqual({
        repoName: 'git-test-repo',
        options: {
          message: 'Add feature',
          author: { name: 'John Doe', email: 'john@example.com' },
        },
      });
    });

    test('should reject commit with missing message', async () => {
      const { status } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/commit`, {
        method: 'POST',
        body: {},
      });
      
      expect(status).toBe(400);
    });

    test('should reject commit with empty message', async () => {
      const { status } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/commit`, {
        method: 'POST',
        body: { message: '' },
      });
      
      expect(status).toBe(400);
    });

    test('should reject commit with invalid author email', async () => {
      const { status } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/commit`, {
        method: 'POST',
        body: {
          message: 'Test',
          author: {
            name: 'John',
            email: 'not-an-email',
          },
        },
      });
      
      expect(status).toBe(400);
    });
  });

  describe('GET /api/v2/sandboxes/:id/git/status - Get Git Status', () => {
    test('should get git status', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/status`);
      
      expect(status).toBe(200);
      expect((data as any).files).toBeDefined();
      expect(Array.isArray((data as any).files)).toBe(true);
    });
  });

  describe('GET /api/v2/sandboxes/:id/git/log - Get Git Log', () => {
    test('should get git log', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/log`);
      
      expect(status).toBe(200);
      expect((data as any).commits).toBeDefined();
      expect(Array.isArray((data as any).commits)).toBe(true);
    });

    test('should get git log with limit', async () => {
      const { status, data } = await request(`/api/v2/sandboxes/${GIT_SANDBOX_ID}/git/log?limit=5`);
      
      expect(status).toBe(200);
      expect(gitMockCalls.getLog).toContainEqual({
        repoName: 'git-test-repo',
        options: { limit: 5 },
      });
    });
  });
});

// =============================================================================
// Tests: Docker Health Check
// =============================================================================

describe('GET /api/v2/health/docker - Docker Health Check', () => {
  test('should return healthy status when Docker is available', async () => {
    setMockDockerHealth(true);

    const { status, data } = await request('/api/v2/health/docker');
    
    expect(status).toBe(200);
    expect((data as any).status).toBe('healthy');
    expect((data as any).docker).toBeDefined();
    expect((data as any).docker.version).toBeDefined();
    expect((data as any).docker.apiVersion).toBeDefined();
  });

  test('should return unhealthy status when Docker is unavailable', async () => {
    setMockDockerHealth(false);

    const { status, data } = await request('/api/v2/health/docker');
    
    expect(status).toBe(503);
    expect((data as any).status).toBe('unhealthy');
  });
});
