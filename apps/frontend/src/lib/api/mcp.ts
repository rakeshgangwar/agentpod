import { authGetToken, getConnectionStatus } from "./tauri";

async function getApiBaseUrl(): Promise<string> {
  const status = await getConnectionStatus();
  if (!status.connected || !status.apiUrl) {
    throw new Error("Not connected to Management API");
  }
  return status.apiUrl;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const token = await authGetToken();
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage: string;
    
    try {
      const parsed = JSON.parse(errorBody);
      errorMessage = parsed.message || parsed.error || `API Error: ${response.status}`;
    } catch {
      errorMessage = errorBody || `API Error: ${response.status}`;
    }
    
    throw new Error(errorMessage);
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export type McpServerType = "STDIO" | "SSE" | "STREAMABLE_HTTP";
export type McpAuthType = "none" | "api_key" | "bearer_token" | "oauth2" | "env_vars" | "provider_link";

export interface ProviderLinkConfig {
  providerId: string;
  providerName?: string;
}

export interface McpAuthConfig {
  type: McpAuthType;
  apiKey?: string;
  bearerToken?: string;
  oauth2?: {
    clientId: string;
    clientSecret?: string;
    scope?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
  };
  envVars?: Record<string, string>;
  headers?: Record<string, string>;
  providerLink?: ProviderLinkConfig;
}

export interface McpServer {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  type: McpServerType;
  command: string | null;
  args: string[];
  url: string | null;
  authType: McpAuthType;
  authConfig: McpAuthConfig;
  environment: Record<string, string>;
  metamcpServerId: string | null;
  enabled: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMcpServerInput {
  name: string;
  description?: string;
  type: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  auth?: McpAuthConfig;
  environment?: Record<string, string>;
  isPublic?: boolean;
}

export interface UpdateMcpServerInput extends Partial<CreateMcpServerInput> {}

export async function listMcpServers(): Promise<McpServer[]> {
  const response = await apiRequest<{ servers: McpServer[] }>("/api/mcp/servers");
  return response.servers;
}

export async function getMcpServer(id: string): Promise<McpServer> {
  const response = await apiRequest<{ server: McpServer }>(`/api/mcp/servers/${id}`);
  return response.server;
}

export async function createMcpServer(input: CreateMcpServerInput): Promise<McpServer> {
  const response = await apiRequest<{ server: McpServer }>("/api/mcp/servers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.server;
}

export async function updateMcpServer(id: string, input: UpdateMcpServerInput): Promise<McpServer> {
  const response = await apiRequest<{ server: McpServer }>(`/api/mcp/servers/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return response.server;
}

export async function deleteMcpServer(id: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/mcp/servers/${id}`, {
    method: "DELETE",
  });
}

export async function testMcpServer(id: string): Promise<{ success: boolean; message?: string }> {
  return apiRequest<{ success: boolean; message?: string }>(`/api/mcp/servers/${id}/test`, {
    method: "POST",
  });
}

export interface McpStatusResponse {
  enabled: boolean;
  status: "connected" | "disabled" | "error";
  message?: string;
  error?: string;
}

export async function getMcpStatus(): Promise<McpStatusResponse> {
  const baseUrl = await getApiBaseUrl();
  
  const response = await fetch(`${baseUrl}/mcp/status/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    return {
      enabled: true,
      status: "error",
      error: `Failed to connect: ${response.status}`,
    };
  }

  return response.json();
}

export interface McpApiKey {
  id: string;
  keyPrefix: string;
  description: string | null;
  scopes: string[];
  endpointId: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateMcpApiKeyInput {
  endpointId?: string;
  description?: string;
  scopes?: string[];
  expiresInDays?: number;
}

export interface CreateMcpApiKeyResponse {
  id: string;
  key: string;
  keyPrefix: string;
}

export async function listMcpApiKeys(endpointId?: string): Promise<McpApiKey[]> {
  const path = endpointId 
    ? `/api/mcp/keys?endpointId=${endpointId}` 
    : "/api/mcp/keys";
  const response = await apiRequest<{ keys: McpApiKey[] }>(path);
  return response.keys;
}

export async function createMcpApiKey(input: CreateMcpApiKeyInput): Promise<CreateMcpApiKeyResponse> {
  return apiRequest<CreateMcpApiKeyResponse>("/api/mcp/keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeMcpApiKey(id: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/mcp/keys/${id}`, {
    method: "DELETE",
  });
}

export type McpOAuthStatus = "pending" | "authorized" | "expired" | "error";

export interface McpOAuthDiscoveryResult {
  requiresOAuth: boolean;
  resourceMetadata?: {
    resource?: string;
    authorization_servers?: string[];
  };
  authServerMetadata?: {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
    scopes_supported?: string[];
  };
  error?: string;
}

export interface McpOAuthSession {
  id: string;
  mcpServerId: string;
  status: McpOAuthStatus;
  resourceUrl?: string;
  authorizationServerUrl?: string;
  clientId?: string;
  tokenType?: string;
  expiresAt?: string;
  scope?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpOAuthInitiateResponse {
  authorizationUrl: string;
  state: string;
  session: McpOAuthSession;
}

export interface McpOAuthStatusResponse {
  hasSession: boolean;
  session?: McpOAuthSession;
  discovery?: McpOAuthDiscoveryResult;
}

export async function discoverMcpOAuth(serverId: string): Promise<McpOAuthDiscoveryResult> {
  return apiRequest<McpOAuthDiscoveryResult>(`/api/mcp/oauth/discover/${serverId}`);
}

export async function initiateMcpOAuth(serverId: string): Promise<McpOAuthInitiateResponse> {
  return apiRequest<McpOAuthInitiateResponse>(`/api/mcp/oauth/initiate/${serverId}`, {
    method: "POST",
  });
}

export async function getMcpOAuthStatus(serverId: string): Promise<McpOAuthStatusResponse> {
  return apiRequest<McpOAuthStatusResponse>(`/api/mcp/oauth/status/${serverId}`);
}

export async function revokeMcpOAuth(serverId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/mcp/oauth/revoke/${serverId}`, {
    method: "DELETE",
  });
}

export interface ProviderMcpDetectionResult {
  isProviderMcp: boolean;
  providerId?: string;
  providerName?: string;
  providerConfigured?: boolean;
  displayInfo?: {
    name: string;
    authDescription: string;
  };
  suggestedName?: string;
  suggestedDescription?: string;
}

export async function detectProviderMcp(url: string): Promise<ProviderMcpDetectionResult> {
  return apiRequest<ProviderMcpDetectionResult>("/api/mcp/status/detect-provider", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export interface CreateMcpServerResponse {
  server: McpServer;
  providerLink?: {
    detected: boolean;
    providerId?: string;
    name: string;
    authDescription: string;
  };
}

export async function createMcpServerWithProviderDetection(input: CreateMcpServerInput): Promise<CreateMcpServerResponse> {
  return apiRequest<CreateMcpServerResponse>("/api/mcp/servers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
