import { config } from '../config.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('metamcp-client');

export interface MetaMcpServerCreate {
  name: string;
  description?: string;
  type: 'STDIO' | 'SSE' | 'STREAMABLE_HTTP';
  command?: string;
  args?: string[];
  url?: string;
  bearerToken?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  isPublic?: boolean;
}

export interface MetaMcpServer {
  id: string;
  name: string;
  description?: string;
  type: string;
  command?: string;
  args?: string[];
  url?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MetaMcpNamespaceCreate {
  name: string;
  description?: string;
  serverIds?: string[];
  isPublic?: boolean;
}

export interface MetaMcpNamespace {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MetaMcpEndpointCreate {
  name: string;
  namespaceId: string;
  enableApiKeyAuth?: boolean;
  enableQueryParamAuth?: boolean;
  createMcpServer?: boolean;
}

export interface MetaMcpEndpoint {
  id: string;
  name: string;
  namespaceId: string;
  sseUrl: string;
  mcpUrl: string;
  apiUrl: string;
  openapiUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaMcpApiKey {
  id: string;
  key?: string;
  keyPrefix: string;
  description?: string;
  scope: 'private' | 'public';
  createdAt: string;
}

export interface MetaMcpTool {
  name: string;
  description?: string;
  serverName: string;
  enabled: boolean;
}

class MetaMcpClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor() {
    this.baseUrl = config.metamcp.url;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error('MetaMCP API error', { 
          status: response.status, 
          path, 
          error: errorText 
        });
        throw new Error(`MetaMCP API error: ${response.status} - ${errorText}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      log.error('MetaMCP request failed', { path, error });
      throw error;
    }
  }

  async healthCheck(): Promise<{ status: string; version?: string }> {
    // MetaMCP uses tRPC, so there's no REST health endpoint.
    // We simply verify the service is reachable by making any HTTP request.
    // Any response (even 404) indicates the service is running.
    const url = `${this.baseUrl}/`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      // Any HTTP response means the service is reachable
      return { status: 'ok' };
    } catch (error) {
      // Check if it's a fetch error vs abort
      if (error instanceof Error && error.name === 'AbortError') {
        log.error('MetaMCP health check timed out');
        throw new Error('MetaMCP health check timed out');
      }
      log.error('MetaMCP health check failed', { error });
      throw error;
    }
  }

  async listServers(): Promise<MetaMcpServer[]> {
    const response = await this.fetch<{ servers: MetaMcpServer[] }>('/api/mcp-servers');
    return response.servers;
  }

  async getServer(id: string): Promise<MetaMcpServer> {
    return this.fetch(`/api/mcp-servers/${id}`);
  }

  async createServer(data: MetaMcpServerCreate): Promise<MetaMcpServer> {
    return this.fetch('/api/mcp-servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServer(id: string, data: Partial<MetaMcpServerCreate>): Promise<MetaMcpServer> {
    return this.fetch(`/api/mcp-servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteServer(id: string): Promise<void> {
    await this.fetch(`/api/mcp-servers/${id}`, {
      method: 'DELETE',
    });
  }

  async testServerConnection(id: string): Promise<{ connected: boolean; tools?: MetaMcpTool[]; error?: string }> {
    return this.fetch(`/api/mcp-servers/${id}/test`);
  }

  async listNamespaces(): Promise<MetaMcpNamespace[]> {
    const response = await this.fetch<{ namespaces: MetaMcpNamespace[] }>('/api/namespaces');
    return response.namespaces;
  }

  async getNamespace(id: string): Promise<MetaMcpNamespace> {
    return this.fetch(`/api/namespaces/${id}`);
  }

  async createNamespace(data: MetaMcpNamespaceCreate): Promise<MetaMcpNamespace> {
    return this.fetch('/api/namespaces', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNamespace(id: string, data: Partial<MetaMcpNamespaceCreate>): Promise<MetaMcpNamespace> {
    return this.fetch(`/api/namespaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNamespace(id: string): Promise<void> {
    await this.fetch(`/api/namespaces/${id}`, {
      method: 'DELETE',
    });
  }

  async getNamespaceTools(id: string): Promise<MetaMcpTool[]> {
    const response = await this.fetch<{ tools: MetaMcpTool[] }>(`/api/namespaces/${id}/tools`);
    return response.tools;
  }

  async updateNamespaceServers(id: string, serverIds: string[]): Promise<void> {
    await this.fetch(`/api/namespaces/${id}/servers`, {
      method: 'PUT',
      body: JSON.stringify({ serverIds }),
    });
  }

  async listEndpoints(): Promise<MetaMcpEndpoint[]> {
    const response = await this.fetch<{ endpoints: MetaMcpEndpoint[] }>('/api/endpoints');
    return response.endpoints;
  }

  async getEndpoint(id: string): Promise<MetaMcpEndpoint> {
    return this.fetch(`/api/endpoints/${id}`);
  }

  async createEndpoint(data: MetaMcpEndpointCreate): Promise<MetaMcpEndpoint> {
    return this.fetch('/api/endpoints', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteEndpoint(id: string): Promise<void> {
    await this.fetch(`/api/endpoints/${id}`, {
      method: 'DELETE',
    });
  }

  async listApiKeys(): Promise<MetaMcpApiKey[]> {
    const response = await this.fetch<{ apiKeys: MetaMcpApiKey[] }>('/api/api-keys');
    return response.apiKeys;
  }

  async createApiKey(description?: string): Promise<MetaMcpApiKey> {
    return this.fetch('/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.fetch(`/api/api-keys/${id}`, {
      method: 'DELETE',
    });
  }
}

export const metamcpClient = new MetaMcpClient();
