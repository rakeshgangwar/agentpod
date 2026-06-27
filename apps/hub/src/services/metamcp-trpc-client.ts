import { config } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("metamcp-trpc");

type McpServerType = "STDIO" | "SSE" | "STREAMABLE_HTTP";

/**
 * Service account session cache for server-to-server MetaMCP calls.
 * Better Auth uses HMAC-signed cookies (token.signature format).
 * Synced sessions from AgentPod only have raw tokens, so they won't validate.
 * We use a dedicated service account that logs into MetaMCP to get valid signed cookies.
 * 
 * IMPORTANT: When creating/updating MCP servers, we pass the actual user_id
 * to ensure proper ownership in MetaMCP, even though authentication uses the service account.
 */
interface ServiceAccountSession {
  signedCookie: string;
  expiresAt: Date;
}

let serviceAccountSession: ServiceAccountSession | null = null;

export interface MetaMcpServer {
  uuid: string;
  name: string;
  description: string | null;
  type: McpServerType;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  created_at: string;
  bearerToken: string | null;
  headers: Record<string, string>;
  user_id: string | null;
  error_status?: "NONE" | "ERROR";
}

export interface CreateMcpServerInput {
  name: string;
  description?: string;
  type: McpServerType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  bearerToken?: string;
  headers?: Record<string, string>;
  user_id?: string;
}

export interface UpdateMcpServerInput extends CreateMcpServerInput {
  uuid: string;
}

interface TrpcResponse<T> {
  result?: {
    data: {
      success: boolean;
      data?: T;
      message?: string;
    };
  };
  error?: {
    message: string;
    code: number;
    data?: {
      code: string;
      httpStatus: number;
    };
  };
}

const METAMCP_COOKIE_NAME = "better-auth.session_token";
const SERVICE_ACCOUNT_SESSION_BUFFER_MS = 5 * 60 * 1000;

export function formatMetaMcpCookie(sessionToken: string): string {
  return `${METAMCP_COOKIE_NAME}=${sessionToken}`;
}

async function ensureServiceAccount(): Promise<void> {
  const baseUrl = config.metamcp.url;
  const { email, password } = config.metamcp.serviceAccount;

  const signupResponse = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "AgentPod Service" }),
  });

  if (!signupResponse.ok) {
    const text = await signupResponse.text();
    if (!text.includes("already exists") && !text.includes("User already exists")) {
      log.debug("Service account signup response", { status: signupResponse.status, text: text.slice(0, 200) });
    }
  }
}

