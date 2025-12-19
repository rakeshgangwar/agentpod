import type {
  SandboxProvider,
  SandboxProviderOptions,
  SandboxInfo,
  SandboxProviderStatus,
  OpenCodeClient,
} from "./types";
import { DockerOrchestrator, type DockerOrchestratorConfig } from "../orchestrator/docker";
import type { SandboxStatus as DockerSandboxStatus } from "../orchestrator/types";
import { config } from "../../config";
import { createLogger } from "../../utils/logger";

const log = createLogger("docker-provider");

function dockerStatusToProviderStatus(status: DockerSandboxStatus): SandboxProviderStatus {
  const statusMap: Record<DockerSandboxStatus, SandboxProviderStatus> = {
    creating: "creating",
    running: "running",
    stopped: "stopped",
    paused: "stopped",
    restarting: "starting",
    removing: "stopping",
    exited: "stopped",
    dead: "error",
    error: "error",
    unknown: "error",
  };
  return statusMap[status] ?? "error";
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly type = "docker" as const;
  private orchestrator: DockerOrchestrator;

  constructor(orchestratorConfig?: DockerOrchestratorConfig) {
    this.orchestrator = new DockerOrchestrator(orchestratorConfig ?? {
      socketPath: config.docker.socketPath,
      host: config.docker.host || undefined,
      port: config.docker.port,
      containerPrefix: config.docker.containerPrefix,
      defaultNetwork: config.docker.network,
      hostPathPrefix: config.data.hostPathPrefix || undefined,
    });
  }

  async createSandbox(options: SandboxProviderOptions): Promise<SandboxInfo> {
    log.info("Creating Docker sandbox", { sandboxId: options.id, userId: options.userId });

    const containerConfig = {
      id: options.id,
      name: options.name ?? `Sandbox ${options.id}`,
      image: this.getImageForFlavor(options.flavor ?? "js"),
      env: {} as Record<string, string>,
      volumes: [] as Array<{ host: string; container: string; mode: "rw" | "ro" }>,
      ports: [
        { container: 4096, label: "opencode" },
      ],
      labels: {
        "agentpod.sandbox.id": options.id,
        "agentpod.sandbox.user": options.userId,
        "agentpod.managed": "true",
      },
      resources: this.getResourcesForTier(options.resourceTier ?? "starter"),
    };

    const sandbox = await this.orchestrator.createSandbox(containerConfig);

    return {
      id: options.id,
      status: dockerStatusToProviderStatus(sandbox.status),
      provider: "docker",
      opencodeUrl: sandbox.urls.opencode,
      createdAt: sandbox.createdAt,
      lastActiveAt: sandbox.startedAt,
      metadata: {
        containerId: sandbox.containerId,
        image: sandbox.image,
      },
    };
  }

  async startSandbox(id: string): Promise<void> {
    log.info("Starting Docker sandbox", { sandboxId: id });
    await this.orchestrator.startSandbox(id);
  }

  async stopSandbox(id: string): Promise<void> {
    log.info("Stopping Docker sandbox", { sandboxId: id });
    await this.orchestrator.stopSandbox(id);
  }

  async deleteSandbox(id: string): Promise<void> {
    log.info("Deleting Docker sandbox", { sandboxId: id });
    await this.orchestrator.deleteSandbox(id);
  }

  async getSandbox(id: string): Promise<SandboxInfo | null> {
    const sandbox = await this.orchestrator.getSandbox(id);
    if (!sandbox) return null;

    return {
      id,
      status: dockerStatusToProviderStatus(sandbox.status),
      provider: "docker",
      opencodeUrl: sandbox.urls.opencode,
      createdAt: sandbox.createdAt,
      lastActiveAt: sandbox.startedAt,
      metadata: {
        containerId: sandbox.containerId,
        image: sandbox.image,
        health: sandbox.health,
      },
    };
  }

  async listSandboxes(userId: string): Promise<SandboxInfo[]> {
    const sandboxes = await this.orchestrator.listSandboxes({
      labels: { "agentpod.sandbox.user": userId },
    });

    return sandboxes.map((sandbox) => ({
      id: sandbox.id,
      status: dockerStatusToProviderStatus(sandbox.status),
      provider: "docker" as const,
      opencodeUrl: sandbox.urls.opencode,
      createdAt: sandbox.createdAt,
      lastActiveAt: sandbox.startedAt,
      metadata: {
        containerId: sandbox.containerId,
        image: sandbox.image,
      },
    }));
  }

  async getOpenCodeClient(id: string): Promise<OpenCodeClient> {
    const sandbox = await this.getSandbox(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    if (!sandbox.opencodeUrl) {
      throw new Error(`OpenCode URL not available for sandbox: ${id}`);
    }

    const baseUrl = sandbox.opencodeUrl;

    return {
      session: {
        create: async (options) => {
          const response = await fetch(`${baseUrl}/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          });
          const data = await response.json() as { id: string; title?: string };
          return { data };
        },

        prompt: async (options) => {
          const response = await fetch(`${baseUrl}/session/${options.path.id}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          });
          const data = await response.json() as { parts?: Array<{ type: string; text?: string }> };
          return { data };
        },

        list: async () => {
          const response = await fetch(`${baseUrl}/session`);
          const data = await response.json() as Array<{ id: string; title?: string; createdAt?: string }>;
          return { data };
        },

        get: async (options) => {
          const response = await fetch(`${baseUrl}/session/${options.path.id}`);
          const data = await response.json() as { id: string; title?: string; messages?: unknown[] };
          return { data };
        },

        abort: async (options) => {
          await fetch(`${baseUrl}/session/${options.path.id}/abort`, {
            method: "POST",
          });
        },
      },
    };
  }

  async proxyRequest(id: string, request: Request): Promise<Response> {
    const sandbox = await this.getSandbox(id);
    if (!sandbox) {
      return new Response("Sandbox not found", { status: 404 });
    }

    if (!sandbox.opencodeUrl) {
      return new Response("OpenCode not available", { status: 503 });
    }

    const url = new URL(request.url);
    const targetUrl = `${sandbox.opencodeUrl}${url.pathname}${url.search}`;

    try {
      const proxyResponse = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: proxyResponse.headers,
      });
    } catch (error) {
      log.error("Failed to proxy request", { sandboxId: id, error });
      return new Response("Proxy error", { status: 502 });
    }
  }

  async healthCheck(id: string): Promise<boolean> {
    try {
      const sandbox = await this.getSandbox(id);
      if (!sandbox || sandbox.status !== "running") {
        return false;
      }

      if (sandbox.metadata?.health) {
        const health = sandbox.metadata.health as { status: string };
        return health.status === "healthy";
      }

      if (sandbox.opencodeUrl) {
        const response = await fetch(`${sandbox.opencodeUrl}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      }

      return sandbox.status === "running";
    } catch {
      return false;
    }
  }

  private getImageForFlavor(flavor: string): string {
    const imageName = `agentpod-${flavor}`;

    if (config.nodeEnv === "development") {
      return `${imageName}:${config.registry.version}`;
    }

    const hasRegistry = config.registry.url && config.registry.owner;
    return hasRegistry
      ? `${config.registry.url}/${config.registry.owner}/${imageName}:${config.registry.version}`
      : `${imageName}:${config.registry.version}`;
  }

  private getResourcesForTier(tier: string): { cpus: string; memory: string; pidsLimit?: number } {
    const tiers: Record<string, { cpus: string; memory: string; pidsLimit: number }> = {
      starter: { cpus: "0.5", memory: "512m", pidsLimit: 100 },
      builder: { cpus: "1.0", memory: "2g", pidsLimit: 256 },
      creator: { cpus: "2.0", memory: "4g", pidsLimit: 512 },
      power: { cpus: "4.0", memory: "8g", pidsLimit: 1024 },
    };
    const defaultTier = { cpus: "1.0", memory: "2g", pidsLimit: 256 };
    return tiers[tier] ?? defaultTier;
  }
}

let dockerProviderInstance: DockerSandboxProvider | null = null;

export function getDockerProvider(): DockerSandboxProvider {
  if (!dockerProviderInstance) {
    dockerProviderInstance = new DockerSandboxProvider();
  }
  return dockerProviderInstance;
}
