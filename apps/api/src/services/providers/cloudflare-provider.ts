import type {
  SandboxProvider,
  SandboxProviderOptions,
  SandboxInfo,
  SandboxProviderStatus,
  OpenCodeClient,
  OpenCodeConfig,
} from "./types";
import { openCodeConfigToCloudflare } from "./config-adapter";
import { config } from "../../config";
import { createLogger } from "../../utils/logger";

const log = createLogger("cloudflare-provider");

interface CloudflareWorkerResponse {
  success?: boolean;
  error?: string;
  sandboxId?: string;
  status?: string;
  hasWorkspace?: boolean;
  serverPort?: number;
  sessionId?: string;
  response?: string;
  parts?: unknown[];
}

export class CloudflareSandboxProvider implements SandboxProvider {
  readonly type = "cloudflare" as const;
  private workerUrl: string;
  private apiToken: string;

  constructor(workerUrl?: string, apiToken?: string) {
    this.workerUrl = workerUrl ?? config.cloudflare.workerUrl;
    this.apiToken = apiToken ?? config.cloudflare.apiToken;

    if (!this.workerUrl) {
      throw new Error("Cloudflare worker URL not configured");
    }
  }

  getOpencodeUrl(sandboxId: string): string {
    return `${this.workerUrl}/sandbox/${sandboxId}/opencode`;
  }

