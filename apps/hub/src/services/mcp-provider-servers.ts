import type { McpAuthConfig, ProviderLinkConfig } from './mcp-credentials.ts';

export interface KnownMcpServerConfig {
  urlPatterns: RegExp[];
  providerLink: ProviderLinkConfig;
  name: string;
  description: string;
}

export const KNOWN_PROVIDER_MCP_SERVERS: KnownMcpServerConfig[] = [
  {
    urlPatterns: [
      /^https:\/\/api\.githubcopilot\.com\/mcp\/?$/,
      /^https:\/\/copilot\.githubassets\.com\/mcp\/?$/,
    ],
    providerLink: {
      providerId: 'github-copilot',
      providerName: 'GitHub Copilot',
    },
    name: 'GitHub Copilot MCP',
    description: 'GitHub Copilot MCP server - requires GitHub Copilot authentication',
  },
];

export function detectProviderMcpServer(url: string): KnownMcpServerConfig | null {
  for (const config of KNOWN_PROVIDER_MCP_SERVERS) {
    for (const pattern of config.urlPatterns) {
      if (pattern.test(url)) {
        return config;
      }
    }
  }
  return null;
}

export function getAuthConfigForProviderMcp(serverConfig: KnownMcpServerConfig): McpAuthConfig {
  return {
    type: 'provider_link',
    providerLink: serverConfig.providerLink,
  };
}

export function isGitHubCopilotMcpUrl(url: string): boolean {
  return /^https:\/\/(api\.githubcopilot\.com|copilot\.githubassets\.com)\/mcp\/?$/.test(url);
}

export function getProviderLinkDisplayInfo(providerId: string): { name: string; authDescription: string } | null {
  switch (providerId) {
    case 'github-copilot':
      return {
        name: 'GitHub Copilot',
        authDescription: 'Uses your GitHub Copilot authentication',
      };
    default:
      return null;
  }
}
