/**
 * Unit Tests for Project Model
 * 
 * Run with: bun test tests/unit/project.test.ts
 */

// IMPORTANT: Import setup first to set environment variables
import '../setup';

import { describe, test, expect, beforeEach } from 'bun:test';

// Now import the modules that depend on config/db
import { db, initDatabase } from '../../src/db/index';
import {
  createProject,
  getProjectById,
  getProjectBySlug,
  listProjects,
  updateProject,
  deleteProject,
  updateProjectStatus,
  slugExists,
  generateUniqueSlug,
  type CreateProjectInput,
} from '../../src/models/project';

// Initialize database once at module load
initDatabase();

describe('Project Model', () => {
  beforeEach(() => {
    // Clean projects table before each test
    db.exec('DELETE FROM projects');
  });

  describe('createProject', () => {
    test('should create a project with required fields', () => {
      const input: CreateProjectInput = {
        name: 'Test Project',
        forgejoRepoUrl: 'http://forgejo.local/user/test-project.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-uuid-123',
        coolifyServerUuid: 'server-uuid-456',
        containerPort: 4001,
      };

      const project = createProject(input);

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test Project');
      expect(project.slug).toBe('test-project');
      expect(project.status).toBe('creating');
      expect(project.forgejoRepoUrl).toBe(input.forgejoRepoUrl);
      expect(project.coolifyAppUuid).toBe(input.coolifyAppUuid);
    });

    test('should create a project with optional fields', () => {
      const input: CreateProjectInput = {
        name: 'Full Project',
        description: 'A full test project',
        forgejoRepoUrl: 'http://forgejo.local/user/full-project.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-uuid-789',
        coolifyServerUuid: 'server-uuid-456',
        containerPort: 4002,
        githubRepoUrl: 'https://github.com/user/repo',
        githubSyncEnabled: true,
        githubSyncDirection: 'push',
        llmProvider: 'anthropic',
      };

      const project = createProject(input);

      expect(project.description).toBe('A full test project');
      expect(project.githubRepoUrl).toBe('https://github.com/user/repo');
      expect(project.githubSyncEnabled).toBe(true);
      expect(project.llmProvider).toBe('anthropic');
    });

    test('should generate slug from name', () => {
      const input: CreateProjectInput = {
        name: 'My Awesome Project 123',
        forgejoRepoUrl: 'http://forgejo.local/user/test.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-1',
        coolifyServerUuid: 'server-1',
        containerPort: 4003,
      };

      const project = createProject(input);

      expect(project.slug).toBe('my-awesome-project-123');
    });

    test('should handle special characters in name for slug', () => {
      const input: CreateProjectInput = {
        name: 'Test @#$ Special!!!',
        forgejoRepoUrl: 'http://forgejo.local/user/special.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-special',
        coolifyServerUuid: 'server-1',
        containerPort: 4004,
      };

      const project = createProject(input);

      expect(project.slug).toBe('test-special');
    });
  });

  describe('getProjectById', () => {
    test('should return project by id', () => {
      const input: CreateProjectInput = {
        name: 'Find Me',
        forgejoRepoUrl: 'http://forgejo.local/user/find-me.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-find',
        coolifyServerUuid: 'server-1',
        containerPort: 4005,
      };

      const created = createProject(input);
      const found = getProjectById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('Find Me');
    });

    test('should return null for non-existent id', () => {
      const found = getProjectById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('getProjectBySlug', () => {
    test('should return project by slug', () => {
      const input: CreateProjectInput = {
        name: 'Slug Test',
        forgejoRepoUrl: 'http://forgejo.local/user/slug-test.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-slug',
        coolifyServerUuid: 'server-1',
        containerPort: 4006,
      };

      createProject(input);
      const found = getProjectBySlug('slug-test');

      expect(found).toBeDefined();
      expect(found!.name).toBe('Slug Test');
    });

    test('should return null for non-existent slug', () => {
      const found = getProjectBySlug('does-not-exist');
      expect(found).toBeNull();
    });
  });

  describe('listProjects', () => {
    test('should return all projects', () => {
      createProject({
        name: 'Project 1',
        forgejoRepoUrl: 'http://forgejo.local/user/p1.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-1',
        coolifyServerUuid: 'server-1',
        containerPort: 4007,
      });

      createProject({
        name: 'Project 2',
        forgejoRepoUrl: 'http://forgejo.local/user/p2.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-2',
        coolifyServerUuid: 'server-1',
        containerPort: 4008,
      });

      const projects = listProjects();

      expect(projects).toHaveLength(2);
    });

    test('should return empty array when no projects', () => {
      const projects = listProjects();
      expect(projects).toHaveLength(0);
    });

    test('should return projects ordered by created_at DESC', () => {
      createProject({
        name: 'First',
        forgejoRepoUrl: 'http://forgejo.local/user/first.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-first',
        coolifyServerUuid: 'server-1',
        containerPort: 4009,
      });

      createProject({
        name: 'Second',
        forgejoRepoUrl: 'http://forgejo.local/user/second.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-second',
        coolifyServerUuid: 'server-1',
        containerPort: 4010,
      });

      const projects = listProjects();

      // Most recent first
      expect(projects[0].name).toBe('Second');
      expect(projects[1].name).toBe('First');
    });
  });

  describe('updateProject', () => {
    test('should update project fields', () => {
      const created = createProject({
        name: 'Update Me',
        forgejoRepoUrl: 'http://forgejo.local/user/update.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-update',
        coolifyServerUuid: 'server-1',
        containerPort: 4011,
      });

      const updated = updateProject(created.id, {
        name: 'Updated Name',
        description: 'New description',
        status: 'running',
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.description).toBe('New description');
      expect(updated!.status).toBe('running');
    });

    test('should only update provided fields', () => {
      const created = createProject({
        name: 'Partial Update',
        description: 'Original description',
        forgejoRepoUrl: 'http://forgejo.local/user/partial.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-partial',
        coolifyServerUuid: 'server-1',
        containerPort: 4012,
      });

      const updated = updateProject(created.id, { name: 'New Name' });

      expect(updated!.name).toBe('New Name');
      expect(updated!.description).toBe('Original description'); // Unchanged
    });

    test('should return null for non-existent project', () => {
      const updated = updateProject('non-existent', { name: 'Test' });
      expect(updated).toBeNull();
    });
  });

  describe('deleteProject', () => {
    test('should delete project and return true', () => {
      const created = createProject({
        name: 'Delete Me',
        forgejoRepoUrl: 'http://forgejo.local/user/delete.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-delete',
        coolifyServerUuid: 'server-1',
        containerPort: 4013,
      });

      const deleted = deleteProject(created.id);

      expect(deleted).toBe(true);
      expect(getProjectById(created.id)).toBeNull();
    });

    test('should return false for non-existent project', () => {
      const deleted = deleteProject('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('updateProjectStatus', () => {
    test('should update status', () => {
      const created = createProject({
        name: 'Status Test',
        forgejoRepoUrl: 'http://forgejo.local/user/status.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-status',
        coolifyServerUuid: 'server-1',
        containerPort: 4014,
      });

      const updated = updateProjectStatus(created.id, 'running');

      expect(updated!.status).toBe('running');
    });

    test('should update status with error message', () => {
      const created = createProject({
        name: 'Error Test',
        forgejoRepoUrl: 'http://forgejo.local/user/error.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-error',
        coolifyServerUuid: 'server-1',
        containerPort: 4015,
      });

      const updated = updateProjectStatus(created.id, 'error', 'Something went wrong');

      expect(updated!.status).toBe('error');
      expect(updated!.errorMessage).toBe('Something went wrong');
    });
  });

  describe('slugExists', () => {
    test('should return true for existing slug', () => {
      createProject({
        name: 'Exists',
        forgejoRepoUrl: 'http://forgejo.local/user/exists.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-exists',
        coolifyServerUuid: 'server-1',
        containerPort: 4016,
      });

      expect(slugExists('exists')).toBe(true);
    });

    test('should return false for non-existent slug', () => {
      expect(slugExists('does-not-exist')).toBe(false);
    });
  });

  describe('generateUniqueSlug', () => {
    test('should return base slug if unique', () => {
      const slug = generateUniqueSlug('unique-name');
      expect(slug).toBe('unique-name');
    });

    test('should append number if slug exists', () => {
      createProject({
        name: 'Duplicate',
        forgejoRepoUrl: 'http://forgejo.local/user/duplicate.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-dup',
        coolifyServerUuid: 'server-1',
        containerPort: 4017,
      });

      const slug = generateUniqueSlug('Duplicate');
      expect(slug).toBe('duplicate-1');
    });

    test('should increment number for multiple duplicates', () => {
      createProject({
        name: 'multi',
        forgejoRepoUrl: 'http://forgejo.local/user/multi.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-multi',
        coolifyServerUuid: 'server-1',
        containerPort: 4018,
      });

      // Create multi-1
      createProject({
        name: 'multi-1',
        forgejoRepoUrl: 'http://forgejo.local/user/multi-1.git',
        forgejoOwner: 'testuser',
        coolifyAppUuid: 'app-multi-1',
        coolifyServerUuid: 'server-1',
        containerPort: 4019,
      });

      const slug = generateUniqueSlug('multi');
      expect(slug).toBe('multi-2');
    });
  });
});
