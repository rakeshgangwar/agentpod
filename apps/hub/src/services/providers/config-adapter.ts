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
    isSystem?: boolean;
  }>;
}

interface CloudflareConfigFile {
  type: string;
  name: string;
  extension: string;
  content: string;
  isSystem?: boolean;
}

interface CloudflareProviderOptions {
  apiKey?: string;
  baseUrl?: string;
}

interface CloudflareAuthEntry {
  type: "api" | "oauth";
  key?: string;
  refresh?: string;
  access?: string;
  expires?: number;
}

interface CloudflareConfig {
  provider?: Record<string, {
    options?: CloudflareProviderOptions;
  }>;
  auth?: Record<string, CloudflareAuthEntry>;
  files?: CloudflareConfigFile[];
  agents_md?: string;
  [key: string]: unknown;
}

export function agentPodToCloudflareConfig(
  auth: AgentPodAuth | null,
  userConfig: AgentPodUserConfig | null
): CloudflareConfig {
  const config: CloudflareConfig = {};

  if (auth) {
    const providerConfig: Record<string, { options?: CloudflareProviderOptions }> = {};
    const authConfig: Record<string, CloudflareAuthEntry> = {};
    
    for (const [providerId, credentials] of Object.entries(auth)) {
      if (credentials.type === "api" && credentials.key) {
        providerConfig[providerId] = {
          options: { apiKey: credentials.key },
        };
        authConfig[providerId] = {
          type: "api",
          key: credentials.key,
        };
      } else if (credentials.type === "oauth" && (credentials.refresh || credentials.access)) {
        providerConfig[providerId] = { options: {} };
        authConfig[providerId] = {
          type: "oauth",
          refresh: credentials.refresh,
          access: credentials.access,
          expires: credentials.expires,
        };
      }
    }
    
    if (Object.keys(providerConfig).length > 0) {
      config.provider = providerConfig;
    }
    if (Object.keys(authConfig).length > 0) {
      config.auth = authConfig;
    }
  }

  if (userConfig?.settings) {
    Object.assign(config, userConfig.settings);
  }

  if (userConfig?.files && userConfig.files.length > 0) {
    config.files = userConfig.files.map(f => ({
      type: f.type,
      name: f.name,
      extension: f.extension,
      content: f.content,
      isSystem: f.isSystem,
    }));
  }

  if (userConfig?.agents_md) {
    config.agents_md = userConfig.agents_md;
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
