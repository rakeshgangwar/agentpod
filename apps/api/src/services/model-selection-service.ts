/**
 * Model Selection Service
 *
 * Recommends AI models based on user preferences and project requirements.
 * Uses data from models.dev API and configured provider credentials.
 */

import { modelsDev, type ModelsDevModel, type ModelsDevProvider, POPULAR_PROVIDERS } from "./models-dev";
import { db } from "../db/drizzle";
import { providerCredentials } from "../db/schema/providers";
import { createLogger } from "../utils/logger";
import type {
  OnboardingModelRecommendation,
  ModelSelectionParams,
} from "@agentpod/types";

const log = createLogger("model-selection-service");

// =============================================================================
// Constants
// =============================================================================

/**
 * Recommended models for different use cases.
 * Order matters - first match wins.
 */
const RECOMMENDED_MODELS = {
  // Primary models (best quality)
  primary: [
    { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.0-flash-exp" },
    { provider: "openai", model: "gpt-4-turbo" },
  ],

  // Small/fast models (for quick tasks)
  small: [
    { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-1.5-flash" },
    { provider: "groq", model: "llama-3.1-70b-versatile" },
  ],

  // Budget-friendly options
  budget: [
    { provider: "groq", model: "llama-3.1-70b-versatile" },
    { provider: "openrouter", model: "meta-llama/llama-3.1-70b-instruct" },
    { provider: "google", model: "gemini-1.5-flash" },
  ],

  // Large context window
  largeContext: [
    { provider: "google", model: "gemini-1.5-pro" },
    { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
    { provider: "openai", model: "gpt-4-turbo" },
  ],
};

// =============================================================================
// Types
// =============================================================================

interface ConfiguredProvider {
  id: string;
  name: string;
  models: ModelsDevModel[];
}

// =============================================================================
// Model Selection Service Class
// =============================================================================

export class ModelSelectionService {
  // ===========================================================================
  // Main Selection Methods
  // ===========================================================================

  /**
   * Get model recommendations based on configured providers and preferences.
   */
  async getRecommendation(
    params: ModelSelectionParams = {}
  ): Promise<OnboardingModelRecommendation> {
    const {
      projectType,
      preferLowCost = false,
      preferFast = false,
      requireLargeContext = false,
      configuredProvidersOnly = true,
    } = params;

    log.debug("Getting model recommendation", { params });

    // Get configured providers
    const configuredProviders = await this.getConfiguredProviders();
    const configuredIds = configuredProviders.map((p) => p.id);

    // Get all available providers from models.dev
    const allProviders = await modelsDev.fetchProviders();

    // Filter to configured providers if requested
    const availableProviders = configuredProvidersOnly
      ? allProviders.filter((p) => configuredIds.includes(p.id))
      : allProviders;

    if (availableProviders.length === 0) {
      return this.getNoProviderRecommendation();
    }

    // Select recommendation strategy
    const strategy = this.selectStrategy(params);

    // Find best primary model
    const primary = this.findBestModel(
      availableProviders,
      RECOMMENDED_MODELS[strategy],
      "primary"
    );

    // Find best small model
    const small = this.findBestModel(
      availableProviders,
      RECOMMENDED_MODELS.small,
      "small"
    );

    // Find alternatives
    const alternatives = this.findAlternatives(
      availableProviders,
      primary?.model,
      5
    );

    // Generate reasoning
    const reasoning = this.generateReasoning(
      primary,
      small,
      params,
      configuredProviders
    );

    return {
      primaryModelId: primary?.model || "",
      primaryModelName: primary?.name || "No model available",
      primaryProvider: primary?.provider || "",
      smallModelId: small?.model,
      smallModelName: small?.name,
      smallProvider: small?.provider,
      reasoning,
      alternativeModelIds: alternatives.map((m) => m.model),
    };
  }

  /**
   * Get available models for a specific provider.
   */
  async getModelsForProvider(providerId: string): Promise<ModelsDevModel[]> {
    const provider = await modelsDev.getProvider(providerId);
    return provider?.models || [];
  }

  /**
   * Get all configured providers with their available models.
   */
  async getConfiguredProviders(): Promise<ConfiguredProvider[]> {
    // Get configured credentials from database
    const credentials = await db
      .select({ providerId: providerCredentials.providerId })
      .from(providerCredentials);

    const configuredIds = credentials.map((c) => c.providerId);

    if (configuredIds.length === 0) {
      return [];
    }

    // Get provider details from models.dev
    const allProviders = await modelsDev.fetchProviders();

    return allProviders
      .filter((p) => configuredIds.includes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        models: p.models,
      }));
  }

  /**
   * Check if any providers are configured.
   */
  async hasConfiguredProviders(): Promise<boolean> {
    const credentials = await db
      .select({ providerId: providerCredentials.providerId })
      .from(providerCredentials)
      .limit(1);

    return credentials.length > 0;
  }

  // ===========================================================================
  // Provider Setup Guidance
  // ===========================================================================

  /**
   * Get setup instructions for a specific provider.
   */
  getProviderSetupGuide(providerId: string): {
    name: string;
    steps: string[];
    apiKeyUrl: string;
    envVar: string;
  } {
    const guides: Record<
      string,
      {
        name: string;
        steps: string[];
        apiKeyUrl: string;
        envVar: string;
      }
    > = {
      anthropic: {
        name: "Anthropic",
        steps: [
          "Go to console.anthropic.com",
          "Sign up or log in",
          "Navigate to API Keys",
          "Create a new API key",
          "Copy the key",
        ],
        apiKeyUrl: "https://console.anthropic.com/account/keys",
        envVar: "ANTHROPIC_API_KEY",
      },
      openai: {
        name: "OpenAI",
        steps: [
          "Go to platform.openai.com",
          "Sign up or log in",
          "Navigate to API Keys",
          "Create a new secret key",
          "Copy the key (it won't be shown again)",
        ],
        apiKeyUrl: "https://platform.openai.com/api-keys",
        envVar: "OPENAI_API_KEY",
      },
      google: {
        name: "Google AI (Gemini)",
        steps: [
          "Go to aistudio.google.com",
          "Sign in with your Google account",
          "Click 'Get API key'",
          "Create a new API key",
          "Copy the key",
        ],
        apiKeyUrl: "https://aistudio.google.com/app/apikey",
        envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
      },
      groq: {
        name: "Groq",
        steps: [
          "Go to console.groq.com",
          "Sign up or log in",
          "Navigate to API Keys",
          "Create a new API key",
          "Copy the key",
        ],
        apiKeyUrl: "https://console.groq.com/keys",
        envVar: "GROQ_API_KEY",
      },
      openrouter: {
        name: "OpenRouter",
        steps: [
          "Go to openrouter.ai",
          "Sign up or log in",
          "Navigate to Keys",
          "Create a new API key",
          "Copy the key",
        ],
        apiKeyUrl: "https://openrouter.ai/keys",
        envVar: "OPENROUTER_API_KEY",
      },
    };

    return (
      guides[providerId] || {
        name: providerId,
        steps: ["Visit the provider's website", "Create an account", "Generate an API key"],
        apiKeyUrl: "",
        envVar: `${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`,
      }
    );
  }

  /**
   * Get recommended providers for new users.
   */
  getRecommendedProviders(): string[] {
    return ["anthropic", "openai", "google", "groq"];
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Select the recommendation strategy based on params.
   */
  private selectStrategy(
    params: ModelSelectionParams
  ): keyof typeof RECOMMENDED_MODELS {
    if (params.requireLargeContext) return "largeContext";
    if (params.preferLowCost) return "budget";
    if (params.preferFast) return "small";
    return "primary";
  }

  /**
   * Find the best available model from a ranked list.
   */
  private findBestModel(
    availableProviders: ModelsDevProvider[],
    rankedModels: { provider: string; model: string }[],
    purpose: string
  ): { provider: string; model: string; name: string } | null {
    for (const { provider, model } of rankedModels) {
      const providerData = availableProviders.find((p) => p.id === provider);
      if (!providerData) continue;

      const modelData = providerData.models.find((m) => m.id === model);
      if (modelData) {
        log.debug(`Found ${purpose} model`, { provider, model });
        return {
          provider,
          model,
          name: modelData.name,
        };
      }
    }

    // Fallback: just pick any available model
    for (const provider of availableProviders) {
      const firstModel = provider.models[0];
      if (firstModel) {
        log.debug(`Falling back to first available model`, {
          provider: provider.id,
          model: firstModel.id,
        });
        return {
          provider: provider.id,
          model: firstModel.id,
          name: firstModel.name,
        };
      }
    }

    return null;
  }

  /**
   * Find alternative models.
   */
  private findAlternatives(
    availableProviders: ModelsDevProvider[],
    excludeModel: string | undefined,
    limit: number
  ): { provider: string; model: string; name: string }[] {
    const alternatives: { provider: string; model: string; name: string }[] = [];

    // Prioritize popular providers
    const sortedProviders = [...availableProviders].sort((a, b) => {
      const aPopular = (POPULAR_PROVIDERS as readonly string[]).includes(a.id) ? 0 : 1;
      const bPopular = (POPULAR_PROVIDERS as readonly string[]).includes(b.id) ? 0 : 1;
      return aPopular - bPopular;
    });

    for (const provider of sortedProviders) {
      for (const model of provider.models) {
        if (model.id === excludeModel) continue;

        alternatives.push({
          provider: provider.id,
          model: model.id,
          name: model.name,
        });

        if (alternatives.length >= limit) {
          return alternatives;
        }
      }
    }

    return alternatives;
  }

  /**
   * Generate reasoning for the recommendation.
   */
  private generateReasoning(
    primary: { provider: string; model: string; name: string } | null,
    small: { provider: string; model: string; name: string } | null | undefined,
    params: ModelSelectionParams,
    configuredProviders: ConfiguredProvider[]
  ): string {
    const parts: string[] = [];

    if (!primary) {
      return "No AI providers are configured. Please set up at least one provider to get started.";
    }

    // Primary model reasoning
    if (params.preferLowCost) {
      parts.push(`Selected ${primary.name} for its cost-effectiveness.`);
    } else if (params.requireLargeContext) {
      parts.push(`Selected ${primary.name} for its large context window.`);
    } else if (params.preferFast) {
      parts.push(`Selected ${primary.name} for fast response times.`);
    } else {
      parts.push(`Selected ${primary.name} as the best available model for code assistance.`);
    }

    // Small model reasoning
    if (small) {
      parts.push(
        `${small.name} is recommended for quick tasks and cost optimization.`
      );
    }

    // Provider info
    const providerNames = configuredProviders.map((p) => p.name).join(", ");
    parts.push(`Based on your configured providers: ${providerNames}.`);

    return parts.join(" ");
  }

  /**
   * Return a recommendation when no providers are configured.
   */
  private getNoProviderRecommendation(): OnboardingModelRecommendation {
    return {
      primaryModelId: "",
      primaryModelName: "No model available",
      primaryProvider: "",
      smallModelId: undefined,
      smallModelName: undefined,
      smallProvider: undefined,
      reasoning:
        "No AI providers are configured. To use the AI assistant, please configure at least one provider (Anthropic, OpenAI, Google, etc.) with your API key.",
      alternativeModelIds: [],
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const modelSelectionService = new ModelSelectionService();
