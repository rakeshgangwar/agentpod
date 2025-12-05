/**
 * Project Routes
 * CRUD operations for projects + container control
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  listProjects,
  getProjectById,
  updateProject,
} from '../models/project.ts';
import {
  createNewProject,
  startProject,
  stopProject,
  restartProject,
  getProjectWithStatus,
  deleteProjectFully,
  updateProjectCredentials,
} from '../services/project-manager.ts';
import { ApiError, ProjectNotFoundError } from '../utils/errors.ts';

// =============================================================================
// Validation Schemas
// =============================================================================

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  githubUrl: z.string().url().optional(),
  llmProviderId: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  llmProvider: z.string().optional(),
});

const deleteProjectSchema = z.object({
  deleteRepo: z.boolean().optional().default(true),
});

// =============================================================================
// Routes
// =============================================================================

export const projectRoutes = new Hono()
  /**
   * GET /api/projects
   * List all projects
   */
  .get('/', (c) => {
    const projects = listProjects();
    return c.json({ projects });
  })

  /**
   * GET /api/projects/:id
   * Get project by ID with live container status
   */
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    
    try {
      const project = await getProjectWithStatus(id);
      return c.json({ project });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
  })

  /**
   * POST /api/projects
   * Create a new project
   */
  .post('/', zValidator('json', createProjectSchema), async (c) => {
    const body = c.req.valid('json');
    
    try {
      const project = await createNewProject({
        name: body.name,
        description: body.description,
        githubUrl: body.githubUrl,
        llmProviderId: body.llmProviderId,
      });
      
      return c.json({ project }, 201);
    } catch (error) {
      if (error instanceof ApiError) {
        return c.json({ error: error.message, details: error.details }, error.statusCode);
      }
      throw error;
    }
  })

  /**
   * PATCH /api/projects/:id
   * Update project metadata
   */
  .patch('/:id', zValidator('json', updateProjectSchema), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    
    const project = getProjectById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const updated = updateProject(id, body);
    return c.json({ project: updated });
  })

  /**
   * DELETE /api/projects/:id
   * Delete project and associated resources
   */
  .delete('/:id', zValidator('json', deleteProjectSchema.optional()), async (c) => {
    const id = c.req.param('id');
    
    // Handle optional body - default to deleteRepo: true
    let deleteRepo = true;
    try {
      const body = await c.req.json();
      if (body && typeof body.deleteRepo === 'boolean') {
        deleteRepo = body.deleteRepo;
      }
    } catch {
      // No body provided, use default
    }
    
    try {
      await deleteProjectFully(id, { deleteRepo });
      return c.json({ success: true, message: 'Project deleted' });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
  })

  /**
   * POST /api/projects/:id/start
   * Start project container
   */
  .post('/:id/start', async (c) => {
    const id = c.req.param('id');
    
    try {
      const project = await startProject(id);
      return c.json({ project, message: 'Project starting' });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof ApiError) {
        return c.json({ error: error.message }, error.statusCode);
      }
      throw error;
    }
  })

  /**
   * POST /api/projects/:id/stop
   * Stop project container
   */
  .post('/:id/stop', async (c) => {
    const id = c.req.param('id');
    
    try {
      const project = await stopProject(id);
      return c.json({ project, message: 'Project stopping' });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof ApiError) {
        return c.json({ error: error.message }, error.statusCode);
      }
      throw error;
    }
  })

  /**
   * POST /api/projects/:id/restart
   * Restart project container
   */
  .post('/:id/restart', async (c) => {
    const id = c.req.param('id');
    
    try {
      const project = await restartProject(id);
      return c.json({ project, message: 'Project restarting' });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof ApiError) {
        return c.json({ error: error.message }, error.statusCode);
      }
      throw error;
    }
  })

  /**
   * POST /api/projects/:id/credentials
   * Update LLM credentials for project
   */
  .post('/:id/credentials', zValidator('json', z.object({
    providerId: z.string().optional(),
  })), async (c) => {
    const id = c.req.param('id');
    const { providerId } = c.req.valid('json');
    
    try {
      const project = await updateProjectCredentials(id, providerId);
      return c.json({ project, message: 'Credentials updated' });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof ApiError) {
        return c.json({ error: error.message }, error.statusCode);
      }
      throw error;
    }
  });
