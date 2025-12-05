/**
 * Provider Routes
 * Manage LLM provider configurations
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  listProviders,
  getProviderById,
  configureProvider,
  setDefaultProvider,
  removeProviderConfig,
  getDefaultProvider,
} from '../models/provider.ts';
import { ProviderNotFoundError } from '../utils/errors.ts';

// =============================================================================
// Validation Schemas
// =============================================================================

const configureProviderSchema = z.object({
  apiKey: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.string().optional(),
}).refine(
  (data) => data.apiKey || data.accessToken,
  { message: 'Either apiKey or accessToken must be provided' }
);

// =============================================================================
// Routes
// =============================================================================

export const providerRoutes = new Hono()
  /**
   * GET /api/providers
   * List all providers (summary only, no credentials exposed)
   */
  .get('/', (c) => {
    const providers = listProviders();
    return c.json({ providers });
  })

  /**
   * GET /api/providers/default
   * Get the default provider
   */
  .get('/default', (c) => {
    const provider = getDefaultProvider();
    if (!provider) {
      return c.json({ provider: null, message: 'No default provider set' });
    }
    
    // Return summary only (no credentials)
    return c.json({
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        isDefault: provider.isDefault,
        isConfigured: provider.isConfigured,
      }
    });
  })

  /**
   * GET /api/providers/:id
   * Get provider by ID (summary only)
   */
  .get('/:id', (c) => {
    const id = c.req.param('id');
    const provider = getProviderById(id);
    
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    // Return summary only (no credentials)
    return c.json({
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        isDefault: provider.isDefault,
        isConfigured: provider.isConfigured,
      }
    });
  })

  /**
   * POST /api/providers/:id/configure
   * Configure provider credentials
   */
  .post('/:id/configure', zValidator('json', configureProviderSchema), (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    
    const provider = configureProvider(id, body);
    
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    return c.json({
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        isDefault: provider.isDefault,
        isConfigured: provider.isConfigured,
      },
      message: 'Provider configured successfully',
    });
  })

  /**
   * POST /api/providers/:id/set-default
   * Set provider as default
   */
  .post('/:id/set-default', (c) => {
    const id = c.req.param('id');
    
    const existingProvider = getProviderById(id);
    if (!existingProvider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    if (!existingProvider.isConfigured) {
      return c.json({ 
        error: 'Cannot set unconfigured provider as default. Configure credentials first.' 
      }, 400);
    }
    
    const provider = setDefaultProvider(id);
    
    return c.json({
      provider: {
        id: provider!.id,
        name: provider!.name,
        type: provider!.type,
        isDefault: provider!.isDefault,
        isConfigured: provider!.isConfigured,
      },
      message: 'Provider set as default',
    });
  })

  /**
   * DELETE /api/providers/:id
   * Remove provider configuration (clear credentials)
   */
  .delete('/:id', (c) => {
    const id = c.req.param('id');
    
    const provider = removeProviderConfig(id);
    
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    return c.json({
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        isDefault: provider.isDefault,
        isConfigured: provider.isConfigured,
      },
      message: 'Provider configuration removed',
    });
  });
