import { config } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("metamcp-trpc");

type McpServerType = "STDIO" | "SSE" | "STREAMABLE_HTTP";

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

export function formatMetaMcpCookie(sessionToken: string): string {
  return `${METAMCP_COOKIE_NAME}=${sessionToken}`;
}

class MetaMcpTrpcClient {
  private getBaseUrl(): string {
    return config.metamcp.url;
  }

  private async trpcCall<T>(
    procedure: string, 
    sessionToken: string,
    input?: unknown, 
    method: "query" | "mutate" = "query"
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const metamcpCookie = formatMetaMcpCookie(sessionToken);
    
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
    const data = await response.json() as TrpcResponse<T>;

    if (data.error) {
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

  async listServers(sessionToken: string): Promise<MetaMcpServer[]> {
    try {
      const result = await this.trpcCall<MetaMcpServer[]>(
        "frontend.mcpServers.list",
        sessionToken
      );
      return result || [];
    } catch (error) {
      log.error("Failed to list MetaMCP servers", { error });
      throw error;
    }
  }

  async getServer(sessionToken: string, uuid: string): Promise<MetaMcpServer | null> {
    try {
      return await this.trpcCall<MetaMcpServer>(
        "frontend.mcpServers.get",
        sessionToken,
        { uuid }
      );
    } catch (error) {
      log.error("Failed to get MetaMCP server", { uuid, error });
      return null;
    }
  }

  async createServer(sessionToken: string, input: CreateMcpServerInput): Promise<MetaMcpServer> {
    try {
      const result = await this.trpcCall<MetaMcpServer>(
        "frontend.mcpServers.create",
        sessionToken,
        input,
        "mutate"
      );
      log.info("Created MetaMCP server", { uuid: result.uuid, name: input.name });
      return result;
    } catch (error) {
      log.error("Failed to create MetaMCP server", { name: input.name, error });
      throw error;
    }
  }

  async updateServer(sessionToken: string, input: UpdateMcpServerInput): Promise<MetaMcpServer> {
    try {
      const result = await this.trpcCall<MetaMcpServer>(
        "frontend.mcpServers.update",
        sessionToken,
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

  async deleteServer(sessionToken: string, uuid: string): Promise<void> {
    try {
      await this.trpcCall<void>(
        "frontend.mcpServers.delete",
        sessionToken,
        { uuid },
        "mutate"
      );
      log.info("Deleted MetaMCP server", { uuid });
    } catch (error) {
      log.error("Failed to delete MetaMCP server", { uuid, error });
      throw error;
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
