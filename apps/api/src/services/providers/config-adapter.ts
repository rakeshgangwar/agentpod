import type { OpenCodeConfig } from "./types";

interface AgentPodAuth {
  [providerId: string]: {
    type: "api" | "oauth";
    key?: string;
    refresh?: string;
    access?: string;
    expires?: number;
  };
}

interface AgentPodUserConfig {
  settings?: Record<string, unknown>;
  agents_md?: string;
  files?: Array<{
    type: string;
    name: string;
    extension: string;
    content: string;
  }>;
}

interface CloudflareConfig {
  provider?: Record<string, {
    options?: {
      apiKey?: string;
      baseUrl?: string;
    };
  }>;
  [key: string]: unknown;
}

export function agentPodToCloudflareConfig(
  auth: AgentPodAuth | null,
  userConfig: AgentPodUserConfig | null
): CloudflareConfig {
  const config: CloudflareConfig = {};

  if (auth) {
    // Build provider config, only adding entries with valid API keys
    const providerConfig: Record<string, { options?: { apiKey?: string } }> = {};
    for (const [providerId, credentials] of Object.entries(auth)) {
      if (credentials.type === "api" && credentials.key) {
        providerConfig[providerId] = {
          options: { apiKey: credentials.key },
        };
      }
    }
    // Only set provider if we have at least one valid entry
    // Empty provider object breaks OpenCode SDK's default provider discovery
    if (Object.keys(providerConfig).length > 0) {
      config.provider = providerConfig;
    }
  }

  if (userConfig?.settings) {
    Object.assign(config, userConfig.settings);
  }

  return config;
}

export function cloudflareToAgentPodAuth(config: CloudflareConfig): AgentPodAuth {
  const auth: AgentPodAuth = {};

  if (config.provider) {
    for (const [providerId, providerConfig] of Object.entries(config.provider)) {
      const apiKey = providerConfig?.options?.apiKey;
      if (apiKey) {
        auth[providerId] = { type: "api", key: apiKey };
      }
    }
  }

  return auth;
}

export function openCodeConfigToCloudflare(config: OpenCodeConfig | null): CloudflareConfig {
  if (!config) return {};

  const cloudflareConfig: CloudflareConfig = {};

  if (config.provider) {
    cloudflareConfig.provider = {};
    for (const [providerId, providerConfig] of Object.entries(config.provider)) {
      cloudflareConfig.provider[providerId] = {
        options: {
          apiKey: providerConfig.options?.apiKey,
          baseUrl: providerConfig.options?.baseUrl,
        },
      };
    }
  }

  if (config.model) {
    cloudflareConfig.model = config.model;
  }

  for (const [key, value] of Object.entries(config)) {
    if (key !== "provider" && key !== "model") {
      cloudflareConfig[key] = value;
    }
  }

  return cloudflareConfig;
}

export function cloudflareToOpenCodeConfig(config: CloudflareConfig | null): OpenCodeConfig {
  if (!config) return {};

  const openCodeConfig: OpenCodeConfig = {};

  if (config.provider) {
    openCodeConfig.provider = {};
    for (const [providerId, providerConfig] of Object.entries(config.provider)) {
      const typedConfig = providerConfig as { options?: { apiKey?: string; baseUrl?: string } };
      openCodeConfig.provider[providerId] = {
        options: {
          apiKey: typedConfig.options?.apiKey,
          baseUrl: typedConfig.options?.baseUrl,
        },
      };
    }
  }

  for (const [key, value] of Object.entries(config)) {
    if (key !== "provider") {
      openCodeConfig[key] = value;
    }
  }

  return openCodeConfig;
}
