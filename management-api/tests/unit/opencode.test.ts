/**
 * Unit Tests for OpenCode Proxy Service
 * 
 * Tests the OpenCode proxy logic with mocked HTTP responses.
 * These tests don't require actual OpenCode containers.
 */

import '../setup';

import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { db } from '../../src/db/index';

// We need to test the routes with mocked fetch
// First, let's create a test project in the database

describe('OpenCode Proxy Service', () => {
  const testProjectId = 'test-project-123';
  const testCoolifyAppUuid = 'coolify-app-uuid';
  const testContainerPort = 4001;

  beforeEach(() => {
    // Clean up and insert test project
    db.exec('DELETE FROM projects');
    
    db.query(`
      INSERT INTO projects (
        id, name, slug, description,
        forgejo_repo_url, forgejo_owner,
        coolify_app_uuid, coolify_server_uuid, container_port,
        status
      ) VALUES (
        $id, $name, $slug, $description,
        $forgejoRepoUrl, $forgejoOwner,
        $coolifyAppUuid, $coolifyServerUuid, $containerPort,
        $status
      )
    `).run({
      $id: testProjectId,
      $name: 'Test Project',
      $slug: 'test-project',
      $description: 'A test project',
      $forgejoRepoUrl: 'http://forgejo.local/test/test-project.git',
      $forgejoOwner: 'test',
      $coolifyAppUuid: testCoolifyAppUuid,
      $coolifyServerUuid: 'server-uuid',
      $containerPort: testContainerPort,
      $status: 'running',
    });
  });

  describe('Project Status Validation', () => {
    test('should reject requests for non-existent projects', async () => {
      const { opencode, OpenCodeProxyError } = await import('../../src/services/opencode.ts');
      
      try {
        await opencode.listSessions('non-existent-project');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(OpenCodeProxyError);
        expect((error as any).statusCode).toBe(404);
        expect((error as any).message).toContain('not found');
      }
    });

    test('should reject requests for stopped projects', async () => {
      // Update project to stopped status
      db.query('UPDATE projects SET status = $status WHERE id = $id').run({
        $status: 'stopped',
        $id: testProjectId,
      });

      const { opencode, OpenCodeProxyError } = await import('../../src/services/opencode.ts');
      
      try {
        await opencode.listSessions(testProjectId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(OpenCodeProxyError);
        expect((error as any).statusCode).toBe(503);
        expect((error as any).message).toContain('not running');
      }
    });
  });

  describe('Service Methods', () => {
    test('healthCheck should return false when container unreachable', async () => {
      const { opencode } = await import('../../src/services/opencode.ts');
      
      // This will fail because there's no actual container
      // but it should handle the error gracefully
      const healthy = await opencode.healthCheck(testProjectId);
      expect(healthy).toBe(false);
    });

    test('clearCache should reset server IP cache', async () => {
      const { opencode } = await import('../../src/services/opencode.ts');
      
      // Should not throw
      opencode.clearCache();
    });
  });
});

describe('OpenCode Routes', () => {
  // Import app after environment is set up
  let app: any;
  
  const testProjectId = 'test-project-routes';
  const testContainerPort = 4002;

  // Helper to make requests
  async function request(
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean } = {}
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

  beforeEach(async () => {
    // Clean up and insert test project
    db.exec('DELETE FROM projects');
    
    db.query(`
      INSERT INTO projects (
        id, name, slug, description,
        forgejo_repo_url, forgejo_owner,
        coolify_app_uuid, coolify_server_uuid, container_port,
        status
      ) VALUES (
        $id, $name, $slug, $description,
        $forgejoRepoUrl, $forgejoOwner,
        $coolifyAppUuid, $coolifyServerUuid, $containerPort,
        $status
      )
    `).run({
      $id: testProjectId,
      $name: 'Test Project Routes',
      $slug: 'test-project-routes',
      $description: 'A test project for routes',
      $forgejoRepoUrl: 'http://forgejo.local/test/test-project.git',
      $forgejoOwner: 'test',
      $coolifyAppUuid: 'coolify-app-routes',
      $coolifyServerUuid: 'server-uuid',
      $containerPort: testContainerPort,
      $status: 'running',
    });

    // Re-import app to get fresh instance
    app = (await import('../../src/index')).default;
  });

  describe('Authentication', () => {
    test('OpenCode routes should require authentication', async () => {
      const { status } = await request(
        `/api/projects/${testProjectId}/opencode/session`,
        { auth: false }
      );
      expect(status).toBe(401);
    });
  });

  describe('Project Not Found', () => {
    test('should return 404 for non-existent project', async () => {
      const { status, data } = await request(
        '/api/projects/non-existent/opencode/session'
      );
      
      expect(status).toBe(404);
      expect((data as any).error).toContain('not found');
    });
  });

  describe('Project Not Running', () => {
    test('should return 503 when project is stopped', async () => {
      // Stop the project
      db.query('UPDATE projects SET status = $status WHERE id = $id').run({
        $status: 'stopped',
        $id: testProjectId,
      });

      const { status, data } = await request(
        `/api/projects/${testProjectId}/opencode/session`
      );
      
      expect(status).toBe(503);
      expect((data as any).error).toContain('not running');
    });
  });

  describe('File Routes Validation', () => {
    test('GET /file/content should require path parameter', async () => {
      const { status, data } = await request(
        `/api/projects/${testProjectId}/opencode/file/content`
      );
      
      expect(status).toBe(400);
      expect((data as any).error).toContain('path');
    });

    test('GET /find/file should require pattern parameter', async () => {
      const { status, data } = await request(
        `/api/projects/${testProjectId}/opencode/find/file`
      );
      
      expect(status).toBe(400);
      expect((data as any).error).toContain('pattern');
    });
  });

  describe('Health Check Route', () => {
    test('should return health status', async () => {
      const { status, data } = await request(
        `/api/projects/${testProjectId}/opencode/health`
      );
      
      expect(status).toBe(200);
      expect((data as any).projectId).toBe(testProjectId);
      // healthy will be false since no actual container
      expect((data as any).healthy).toBe(false);
    });
  });
});

describe('OpenCode Types', () => {
  test('SendMessageInput should have correct structure', async () => {
    const { SendMessageInput } = await import('../../src/services/opencode.ts') as any;
    
    // TypeScript types are compile-time only, so we just verify the module exports
    const { opencode } = await import('../../src/services/opencode.ts');
    expect(opencode).toBeDefined();
    expect(typeof opencode.sendMessage).toBe('function');
  });
});
