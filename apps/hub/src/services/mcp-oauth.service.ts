import { eq, and } from "drizzle-orm";
import { db } from "../db/drizzle";
import { mcpOauthSessions, mcpServers } from "../db/schema";
import type {
  McpOAuthDiscoveryResult,
  OAuthProtectedResourceMetadata,
  OAuthAuthorizationServerMetadata,
  McpOAuthSession,
  McpOAuthStatus,
} from "@agentpod/types";

const DISCOVERY_TIMEOUT = 10000;

function generateId(): string {
  return crypto.randomUUID();
}

async function fetchWithTimeout(url: string, timeoutMs: number = DISCOVERY_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractResourceMetadataUrl(wwwAuthHeader: string): string | null {
  const match = wwwAuthHeader.match(/resource_metadata="([^"]+)"/);
  return match?.[1] ?? null;
}

export async function discoverOAuthMetadata(serverUrl: string): Promise<McpOAuthDiscoveryResult> {
  try {
    const response = await fetchWithTimeout(serverUrl);
    
    if (response.status !== 401) {
      return { requiresOAuth: false };
    }

    const wwwAuth = response.headers.get("www-authenticate");
    if (!wwwAuth) {
      return { requiresOAuth: false };
    }

    let resourceMetadataUrl = extractResourceMetadataUrl(wwwAuth);
    
    if (!resourceMetadataUrl) {
      const url = new URL(serverUrl);
      resourceMetadataUrl = `${url.origin}/.well-known/oauth-protected-resource`;
    }

    const resourceResponse = await fetchWithTimeout(resourceMetadataUrl);
    if (!resourceResponse.ok) {
      return {
        requiresOAuth: true,
        error: `Failed to fetch resource metadata: ${resourceResponse.status}`,
      };
    }

    const resourceMetadata = (await resourceResponse.json()) as OAuthProtectedResourceMetadata;

    if (!resourceMetadata.authorization_servers?.length) {
      return {
        requiresOAuth: true,
        resourceMetadata,
        error: "No authorization servers found in resource metadata",
      };
    }

    const authServerUrl = resourceMetadata.authorization_servers[0]!;
    const authServerMetadataUrl = `${authServerUrl.replace(/\/$/, "")}/.well-known/oauth-authorization-server`;
    
    const authServerResponse = await fetchWithTimeout(authServerMetadataUrl);
    if (!authServerResponse.ok) {
      return {
        requiresOAuth: true,
        resourceMetadata,
        error: `Failed to fetch auth server metadata: ${authServerResponse.status}`,
      };
    }

    const authServerMetadata = (await authServerResponse.json()) as OAuthAuthorizationServerMetadata;

    return {
      requiresOAuth: true,
      resourceMetadata,
      authServerMetadata,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      requiresOAuth: false,
      error: `Discovery failed: ${message}`,
    };
  }
}

export async function discoverOAuthForServer(serverId: string, userId: string): Promise<McpOAuthDiscoveryResult> {
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.userId, userId)))
    .limit(1);

  if (!server) {
    return { requiresOAuth: false, error: "Server not found" };
  }

  if (server.type === "STDIO") {
    return { requiresOAuth: false };
  }

  if (!server.url) {
    return { requiresOAuth: false, error: "Server URL not configured" };
  }

  return discoverOAuthMetadata(server.url);
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface InitiateOAuthFlowResult {
  authorizationUrl: string;
  state: string;
  session: McpOAuthSession;
}

interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export async function initiateOAuthFlow(
  serverId: string,
  userId: string,
  redirectUri: string
): Promise<InitiateOAuthFlowResult> {
  const discovery = await discoverOAuthForServer(serverId, userId);
  
  if (!discovery.requiresOAuth) {
    throw new Error("Server does not require OAuth");
  }
  
  if (!discovery.authServerMetadata) {
    throw new Error(discovery.error || "OAuth discovery failed");
  }

  const [server] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.userId, userId)))
    .limit(1);

  if (!server) {
    throw new Error("Server not found");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  let clientId: string | undefined;
  let clientSecret: string | undefined;

  if (discovery.authServerMetadata.registration_endpoint) {
    const registrationResponse = await fetch(discovery.authServerMetadata.registration_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: "AgentPod",
        client_uri: "https://github.com/rakeshgangwar/agentpod",
      }),
    });

    if (registrationResponse.ok) {
      const clientInfo = (await registrationResponse.json()) as ClientRegistrationResponse;
      clientId = clientInfo.client_id;
      clientSecret = clientInfo.client_secret;
    }
  }

  const sessionId = generateId();
  const now = new Date();

  const [existingSession] = await db
    .select()
    .from(mcpOauthSessions)
    .where(and(
      eq(mcpOauthSessions.mcpServerId, serverId),
      eq(mcpOauthSessions.userId, userId)
    ))
    .limit(1);

  if (existingSession) {
    await db
      .update(mcpOauthSessions)
      .set({
        resourceUrl: discovery.resourceMetadata?.resource,
        authorizationServerUrl: discovery.authServerMetadata.issuer,
        clientId,
        clientSecret,
        codeVerifier,
        state,
        status: "pending",
        errorMessage: null,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        updatedAt: now,
      })
      .where(eq(mcpOauthSessions.id, existingSession.id));
  } else {
    await db.insert(mcpOauthSessions).values({
      id: sessionId,
      mcpServerId: serverId,
      userId,
      resourceUrl: discovery.resourceMetadata?.resource,
      authorizationServerUrl: discovery.authServerMetadata.issuer,
      clientId,
      clientSecret,
      codeVerifier,
      state,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  const authUrl = new URL(discovery.authServerMetadata.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  if (clientId) {
    authUrl.searchParams.set("client_id", clientId);
  }
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  
  if (discovery.resourceMetadata?.resource) {
    authUrl.searchParams.set("resource", discovery.resourceMetadata.resource);
  }

  const scopes = discovery.authServerMetadata.scopes_supported || ["openid", "email", "profile"];
  authUrl.searchParams.set("scope", scopes.join(" "));

  const session = await getOAuthSession(existingSession?.id || sessionId);

  return {
    authorizationUrl: authUrl.toString(),
    state,
    session: session!,
  };
}

export async function handleOAuthCallback(
  code: string,
  state: string,
  redirectUri: string
): Promise<{ success: boolean; mcpServerId?: string; error?: string }> {
  const [session] = await db
    .select()
    .from(mcpOauthSessions)
    .where(eq(mcpOauthSessions.state, state))
    .limit(1);

  if (!session) {
    return { success: false, error: "Invalid state parameter" };
  }

  if (!session.authorizationServerUrl) {
    return { success: false, error: "No authorization server URL" };
  }

  const discovery = await discoverOAuthMetadata(session.resourceUrl || "");
  if (!discovery.authServerMetadata?.token_endpoint) {
    return { success: false, error: "Could not discover token endpoint" };
  }

  const tokenUrl = discovery.authServerMetadata.token_endpoint;

  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: session.codeVerifier || "",
  });

  if (session.clientId) {
    tokenParams.set("client_id", session.clientId);
  }

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenParams.toString(),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    await db
      .update(mcpOauthSessions)
      .set({
        status: "error",
        errorMessage: `Token exchange failed: ${tokenResponse.status} - ${errorBody}`,
        updatedAt: new Date(),
      })
      .where(eq(mcpOauthSessions.id, session.id));

    return { success: false, error: `Token exchange failed: ${tokenResponse.status}` };
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await db
    .update(mcpOauthSessions)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenType: tokens.token_type || "Bearer",
      expiresAt,
      scope: tokens.scope || null,
      status: "authorized",
      state: null,
      codeVerifier: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(mcpOauthSessions.id, session.id));

  return { success: true, mcpServerId: session.mcpServerId };
}