  private async workerFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<CloudflareWorkerResponse> {
    const url = `${this.workerUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.apiToken) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloudflare Worker error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<CloudflareWorkerResponse>;
  }

  async createSandbox(options: SandboxProviderOptions): Promise<SandboxInfo> {
    log.info("Creating Cloudflare sandbox", { sandboxId: options.id, userId: options.userId });

    const cloudflareConfig = options.config
      ? openCodeConfigToCloudflare(options.config)
      : undefined;

    const result = await this.workerFetch("/sandbox", {
      method: "POST",
      body: JSON.stringify({
        id: options.id,
        userId: options.userId,
        config: cloudflareConfig,
        directory: options.directory ?? "/home/user/workspace",
        gitUrl: options.gitUrl,
        gitBranch: options.gitBranch,
      }),
    });

    if (!result.success) {
      throw new Error(result.error ?? "Failed to create sandbox");
    }

    return {
      id: options.id,
      status: "running",
      provider: "cloudflare",
      opencodeUrl: `${this.workerUrl}/sandbox/${options.id}/opencode`,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      metadata: {
        serverPort: result.serverPort,
      },
    };
  }

  async startSandbox(id: string): Promise<void> {
    log.info("Starting/waking Cloudflare sandbox", { sandboxId: id });

    await this.workerFetch(`/sandbox/${id}/wake`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async stopSandbox(id: string): Promise<void> {
    log.info("Stopping Cloudflare sandbox (no-op, auto-hibernates)", { sandboxId: id });
  }

  async deleteSandbox(id: string): Promise<void> {
    log.info("Deleting Cloudflare sandbox", { sandboxId: id });

    await this.workerFetch(`/sandbox/${id}`, {
      method: "DELETE",
    });
  }

  async getSandbox(id: string): Promise<SandboxInfo | null> {
    try {
      const result = await this.workerFetch(`/sandbox/${id}`, {
        method: "GET",
      });

      const statusMap: Record<string, SandboxProviderStatus> = {
        running: "running",
        sleeping: "sleeping",
        stopped: "stopped",
        error: "error",
      };

      return {
        id,
        status: statusMap[result.status ?? "sleeping"] ?? "sleeping",
        provider: "cloudflare",
        opencodeUrl: `${this.workerUrl}/sandbox/${id}/opencode`,
        metadata: {
          hasWorkspace: result.hasWorkspace,
        },
      };
    } catch (error) {
      log.debug("Failed to get sandbox", { sandboxId: id, error });
      return null;
    }
  }

  async listSandboxes(_userId: string): Promise<SandboxInfo[]> {
    log.warn("listSandboxes not implemented for Cloudflare provider - use database");
    return [];
  }

  async getOpenCodeClient(id: string): Promise<OpenCodeClient> {
    return {
      session: {
        create: async (options) => {
          const response = await this.workerFetch(`/sandbox/${id}/message`, {
            method: "POST",
            body: JSON.stringify({
              message: "Initialize session",
              ...options.body,
            }),
          });
          return {
            data: {
              id: response.sessionId ?? "",
              title: options.body.title,
            },
          };
        },

        prompt: async (options) => {
          const response = await this.workerFetch(`/sandbox/${id}/message`, {
            method: "POST",
            body: JSON.stringify({
              sessionId: options.path.id,
              message: options.body.parts.find((p) => p.type === "text")?.text ?? "",
              model: options.body.model,
            }),
          });
          return {
            data: {
              parts: response.parts as Array<{ type: string; text?: string }>,
            },
          };
        },

        list: async () => {
          return { data: [] };
        },

        get: async (options) => {
          return {
            data: {
              id: options.path.id,
              title: "Session",
            },
          };
        },

        abort: async () => {
          log.debug("Session abort not implemented for Cloudflare", { sandboxId: id });
        },
      },
    };
  }

  async proxyRequest(id: string, request: Request): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = `${this.workerUrl}/sandbox/${id}/opencode${url.pathname}${url.search}`;

    try {
      const headers = new Headers(request.headers);
      if (this.apiToken) {
        headers.set("Authorization", `Bearer ${this.apiToken}`);
      }

      const proxyResponse = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.body,
      });

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: proxyResponse.headers,
      });
    } catch (error) {
      log.error("Failed to proxy request to Cloudflare", { sandboxId: id, error });
      return new Response("Proxy error", { status: 502 });
    }
  }

  async healthCheck(id: string): Promise<boolean> {
    try {
      const sandbox = await this.getSandbox(id);
      return sandbox?.status === "running";
    } catch {
      return false;
    }
  }

  async sendMessage(
    sandboxId: string,
    message: string,
    options?: {
      sessionId?: string;
      model?: { providerID: string; modelID: string };
      config?: OpenCodeConfig;
    }
  ): Promise<{ sessionId: string; response: string }> {
    const cloudflareConfig = options?.config
      ? openCodeConfigToCloudflare(options.config)
      : undefined;

    const result = await this.workerFetch(`/sandbox/${sandboxId}/message`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: options?.sessionId,
        message,
        model: options?.model,
        config: cloudflareConfig,
      }),
    });

    return {
      sessionId: result.sessionId ?? "",
      response: result.response ?? "",
    };
  }

  async syncWorkspace(sandboxId: string): Promise<{
    success: boolean;
    syncedFiles: number;
    skippedFiles: number;
    totalSize: number;
  }> {
    log.info("Syncing workspace to R2", { sandboxId });

    const result = await this.workerFetch(`/sandbox/${sandboxId}/sync`, {
      method: "POST",
    }) as {
      success?: boolean;
      syncedFiles?: number;
      skippedFiles?: number;
      totalSize?: number;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Failed to sync workspace");
    }

    return {
      success: true,
      syncedFiles: result.syncedFiles ?? 0,
      skippedFiles: result.skippedFiles ?? 0,
      totalSize: result.totalSize ?? 0,
    };
  }

  /**
   * Starts workflow execution asynchronously.
   * Returns immediately with execution ID and "queued" status.
   * Use getWorkflowStatus() to poll for completion.
   */
  async executeWorkflow(options: {
    executionId: string;
    workflowId: string;
    workflow: {
      id: string;
      name: string;
      nodes: Array<{
        id: string;
        name: string;
        type: string;
        position: [number, number];
        parameters: Record<string, unknown>;
        disabled?: boolean;
      }>;
      connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
      settings?: Record<string, unknown>;
    };
    triggerType: "manual" | "webhook" | "schedule" | "event";
    triggerData?: Record<string, unknown>;
    userId?: string;
  }): Promise<{
    executionId: string;
    instanceId: string;
    status: "queued";
  }> {
    log.info("Starting workflow execution via Cloudflare Worker", {
      executionId: options.executionId,
      workflowId: options.workflowId,
    });

    const result = await this.workerFetch("/workflow/execute", {
      method: "POST",
      body: JSON.stringify({
        executionId: options.executionId,
        workflowId: options.workflowId,
        workflow: options.workflow,
        triggerType: options.triggerType,
        triggerData: options.triggerData ?? {},
        userId: options.userId,
      }),
    }) as {
      executionId: string;
      instanceId: string;
      status: "queued";
    };

    log.info("Workflow execution queued", {
      executionId: result.executionId,
      instanceId: result.instanceId,
    });

    return result;
  }

  /**
   * Gets the current status of a workflow execution from Cloudflare.
   */
  async getWorkflowStatus(executionId: string): Promise<{
    executionId: string;
    status: "queued" | "running" | "paused" | "complete" | "errored" | "terminated" | "unknown";
    output?: Record<string, unknown>;
    error?: string;
  }> {
    log.debug("Getting workflow status", { executionId });

    const result = await this.workerFetch(`/workflow/${executionId}/status`, {
      method: "GET",
    }) as {
      executionId: string;
      status: string;
      output?: Record<string, unknown>;
      error?: string;
    };

    const statusMap: Record<string, "queued" | "running" | "paused" | "complete" | "errored" | "terminated" | "unknown"> = {
      queued: "queued",
      running: "running",
      paused: "paused",
      complete: "complete",
      errored: "errored",
      terminated: "terminated",
    };

    return {
      executionId: result.executionId,
      status: statusMap[result.status] ?? "unknown",
      output: result.output,
      error: result.error,
    };
  }

  /**
   * Pauses a running workflow execution.
   */
  async pauseWorkflow(executionId: string): Promise<{ executionId: string; status: "paused" }> {
    log.info("Pausing workflow execution", { executionId });

    const result = await this.workerFetch(`/workflow/${executionId}/pause`, {
      method: "POST",
    }) as { executionId: string; status: string };

    return {
      executionId: result.executionId,
      status: "paused",
    };
  }

  /**
   * Resumes a paused workflow execution.
   */
  async resumeWorkflow(executionId: string): Promise<{ executionId: string; status: "running" }> {
    log.info("Resuming workflow execution", { executionId });

    const result = await this.workerFetch(`/workflow/${executionId}/resume`, {
      method: "POST",
    }) as { executionId: string; status: string };

    return {
      executionId: result.executionId,
      status: "running",
    };
  }

  /**
   * Terminates a workflow execution.
   */
  async terminateWorkflow(executionId: string): Promise<{ executionId: string; status: "terminated" }> {
    log.info("Terminating workflow execution", { executionId });

    const result = await this.workerFetch(`/workflow/${executionId}/terminate`, {
      method: "POST",
    }) as { executionId: string; status: string };

    return {
      executionId: result.executionId,
      status: "terminated",
    };
  }

  async validateWorkflow(workflow: {
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      position: [number, number];
      parameters: Record<string, unknown>;
    }>;
    connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
  }): Promise<{ valid: boolean; errors: string[] }> {
    const result = await this.workerFetch("/workflow/validate", {
      method: "POST",
      body: JSON.stringify({ workflow }),
    }) as { valid: boolean; errors: string[] };

    return result;
  }
}

let cloudflareProviderInstance: CloudflareSandboxProvider | null = null;

export function getCloudflareProvider(): CloudflareSandboxProvider {
  if (!cloudflareProviderInstance) {
    cloudflareProviderInstance = new CloudflareSandboxProvider();
  }
  return cloudflareProviderInstance;
}

export function isCloudflareConfigured(): boolean {
  return !!config.cloudflare.enabled && !!config.cloudflare.workerUrl;
}
