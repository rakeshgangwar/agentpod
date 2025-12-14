/**
 * Provider Routes
 * 
 * Manage LLM provider configurations with encrypted credential storage.
 * Uses Models.dev API for provider/model data.
 * Credentials are stored per-user.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { modelsDev, getAuthType, POPULAR_PROVIDERS } from '../services/models-dev.ts';
import {
  getConfiguredProviderIds,
  saveApiKey,
  deleteCredential,
  isProviderConfigured,
} from '../models/provider-credentials.ts';
import { githubCopilotOAuth } from '../services/oauth/github-copilot.ts';
import { getSetting, setSetting } from '../models/provider.ts';
import { syncAuthJsonForUser } from '../services/config-sync.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('provider-routes');

// =============================================================================
// Helper: Get user from context
// =============================================================================

function getUser(c: { get: (key: string) => unknown }): { id: string } | null {
  const user = c.get("user") as { id?: string } | undefined;
  if (!user?.id || user.id === "anonymous") {
    return null;
  }
  return { id: user.id };
}

// =============================================================================
// Validation Schemas
// =============================================================================

const configureApiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

// =============================================================================
// Routes
// =============================================================================

export const providerRoutes = new Hono()
  /**
   * GET /api/providers
   * List all providers with models from Models.dev
   * Query params:
   * - popularOnly: boolean (default: true) - Only return popular providers
   */
  .get('/', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const popularOnly = c.req.query('popularOnly') !== 'false';
    
    try {
      // Get configured provider IDs and default for this user
      const configuredIds = await getConfiguredProviderIds(user.id);
      const defaultProviderId = await getSetting('default_provider');
      
      // Get providers with models from Models.dev
      const providers = await modelsDev.getProvidersWithModels(
        configuredIds,
        defaultProviderId,
        popularOnly
      );
      
      return c.json({
        providers,
        totalCount: popularOnly ? undefined : providers.length,
        popularCount: POPULAR_PROVIDERS.length,
      });
    } catch (error) {
      log.error('Failed to fetch providers', { error });
      return c.json({ error: 'Failed to fetch provider list' }, 500);
    }
  })

  /**
   * GET /api/providers/configured
   * List only configured providers (with credentials)
   */
  .get('/configured', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const configuredIds = await getConfiguredProviderIds(user.id);
      const defaultProviderId = await getSetting('default_provider');
      
      // Get all providers and filter to configured only
      const allProviders = await modelsDev.getProvidersWithModels(
        configuredIds,
        defaultProviderId,
        false // Get all, not just popular
      );
      
      const configuredProviders = allProviders.filter(p => p.isConfigured);
      
      return c.json({ providers: configuredProviders });
    } catch (error) {
      log.error('Failed to fetch configured providers', { error });
      return c.json({ error: 'Failed to fetch configured providers' }, 500);
    }
  })

  /**
   * GET /api/providers/default
   * Get the default provider
   */
  .get('/default', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const defaultProviderId = await getSetting('default_provider');
    
    if (!defaultProviderId) {
      return c.json({ provider: null, message: 'No default provider set' });
    }
    
    // Check if the default provider is actually configured for this user
    if (!(await isProviderConfigured(user.id, defaultProviderId))) {
      return c.json({ provider: null, message: 'Default provider is not configured' });
    }
    
    // Get provider details from Models.dev
    const provider = await modelsDev.getProvider(defaultProviderId);
    
    if (!provider) {
      return c.json({ provider: null, message: 'Default provider not found' });
    }
    
    return c.json({
      provider: {
        id: provider.id,
        name: provider.name,
        authType: getAuthType(provider.id),
        isConfigured: true,
        isDefault: true,
        logoUrl: modelsDev.getLogoUrl(provider.id),
      }
    });
  })

  /**
   * GET /api/providers/:id
   * Get a specific provider with its models
   */
  .get('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    
    const provider = await modelsDev.getProvider(id);
    
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    const configuredIds = await getConfiguredProviderIds(user.id);
    const defaultProviderId = await getSetting('default_provider');
    
    return c.json({
      provider: {
        id: provider.id,
        name: provider.name,
        authType: getAuthType(provider.id),
        apiKeyEnvVar: provider.apiKeyEnvVar,
        isConfigured: configuredIds.includes(provider.id),
        isDefault: provider.id === defaultProviderId,
        logoUrl: modelsDev.getLogoUrl(provider.id),
        models: provider.models.map(m => ({
          id: m.id,
          name: m.name,
          context: m.context,
          maxOutput: m.maxOutput,
          pricing: m.pricing,
          capabilities: {
            image: m.image || false,
            video: m.video || false,
            tools: m.tools || false,
            streaming: m.streaming || false,
          },
        })),
      }
    });
  })

  /**
   * POST /api/providers/:id/configure
   * Configure a provider with an API key
   */
  .post('/:id/configure', zValidator('json', configureApiKeySchema), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const { apiKey } = c.req.valid('json');
    
    // Verify provider exists
    const provider = await modelsDev.getProvider(id);
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    // Check auth type
    const authType = getAuthType(id);
    if (authType !== 'api_key') {
      return c.json({ 
        error: `Provider ${id} uses ${authType} authentication, not API key` 
      }, 400);
    }
    
    try {
      // Save the API key (encrypted) for this user
      await saveApiKey({ userId: user.id, providerId: id, apiKey });
      
      log.info('Provider configured with API key', { userId: user.id, providerId: id });
      
      // Fire and forget: sync to running containers
      syncAuthJsonForUser(user.id).catch(err => {
        log.warn('Failed to sync auth after configure', { userId: user.id, error: err instanceof Error ? err.message : err });
      });
      
      return c.json({
        success: true,
        message: 'Provider configured successfully',
        provider: {
          id,
          name: provider.name,
          isConfigured: true,
        }
      });
    } catch (error) {
      log.error('Failed to configure provider', { providerId: id, error });
      return c.json({ error: 'Failed to save API key' }, 500);
    }
  })

  /**
   * POST /api/providers/:id/set-default
   * Set a provider as the default
   */
  .post('/:id/set-default', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    
    // Verify provider is configured for this user
    if (!(await isProviderConfigured(user.id, id))) {
      return c.json({ 
        error: 'Provider must be configured before setting as default' 
      }, 400);
    }
    
    await setSetting('default_provider', id);
    
    log.info('Default provider set', { userId: user.id, providerId: id });
    
    return c.json({
      success: true,
      message: `${id} is now the default provider`,
    });
  })

  /**
   * DELETE /api/providers/:id
   * Remove provider credentials
   */
  .delete('/:id', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    
    const deleted = await deleteCredential(user.id, id);
    
    if (!deleted) {
      return c.json({ error: 'Provider not configured' }, 404);
    }
    
    // If this was the default provider, clear the default
    const defaultProviderId = await getSetting('default_provider');
    if (defaultProviderId === id) {
      await setSetting('default_provider', '');
    }
    
    log.info('Provider credentials removed', { userId: user.id, providerId: id });
    
    // Fire and forget: sync to running containers
    syncAuthJsonForUser(user.id).catch(err => {
      log.warn('Failed to sync auth after delete', { userId: user.id, error: err instanceof Error ? err.message : err });
    });
    
    return c.json({
      success: true,
      message: 'Provider credentials removed',
    });
  })

  // ===========================================================================
  // OAuth Endpoints
  // ===========================================================================

  /**
   * POST /api/providers/:id/oauth/init
   * Initialize OAuth device flow for the provider
   */
  .post('/:id/oauth/init', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    
    // Currently only GitHub Copilot uses device flow
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    try {
      const flow = await githubCopilotOAuth.initDeviceFlow(user.id);
      
      return c.json({
        success: true,
        stateId: flow.id,
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        expiresAt: flow.expiresAt.toISOString(),
        interval: flow.interval,
      });
    } catch (error) {
      log.error('Failed to init OAuth flow', { providerId: id, error });
      return c.json({ error: 'Failed to initialize OAuth flow' }, 500);
    }
  })

  /**
   * POST /api/providers/:id/oauth/poll
   * Poll for OAuth completion (device flow)
   */
  .post('/:id/oauth/poll', zValidator('json', z.object({ stateId: z.string() })), async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const { stateId } = c.req.valid('json');
    
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    try {
      const status = await githubCopilotOAuth.pollToken(stateId, user.id);
      
      return c.json({
        status: status.status,
        error: status.error,
        isConfigured: status.status === 'completed',
      });
    } catch (error) {
      log.error('Failed to poll OAuth', { providerId: id, stateId, error });
      return c.json({ error: 'Failed to poll OAuth status' }, 500);
    }
  })

  /**
   * GET /api/providers/:id/oauth/status/:stateId
   * Get current OAuth flow status
   */
  .get('/:id/oauth/status/:stateId', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const stateId = c.req.param('stateId');
    
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    const status = await githubCopilotOAuth.getFlowStatus(stateId);
    
    if (!status) {
      return c.json({ error: 'OAuth flow not found' }, 404);
    }
    
    return c.json({
      status: status.status,
      error: status.error,
    });
  })

  /**
   * DELETE /api/providers/:id/oauth/:stateId
   * Cancel an OAuth flow
   */
  .delete('/:id/oauth/:stateId', async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const stateId = c.req.param('stateId');
    
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    await githubCopilotOAuth.cancelFlow(stateId);
    
    return c.json({
      success: true,
      message: 'OAuth flow cancelled',
    });
  })

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * POST /api/providers/refresh-cache
   * Force refresh of Models.dev cache
   */
  .post('/refresh-cache', async (c) => {
    modelsDev.clearCache();
    
    // Fetch fresh data
    const providers = await modelsDev.fetchProviders();
    
    log.info('Provider cache refreshed', { providerCount: providers.length });
    
    return c.json({
      success: true,
      message: 'Provider cache refreshed',
      providerCount: providers.length,
    });
  });
