/**
 * Provider Routes
 * 
 * Manage LLM provider configurations with encrypted credential storage.
 * Uses Models.dev API for provider/model data.
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
    const popularOnly = c.req.query('popularOnly') !== 'false';
    
    try {
      // Get configured provider IDs and default
      const configuredIds = getConfiguredProviderIds();
      const defaultProviderId = getSetting('default_provider');
      
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
      console.error('Failed to fetch providers:', error);
      return c.json({ error: 'Failed to fetch provider list' }, 500);
    }
  })

  /**
   * GET /api/providers/configured
   * List only configured providers (with credentials)
   */
  .get('/configured', async (c) => {
    try {
      const configuredIds = getConfiguredProviderIds();
      const defaultProviderId = getSetting('default_provider');
      
      // Get all providers and filter to configured only
      const allProviders = await modelsDev.getProvidersWithModels(
        configuredIds,
        defaultProviderId,
        false // Get all, not just popular
      );
      
      const configuredProviders = allProviders.filter(p => p.isConfigured);
      
      return c.json({ providers: configuredProviders });
    } catch (error) {
      console.error('Failed to fetch configured providers:', error);
      return c.json({ error: 'Failed to fetch configured providers' }, 500);
    }
  })

  /**
   * GET /api/providers/default
   * Get the default provider
   */
  .get('/default', async (c) => {
    const defaultProviderId = getSetting('default_provider');
    
    if (!defaultProviderId) {
      return c.json({ provider: null, message: 'No default provider set' });
    }
    
    // Check if the default provider is actually configured
    if (!isProviderConfigured(defaultProviderId)) {
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
    const id = c.req.param('id');
    
    const provider = await modelsDev.getProvider(id);
    
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    const configuredIds = getConfiguredProviderIds();
    const defaultProviderId = getSetting('default_provider');
    
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
   * Configure provider with an API key
   */
  .post('/:id/configure', zValidator('json', configureApiKeySchema), async (c) => {
    const id = c.req.param('id');
    const { apiKey } = c.req.valid('json');
    
    // Verify provider exists
    const provider = await modelsDev.getProvider(id);
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    // Check auth type - API key providers only
    const authType = getAuthType(id);
    if (authType !== 'api_key') {
      return c.json({ 
        error: `Provider ${id} uses ${authType} authentication, not API key` 
      }, 400);
    }
    
    // Save the encrypted API key
    await saveApiKey({ providerId: id, apiKey });
    
    return c.json({
      success: true,
      message: 'Provider configured successfully',
      provider: {
        id: provider.id,
        name: provider.name,
        isConfigured: true,
      }
    });
  })

  /**
   * POST /api/providers/:id/set-default
   * Set a provider as the default
   */
  .post('/:id/set-default', async (c) => {
    const id = c.req.param('id');
    
    // Verify provider exists
    const provider = await modelsDev.getProvider(id);
    if (!provider) {
      return c.json({ error: `Provider not found: ${id}` }, 404);
    }
    
    // Check if configured
    if (!isProviderConfigured(id)) {
      return c.json({ 
        error: 'Cannot set unconfigured provider as default. Configure credentials first.' 
      }, 400);
    }
    
    // Set as default
    setSetting('default_provider', id);
    
    return c.json({
      success: true,
      message: 'Provider set as default',
      provider: {
        id: provider.id,
        name: provider.name,
        isDefault: true,
      }
    });
  })

  /**
   * DELETE /api/providers/:id
   * Remove provider credentials
   */
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    
    const deleted = deleteCredential(id);
    
    if (!deleted) {
      return c.json({ error: `Provider credentials not found: ${id}` }, 404);
    }
    
    // If this was the default provider, clear the default
    const defaultProviderId = getSetting('default_provider');
    if (defaultProviderId === id) {
      setSetting('default_provider', '');
    }
    
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
    const id = c.req.param('id');
    
    // Currently only GitHub Copilot uses device flow
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    try {
      const flow = await githubCopilotOAuth.initDeviceFlow();
      
      return c.json({
        success: true,
        stateId: flow.id,
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        expiresAt: flow.expiresAt.toISOString(),
        interval: flow.interval,
      });
    } catch (error) {
      console.error('Failed to init OAuth flow:', error);
      return c.json({ error: 'Failed to initialize OAuth flow' }, 500);
    }
  })

  /**
   * POST /api/providers/:id/oauth/poll
   * Poll for OAuth completion (device flow)
   */
  .post('/:id/oauth/poll', zValidator('json', z.object({ stateId: z.string() })), async (c) => {
    const id = c.req.param('id');
    const { stateId } = c.req.valid('json');
    
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    try {
      const status = await githubCopilotOAuth.pollToken(stateId);
      
      return c.json({
        status: status.status,
        error: status.error,
        isConfigured: status.status === 'completed',
      });
    } catch (error) {
      console.error('Failed to poll OAuth:', error);
      return c.json({ error: 'Failed to poll OAuth status' }, 500);
    }
  })

  /**
   * GET /api/providers/:id/oauth/status
   * Get current OAuth flow status
   */
  .get('/:id/oauth/status/:stateId', (c) => {
    const id = c.req.param('id');
    const stateId = c.req.param('stateId');
    
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    const status = githubCopilotOAuth.getFlowStatus(stateId);
    
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
  .delete('/:id/oauth/:stateId', (c) => {
    const id = c.req.param('id');
    const stateId = c.req.param('stateId');
    
    if (id !== 'github-copilot') {
      return c.json({ 
        error: `OAuth not supported for provider: ${id}` 
      }, 400);
    }
    
    githubCopilotOAuth.cancelFlow(stateId);
    
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
    
    return c.json({
      success: true,
      message: 'Provider cache refreshed',
      providerCount: providers.length,
    });
  });