async function loginServiceAccount(): Promise<ServiceAccountSession> {
  const baseUrl = config.metamcp.url;
  const { email, password } = config.metamcp.serviceAccount;

  await ensureServiceAccount();

  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Service account login failed: ${response.status} - ${text.slice(0, 200)}`);
  }

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No session cookie returned from service account login");
  }

  const cookieMatch = setCookie.match(/better-auth\.session_token=([^;]+)/);
  if (!cookieMatch || !cookieMatch[1]) {
    throw new Error("Could not parse session cookie from response");
  }

  const signedCookie = decodeURIComponent(cookieMatch[1]);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  log.info("Service account session obtained");
  return { signedCookie, expiresAt };
}

async function getServiceAccountCookie(): Promise<string> {
  const now = new Date();
  
  if (
    serviceAccountSession &&
    serviceAccountSession.expiresAt.getTime() - SERVICE_ACCOUNT_SESSION_BUFFER_MS > now.getTime()
  ) {
    return serviceAccountSession.signedCookie;
  }

  log.info("Refreshing service account session");
  serviceAccountSession = await loginServiceAccount();
  return serviceAccountSession.signedCookie;
}

class MetaMcpTrpcClient {
  private getBaseUrl(): string {
    return config.metamcp.url;
  }

  private async trpcCall<T>(
    procedure: string, 
    signedCookie: string,
    input?: unknown, 
    method: "query" | "mutate" = "query"
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const metamcpCookie = formatMetaMcpCookie(signedCookie);
    
    const url = new URL(`${baseUrl}/trpc/${procedure}`);
    
    const fetchOptions: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        Cookie: metamcpCookie,
      },
    };

    if (method === "query") {
      if (input !== undefined) {
        url.searchParams.set("input", JSON.stringify(input));
      }
      fetchOptions.method = "GET";
    } else {
      fetchOptions.method = "POST";
      fetchOptions.body = JSON.stringify(input !== undefined ? input : {});
    }

    const response = await fetch(url.toString(), fetchOptions);
    
    if (!response.ok) {
      const text = await response.text();
      log.error("MetaMCP HTTP error", { 
        procedure, 
        status: response.status, 
        statusText: response.statusText,
        body: text.slice(0, 500),
      });
      throw new Error(`MetaMCP HTTP error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as TrpcResponse<T>;

    if (data.error) {
      log.error("MetaMCP tRPC error", { 
        procedure, 
        errorCode: data.error.code,
        errorMessage: data.error.message,
        httpStatus: data.error.data?.httpStatus,
      });
      if (data.error.data?.code === "UNAUTHORIZED") {
        throw new Error("Session expired or invalid - user must re-authenticate");
      }
      throw new Error(data.error.message);
    }

    if (!data.result?.data.success) {
      throw new Error(data.result?.data.message || "Unknown error");
    }

    return data.result.data.data as T;
  }

  async listServers(): Promise<MetaMcpServer[]> {
    try {
      const cookie = await getServiceAccountCookie();
      const result = await this.trpcCall<MetaMcpServer[]>(
        "frontend.mcpServers.list",
        cookie
      );
      return result || [];
    } catch (error) {
      log.error("Failed to list MetaMCP servers", { error });
      throw error;
    }
  }

  async getServer(uuid: string): Promise<MetaMcpServer | null> {
    try {
      const cookie = await getServiceAccountCookie();
      return await this.trpcCall<MetaMcpServer>(
        "frontend.mcpServers.get",
        cookie,
        { uuid }
      );
    } catch (error) {
      log.error("Failed to get MetaMCP server", { uuid, error });
      return null;
    }
  }

  async createServer(input: CreateMcpServerInput): Promise<MetaMcpServer> {
    try {
      const cookie = await getServiceAccountCookie();
      const result = await this.trpcCall<MetaMcpServer>(
        "frontend.mcpServers.create",
        cookie,
        input,
        "mutate"
      );
      log.info("Created MetaMCP server", { uuid: result.uuid, name: input.name, user_id: input.user_id });
      return result;
    } catch (error) {
      const err = error as Error;
      log.error("Failed to create MetaMCP server", { 
        name: input.name, 
        user_id: input.user_id,
        errorMessage: err.message,
        errorName: err.name,
        errorStack: err.stack,
      });
      throw error;
    }
  }

  async updateServer(input: UpdateMcpServerInput): Promise<MetaMcpServer> {
    try {
      const cookie = await getServiceAccountCookie();
      const result = await this.trpcCall<MetaMcpServer>(
        "frontend.mcpServers.update",
        cookie,
        input,
        "mutate"
      );
      log.info("Updated MetaMCP server", { uuid: input.uuid, name: input.name });
      return result;
    } catch (error) {
      log.error("Failed to update MetaMCP server", { uuid: input.uuid, error });
      throw error;
    }
  }

  async deleteServer(uuid: string): Promise<void> {
    try {
      const cookie = await getServiceAccountCookie();
      await this.trpcCall<void>(
        "frontend.mcpServers.delete",
        cookie,
        { uuid },
        "mutate"
      );
      log.info("Deleted MetaMCP server", { uuid });
    } catch (error) {
      const err = error as Error;
      log.error("Failed to delete MetaMCP server", { 
        uuid, 
        errorMessage: err.message,
        errorName: err.name,
        errorStack: err.stack,
      });
      throw new Error(`Failed to delete MetaMCP server ${uuid}: ${err.message}`);
    }
  }

  async healthCheck(): Promise<{ status: string }> {
    const baseUrl = this.getBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return { status: "ok" };
      }
      return { status: "degraded" };
    } catch (error) {
      log.error("MetaMCP health check failed", { error });
      throw error;
    }
  }
}

export const metamcpTrpcClient = new MetaMcpTrpcClient();
