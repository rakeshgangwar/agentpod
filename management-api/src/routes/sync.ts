/**
 * Sync Routes
 * Handle GitHub synchronization for projects
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getProjectById, updateProject } from '../models/project.ts';
import { forgejo } from '../services/forgejo.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('sync');

// =============================================================================
// Validation Schemas
// =============================================================================

const syncConfigSchema = z.object({
  githubUrl: z.string().url().optional(),
  syncEnabled: z.boolean().optional(),
  syncDirection: z.enum(['push', 'pull', 'bidirectional']).optional(),
});

// =============================================================================
// Routes
// =============================================================================

export const syncRoutes = new Hono()
  /**
   * GET /api/projects/:id/sync/status
   * Get sync status for a project
   */
  .get('/:id/sync/status', (c) => {
    const id = c.req.param('id');
    const project = getProjectById(id);
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    return c.json({
      projectId: project.id,
      githubRepoUrl: project.githubRepoUrl,
      syncEnabled: project.githubSyncEnabled,
      syncDirection: project.githubSyncDirection,
      lastSyncAt: project.lastSyncAt,
    });
  })

  /**
   * POST /api/projects/:id/sync/config
   * Configure sync settings for a project
   */
  .post('/:id/sync/config', zValidator('json', syncConfigSchema), (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    
    const project = getProjectById(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    const updates: Record<string, unknown> = {};
    
    if (body.githubUrl !== undefined) {
      updates.githubRepoUrl = body.githubUrl;
    }
    if (body.syncEnabled !== undefined) {
      updates.githubSyncEnabled = body.syncEnabled;
    }
    if (body.syncDirection !== undefined) {
      updates.githubSyncDirection = body.syncDirection;
    }
    
    // Note: updateProject expects camelCase keys matching UpdateProjectInput
    // We need to map them correctly
    const updated = updateProject(id, {
      githubSyncEnabled: body.syncEnabled,
      githubSyncDirection: body.syncDirection,
    });
    
    return c.json({
      project: updated,
      message: 'Sync configuration updated',
    });
  })

  /**
   * POST /api/projects/:id/sync
   * Trigger a sync operation
   * 
   * Note: For MVP, this uses Forgejo's mirror-sync for mirrored repos.
   * Full bidirectional sync requires more complex git operations.
   */
  .post('/:id/sync', async (c) => {
    const id = c.req.param('id');
    const project = getProjectById(id);
    
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    if (!project.githubRepoUrl) {
      return c.json({ 
        error: 'No GitHub repository configured for this project' 
      }, 400);
    }
    
    if (!project.githubSyncEnabled) {
      return c.json({ 
        error: 'GitHub sync is not enabled for this project' 
      }, 400);
    }
    
    log.info('Starting sync', { projectId: id, direction: project.githubSyncDirection });
    
    try {
      // For now, we only support pull (from GitHub to Forgejo) via mirror-sync
      // This works if the repo was created as a mirror
      if (project.githubSyncDirection === 'pull' || project.githubSyncDirection === 'bidirectional') {
        await forgejo.syncMirror(project.forgejoOwner, project.slug);
      }
      
      // Update last sync timestamp
      updateProject(id, { lastSyncAt: new Date().toISOString() });
      
      log.info('Sync completed', { projectId: id });
      
      return c.json({
        success: true,
        message: 'Sync initiated',
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      log.error('Sync failed', { projectId: id, error });
      
      return c.json({
        success: false,
        error: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }, 500);
    }
  });