export async function getOAuthSession(sessionId: string): Promise<McpOAuthSession | null> {
  const [session] = await db
    .select()
    .from(mcpOauthSessions)
    .where(eq(mcpOauthSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  return {
    id: session.id,
    mcpServerId: session.mcpServerId,
    userId: session.userId,
    resourceUrl: session.resourceUrl || undefined,
    authorizationServerUrl: session.authorizationServerUrl || undefined,
    clientId: session.clientId || undefined,
    tokenType: session.tokenType || undefined,
    expiresAt: session.expiresAt?.toISOString(),
    scope: session.scope || undefined,
    status: session.status as McpOAuthStatus,
    errorMessage: session.errorMessage || undefined,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export async function getOAuthSessionForServer(
  serverId: string,
  userId: string
): Promise<McpOAuthSession | null> {
  const [session] = await db
    .select()
    .from(mcpOauthSessions)
    .where(and(
      eq(mcpOauthSessions.mcpServerId, serverId),
      eq(mcpOauthSessions.userId, userId)
    ))
    .limit(1);

  if (!session) return null;

  return {
    id: session.id,
    mcpServerId: session.mcpServerId,
    userId: session.userId,
    resourceUrl: session.resourceUrl || undefined,
    authorizationServerUrl: session.authorizationServerUrl || undefined,
    clientId: session.clientId || undefined,
    tokenType: session.tokenType || undefined,
    expiresAt: session.expiresAt?.toISOString(),
    scope: session.scope || undefined,
    status: session.status as McpOAuthStatus,
    errorMessage: session.errorMessage || undefined,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export async function getValidAccessToken(
  serverId: string,
  userId: string
): Promise<string | null> {
  const [session] = await db
    .select()
    .from(mcpOauthSessions)
    .where(and(
      eq(mcpOauthSessions.mcpServerId, serverId),
      eq(mcpOauthSessions.userId, userId),
      eq(mcpOauthSessions.status, "authorized")
    ))
    .limit(1);

  if (!session || !session.accessToken) return null;

  if (session.expiresAt && session.expiresAt < new Date()) {
    if (session.refreshToken) {
      const refreshed = await refreshAccessToken(session.id);
      if (refreshed) {
        const [updated] = await db
          .select()
          .from(mcpOauthSessions)
          .where(eq(mcpOauthSessions.id, session.id))
          .limit(1);
        return updated?.accessToken || null;
      }
    }

    await db
      .update(mcpOauthSessions)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(eq(mcpOauthSessions.id, session.id));

    return null;
  }

  return session.accessToken;
}

export async function refreshAccessToken(sessionId: string): Promise<boolean> {
  const [session] = await db
    .select()
    .from(mcpOauthSessions)
    .where(eq(mcpOauthSessions.id, sessionId))
    .limit(1);

  if (!session || !session.refreshToken || !session.authorizationServerUrl) {
    return false;
  }

  const discovery = await discoverOAuthMetadata(session.resourceUrl || "");
  if (!discovery.authServerMetadata?.token_endpoint) {
    return false;
  }

  const tokenParams = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });

  if (session.clientId) {
    tokenParams.set("client_id", session.clientId);
  }

  const tokenResponse = await fetch(discovery.authServerMetadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenParams.toString(),
  });

  if (!tokenResponse.ok) {
    return false;
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await db
    .update(mcpOauthSessions)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || session.refreshToken,
      tokenType: tokens.token_type || "Bearer",
      expiresAt,
      scope: tokens.scope || session.scope,
      status: "authorized",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(mcpOauthSessions.id, session.id));

  return true;
}

export async function revokeOAuthSession(
  serverId: string,
  userId: string
): Promise<boolean> {
  await db
    .delete(mcpOauthSessions)
    .where(and(
      eq(mcpOauthSessions.mcpServerId, serverId),
      eq(mcpOauthSessions.userId, userId)
    ));

  return true;
}
