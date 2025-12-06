/**
 * Models.dev Service
 * 
 * Fetches and caches provider/model data from the Models.dev API.
 * This provides a comprehensive list of all LLM providers and their models
 * without requiring a running OpenCode container.
 * 
 * API: https://models.dev/api.json
 * Logos: https://models.dev/logos/{provider}.svg
 */

import { createLogger } from '../utils/logger.ts';

const log = createLogger('models-dev');

// =============================================================================
// Types - Models.dev API Response
// =============================================================================

export interface ModelsDevProvider {
  id: string;
  name: string;
  apiKeyEnvVar?: string;
  npm?: string;
  models: ModelsDevModel[];
}

export interface ModelsDevModel {
  id: string;
  name: string;
  provider: string;
  context: number;
  maxOutput: number;
  pricing: {
    input: number;
    output: number;
    request?: number;
  };
  trainingData?: string;
  image?: boolean;
  video?: boolean;
  object?: boolean;
  tools?: boolean;
  streaming?: boolean;
}

// =============================================================================
// Types - Enhanced (for our API responses)
// =============================================================================

export type AuthType = 'api_key' | 'oauth' | 'device_flow';

export interface ModelInfo {
  id: string;
  name: string;
  context: number;
  maxOutput: number;
  pricing: {
    input: number;
    output: number;
  };
  capabilities: {
    image: boolean;
    video: boolean;
    tools: boolean;
    streaming: boolean;
  };
}

export interface ProviderWithModels {
  id: string;
  name: string;
  authType: AuthType;
  apiKeyEnvVar?: string;
  isConfigured: boolean;
  isDefault: boolean;
  logoUrl: string;
  models: ModelInfo[];
}

// =============================================================================
// Provider Metadata (for auth type mapping)
// =============================================================================

/**
 * Curated list of popular providers (shown by default)
 */
export const POPULAR_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'github-copilot',
  'openrouter',
  'amazon-bedrock',
  'azure',
  'groq',
  'mistral',
  'xai',
] as const;

/**
 * Auth type overrides for specific providers
 * Default is 'api_key' if not specified
 */
const AUTH_TYPE_MAP: Record<string, AuthType> = {
  'github-copilot': 'device_flow',
  'opencode': 'oauth', // OpenCode Zen uses browser OAuth
};

/**
 * Get the auth type for a provider
 */
export function getAuthType(providerId: string): AuthType {
  return AUTH_TYPE_MAP[providerId] || 'api_key';
}

// =============================================================================
// Cache
// =============================================================================

const CACHE_TTL = 3600000; // 1 hour in milliseconds

interface CacheEntry {
  providers: ModelsDevProvider[];
  timestamp: number;
}

let cache: CacheEntry | null = null;

// =============================================================================
// Service
// =============================================================================

export const modelsDev = {
  /**
   * Fetch all providers from models.dev
   * Results are cached for 1 hour
   */
  async fetchProviders(): Promise<ModelsDevProvider[]> {
    // Check cache
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      log.debug('Returning cached providers', { count: cache.providers.length });
      return cache.providers;
    }

    log.info('Fetching providers from models.dev');

    try {
      const response = await fetch('https://models.dev/api.json', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CodeOpen/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const providers = await response.json() as ModelsDevProvider[];
      
      // Cache the result
      cache = {
        providers,
        timestamp: Date.now(),
      };

      log.info('Cached providers from models.dev', { count: providers.length });
      return providers;
    } catch (error) {
      log.error('Failed to fetch providers from models.dev', { error });
      
      // Return cached data if available (even if stale)
      if (cache) {
        log.warn('Returning stale cached data');
        return cache.providers;
      }
      
      throw error;
    }
  },

  /**
   * Get a specific provider by ID
   */
  async getProvider(providerId: string): Promise<ModelsDevProvider | null> {
    const providers = await this.fetchProviders();
    return providers.find(p => p.id === providerId) || null;
  },

  /**
   * Get popular providers (curated list)
   */
  async getPopularProviders(): Promise<ModelsDevProvider[]> {
    const providers = await this.fetchProviders();
    return providers.filter(p => 
      (POPULAR_PROVIDERS as readonly string[]).includes(p.id)
    );
  },

  /**
   * Get all providers with enhanced info (configured status, auth type, etc.)
   * @param configuredProviderIds - IDs of providers that have credentials configured
   * @param defaultProviderId - ID of the default provider
   * @param popularOnly - Only return popular providers
   */
  async getProvidersWithModels(
    configuredProviderIds: string[] = [],
    defaultProviderId: string | null = null,
    popularOnly = true
  ): Promise<ProviderWithModels[]> {
    const allProviders = await this.fetchProviders();
    
    // Filter to popular if requested
    const providers = popularOnly 
      ? allProviders.filter(p => (POPULAR_PROVIDERS as readonly string[]).includes(p.id))
      : allProviders;

    return providers.map(p => ({
      id: p.id,
      name: p.name,
      authType: getAuthType(p.id),
      apiKeyEnvVar: p.apiKeyEnvVar,
      isConfigured: configuredProviderIds.includes(p.id),
      isDefault: p.id === defaultProviderId,
      logoUrl: `https://models.dev/logos/${p.id}.svg`,
      models: p.models.map(m => ({
        id: m.id,
        name: m.name,
        context: m.context,
        maxOutput: m.maxOutput,
        pricing: {
          input: m.pricing.input,
          output: m.pricing.output,
        },
        capabilities: {
          image: m.image || false,
          video: m.video || false,
          tools: m.tools || false,
          streaming: m.streaming || false,
        },
      })),
    }));
  },

  /**
   * Get the logo URL for a provider
   */
  getLogoUrl(providerId: string): string {
    return `https://models.dev/logos/${providerId}.svg`;
  },

  /**
   * Clear the cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    cache = null;
    log.info('Cache cleared');
  },
};
