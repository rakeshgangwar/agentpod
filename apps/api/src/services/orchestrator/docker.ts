/**
 * Docker Orchestrator Implementation
 * Uses dockerode to manage containers via the Docker API
 */

import Docker from "dockerode";
import type { Container, ContainerCreateOptions } from "dockerode";
import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxStats,
  ExecResult,
  ExecOptions,
  InteractiveExecOptions,
  InteractiveExecSession,
  ImageInfo,
  ImagePullProgress,
  NetworkInfo,
  VolumeMount,
  ResourceLimits,
  SandboxFilter,
  LogOptions,
  DockerInfo,
} from "./types";

// =============================================================================
// Configuration
// =============================================================================

export interface DockerOrchestratorConfig {
  /** Docker socket path (default: /var/run/docker.sock) */
  socketPath?: string;

  /** Docker host for TCP connection */
  host?: string;

  /** Docker port for TCP connection */
  port?: number;

  /** Container name prefix */
  containerPrefix?: string;

  /**
   * Host path prefix for bind mounts.
   * When the API runs inside a Docker container, bind mounts must use host paths,
   * not container paths. This prefix is prepended to volume.host paths that start
   * with the container's data directory (e.g., /data/repos).
   * 
   * Example: If hostPathPrefix is "/home/user/agentpod" and a volume.host is
   * "/data/repos/sandbox-123", the actual bind mount will be:
   * "/home/user/agentpod/data/repos/sandbox-123"
   */
  hostPathPrefix?: string;

  /** Default network name */
  defaultNetwork?: string;

  /** Default resource limits */
  defaultResources?: ResourceLimits;
}

const DEFAULT_CONFIG: Required<DockerOrchestratorConfig> = {
  socketPath: "/var/run/docker.sock",
  host: "",
  port: 2375,
  containerPrefix: "agentpod",
  defaultNetwork: "agentpod-net",
  hostPathPrefix: "",
  defaultResources: {
    cpus: "1.0",
    memory: "2g",
    pidsLimit: 256,
  },
};

// =============================================================================
// Docker Orchestrator Implementation
// =============================================================================

export class DockerOrchestrator {
  private docker: Docker;
  private config: Required<DockerOrchestratorConfig>;

  constructor(config: DockerOrchestratorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize Docker client
    if (this.config.host) {
      this.docker = new Docker({
        host: this.config.host,
        port: this.config.port,
      });
    } else {
      this.docker = new Docker({
        socketPath: this.config.socketPath,
      });
    }
  }

  // ===========================================================================
  // Lifecycle Management
  // ===========================================================================

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    const containerName = this.getContainerName(config.id);

    // Ensure network exists
    await this.ensureNetwork(config.network ?? this.config.defaultNetwork);

    // Build container create options
    const createOptions = this.buildContainerOptions(config, containerName);

    // Create the container
    const container = await this.docker.createContainer(createOptions);

    // Start the container
    await container.start();

    // Get container info
    const info = await container.inspect();

    return this.containerInfoToSandbox(config.id, info);
  }

  async startSandbox(id: string): Promise<void> {
    const container = await this.getContainer(id);
    await container.start();
  }

  async stopSandbox(id: string, timeout = 10): Promise<void> {
    const container = await this.getContainer(id);
    await container.stop({ t: timeout });
  }

  async restartSandbox(id: string, timeout = 10): Promise<void> {
    const container = await this.getContainer(id);
    await container.restart({ t: timeout });
  }

  async deleteSandbox(id: string, removeVolumes = false): Promise<void> {
    const container = await this.getContainer(id);

    // Stop if running
    try {
      await container.stop({ t: 5 });
    } catch {
      // Ignore if already stopped
    }

    // Remove container
    await container.remove({ v: removeVolumes, force: true });
  }

  async pauseSandbox(id: string): Promise<void> {
    const container = await this.getContainer(id);
    await container.pause();
  }

  async unpauseSandbox(id: string): Promise<void> {
    const container = await this.getContainer(id);
    await container.unpause();
  }

  // ===========================================================================
  // Status & Information
  // ===========================================================================

  async getSandboxStatus(id: string): Promise<SandboxStatus> {
    try {
      const container = await this.getContainer(id);
      const info = await container.inspect();
      return this.mapContainerState(info.State);
    } catch {
      return "unknown";
    }
  }

  async getSandbox(id: string): Promise<Sandbox | null> {
    try {
      const container = await this.getContainer(id);
      const info = await container.inspect();
      return this.containerInfoToSandbox(id, info);
    } catch {
      return null;
    }
  }

  async listSandboxes(filter?: SandboxFilter): Promise<Sandbox[]> {
    const filters: Record<string, string[]> = {
      label: ["agentpod.managed=true"],
    };

    // Add status filter
    if (filter?.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      filters.status = statuses.map((s) => this.sandboxStatusToDocker(s));
    }

    // Add label filters
    if (filter?.labels) {
      for (const [key, value] of Object.entries(filter.labels)) {
        filters.label!.push(`${key}=${value}`);
      }
    }

    // Add name filter
    if (filter?.name) {
      filters.name = [filter.name];
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters,
    });

    const sandboxes: Sandbox[] = [];
    for (const containerInfo of containers) {
      const sandboxId = containerInfo.Labels?.["agentpod.sandbox.id"];
      if (sandboxId) {
        const sandbox = await this.getSandbox(sandboxId);
        if (sandbox) {
          // Apply date filters
          if (filter?.createdAfter && sandbox.createdAt < filter.createdAfter) {
            continue;
          }
          if (
            filter?.createdBefore &&
            sandbox.createdAt > filter.createdBefore
          ) {
            continue;
          }
          sandboxes.push(sandbox);
        }
      }
    }

    return sandboxes;
  }

  async getSandboxStats(id: string): Promise<SandboxStats> {
    const container = await this.getContainer(id);
    const stats = await container.stats({ stream: false });

    return this.parseContainerStats(stats);
  }

  async sandboxExists(id: string): Promise<boolean> {
    try {
      await this.getContainer(id);
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Logs
  // ===========================================================================

  async getLogs(id: string, options?: LogOptions): Promise<string> {
    const container = await this.getContainer(id);

    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      tail: options?.tail,
      since: options?.since
        ? Math.floor(
            (options.since instanceof Date
              ? options.since.getTime()
              : options.since) / 1000
          )
        : undefined,
      until: options?.until
        ? Math.floor(
            (options.until instanceof Date
              ? options.until.getTime()
              : options.until) / 1000
          )
        : undefined,
      timestamps: options?.timestamps,
    });

    // dockerode returns Buffer for non-streaming logs
    if (Buffer.isBuffer(logStream)) {
      return this.demuxDockerOutput(logStream);
    }

    // Handle stream or string response
    if (typeof logStream === "string") {
      return logStream;
    }

    return String(logStream);
  }

  async *streamLogs(id: string, options?: LogOptions): AsyncIterable<string> {
    const container = await this.getContainer(id);

    const stream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: options?.tail ?? 100,
      since: options?.since
        ? Math.floor(
            (options.since instanceof Date
              ? options.since.getTime()
              : options.since) / 1000
          )
        : undefined,
      timestamps: options?.timestamps,
    });

    // Stream is a readable stream
    if (typeof stream === "object" && "on" in stream) {
      const nodeStream = stream as NodeJS.ReadableStream;
      for await (const chunk of nodeStream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        yield this.demuxDockerOutput(buffer);
      }
    }
  }

  // ===========================================================================
  // Command Execution
  // ===========================================================================

  async exec(
    id: string,
    command: string[],
    options?: ExecOptions
  ): Promise<ExecResult> {
    const container = await this.getContainer(id);

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: options?.stdout ?? true,
      AttachStderr: options?.stderr ?? true,
      AttachStdin: options?.stdin ?? false,
      Tty: options?.tty ?? false,
      WorkingDir: options?.workingDir,
      User: options?.user,
      Env: options?.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      Privileged: options?.privileged,
    });

    // Use Detach: true to avoid websocket hijacking issues
    // This runs the command and waits for completion
    const stream = await exec.start({ Detach: false, Tty: options?.tty ?? false });

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const chunks: Buffer[] = [];

      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on("error", reject);

      stream.on("end", async () => {
        try {
          // Combine all chunks and demux
          const combined = Buffer.concat(chunks);
          stdout = this.demuxDockerOutput(combined);
          
          const inspectData = await exec.inspect();
          resolve({
            exitCode: inspectData.ExitCode ?? 0,
            stdout,
            stderr,
          });
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // ===========================================================================
  // Interactive Terminal Execution
  // ===========================================================================

  /**
   * Start an interactive terminal session in a container
   * Uses HTTP hijacking for bidirectional communication
   * 
   * NOTE: Uses raw HTTP request to work around Bun's incompatibility with
   * dockerode's hijack mode (the 'upgrade' event is not properly handled).
   */
  async execInteractive(
    id: string,
    options?: InteractiveExecOptions
  ): Promise<InteractiveExecSession> {
    const container = await this.getContainer(id);

    // Detect available shell if not specified
    const shell = options?.shell ?? await this.detectShell(id);

    const exec = await container.exec({
      Cmd: [shell],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: [
        "TERM=xterm-256color",
        ...(options?.env
          ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
          : []),
      ],
      WorkingDir: options?.workingDir,
      User: options?.user,
    });

    // Get exec ID for raw HTTP request
    const execInfo = await exec.inspect();
    const execId = execInfo.ID;

    // Use raw HTTP to start exec with hijack - bypasses dockerode's modem
    // which doesn't work properly with Bun's HTTP handling
    const stream = await this.startExecRaw(execId, { stdin: true, tty: true });

    // Set initial terminal size if provided
    if (options?.cols && options?.rows) {
      try {
        await exec.resize({ w: options.cols, h: options.rows });
      } catch {
        // Ignore resize errors on startup
      }
    }

    return {
      stream,
      execId,
      resize: async (cols: number, rows: number) => {
        try {
          await exec.resize({ w: cols, h: rows });
        } catch {
          // Ignore resize errors (exec might have ended)
        }
      },
      close: () => {
        try {
          stream.end();
        } catch {
          // Ignore close errors
        }
      },
    };
  }

  /**
   * Start an exec instance using raw HTTP request.
   * This bypasses dockerode's modem which has issues with Bun's HTTP handling
   * for the 'upgrade' event needed by hijack mode.
   */
  private async startExecRaw(
    execId: string,
    options: { stdin?: boolean; tty?: boolean }
  ): Promise<NodeJS.ReadWriteStream> {
    const net = await import("net");
    const { Duplex } = await import("stream");

    return new Promise((resolve, reject) => {
      const socketPath = this.config.socketPath;
      const body = JSON.stringify({
        Detach: false,
        Tty: options.tty ?? true,
      });

      const socket = net.createConnection({ path: socketPath }, () => {
        // Send HTTP request with upgrade headers
        const request = [
          `POST /exec/${execId}/start HTTP/1.1`,
          "Host: localhost",
          "Content-Type: application/json",
          `Content-Length: ${Buffer.byteLength(body)}`,
          "Connection: Upgrade",
          "Upgrade: tcp",
          "",
          body,
        ].join("\r\n");

        socket.write(request);
      });

      let headersParsed = false;
      let buffer = Buffer.alloc(0);

      socket.on("data", (chunk: Buffer) => {
        if (!headersParsed) {
          buffer = Buffer.concat([buffer, chunk]);
          const headerEnd = buffer.indexOf("\r\n\r\n");
          
          if (headerEnd !== -1) {
            const headers = buffer.subarray(0, headerEnd).toString();
            
            // Check for successful upgrade (101 Switching Protocols)
            if (headers.includes("101")) {
              headersParsed = true;
              
              // Get any remaining data after headers
              const remaining = buffer.subarray(headerEnd + 4);
              
              // Create a duplex stream that wraps the socket
              const duplex = new Duplex({
                read() {},
                write(chunk, encoding, callback) {
                  socket.write(chunk, encoding, callback);
                },
                final(callback) {
                  socket.end(callback);
                },
              });

              // Forward socket data to duplex
              socket.on("data", (data: Buffer) => {
                duplex.push(data);
              });

              socket.on("end", () => {
                duplex.push(null);
              });

              socket.on("error", (err: Error) => {
                duplex.destroy(err);
              });

              // Push remaining data if any
              if (remaining.length > 0) {
                duplex.push(remaining);
              }

              resolve(duplex as unknown as NodeJS.ReadWriteStream);
            } else {
              // Not a successful upgrade
              const statusLine = headers.split("\r\n")[0];
              socket.destroy();
              reject(new Error(`Docker exec start failed: ${statusLine}`));
            }
          }
        }
      });

      socket.on("error", (err: Error) => {
        reject(err);
      });

      socket.on("close", () => {
        if (!headersParsed) {
          reject(new Error("Socket closed before receiving response"));
        }
      });
    });
  }

  /**
   * Detect available shell in a container
   * Tries bash first, then zsh, then falls back to sh
   */
  async detectShell(id: string): Promise<string> {
    const shells = ["/bin/bash", "/bin/zsh", "/bin/sh"];

    for (const shell of shells) {
      try {
        const result = await this.exec(id, ["test", "-x", shell]);
        if (result.exitCode === 0) {
          return shell;
        }
      } catch {
        // Shell not available, try next
      }
    }

    // Default to sh if detection fails
    return "/bin/sh";
  }

  // ===========================================================================
  // Image Management
  // ===========================================================================

  async pullImage(
    imageName: string,
    onProgress?: (progress: ImagePullProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
          (event: { status: string; progress?: string; id?: string }) => {
            if (onProgress) {
              onProgress({
                status: event.status,
                progress: event.progress,
                id: event.id,
              });
            }
          }
        );
      });
    });
  }

  async imageExists(imageName: string): Promise<boolean> {
    try {
      const image = this.docker.getImage(imageName);
      await image.inspect();
      return true;
    } catch {
      return false;
    }
  }

  async getImage(imageName: string): Promise<ImageInfo | null> {
    try {
      const image = this.docker.getImage(imageName);
      const info = await image.inspect();

      return {
        name: imageName,
        id: info.Id,
        size: info.Size,
        created: new Date(info.Created),
        labels: info.Config?.Labels,
      };
    } catch {
      return null;
    }
  }

  async listImages(filter?: string): Promise<ImageInfo[]> {
    const images = await this.docker.listImages({
      filters: filter ? { reference: [filter] } : undefined,
    });

    return images.map((img) => ({
      name: img.RepoTags?.[0] ?? "<none>",
      id: img.Id,
      size: img.Size,
      created: new Date(img.Created * 1000),
      labels: img.Labels ?? undefined,
    }));
  }

  async removeImage(imageName: string, force = false): Promise<void> {
    const image = this.docker.getImage(imageName);
    await image.remove({ force });
  }

  // ===========================================================================
  // Network Management
  // ===========================================================================

  async ensureNetwork(networkName?: string): Promise<string> {
    const name = networkName ?? this.config.defaultNetwork;

    try {
      const network = this.docker.getNetwork(name);
      const info = await network.inspect();
      return info.Id;
    } catch {
      // Network doesn't exist, create it
      const network = await this.docker.createNetwork({
        Name: name,
        Driver: "bridge",
        CheckDuplicate: true,
      });
      return network.id;
    }
  }

  async getNetwork(networkName: string): Promise<NetworkInfo | null> {
    try {
      const network = this.docker.getNetwork(networkName);
      const info = await network.inspect();

      return {
        id: info.Id,
        name: info.Name,
        driver: info.Driver,
        scope: info.Scope,
        internal: info.Internal ?? false,
        containers: Object.keys(info.Containers ?? {}),
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Health & Events
  // ===========================================================================

  async healthCheck(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async getInfo(): Promise<DockerInfo> {
    const info = await this.docker.info();
    const version = await this.docker.version();

    return {
      version: version.Version,
      apiVersion: version.ApiVersion,
      os: info.OperatingSystem,
      arch: info.Architecture,
      cpus: info.NCPU,
      totalMemory: info.MemTotal,
      containersRunning: info.ContainersRunning,
      containersStopped: info.ContainersStopped,
      images: info.Images,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getContainerName(sandboxId: string): string {
    return `${this.config.containerPrefix}-${sandboxId}`;
  }

  private async getContainer(sandboxId: string): Promise<Container> {
    const containerName = this.getContainerName(sandboxId);

    // Try to find by name first
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        name: [containerName],
      },
    });

    if (containers.length > 0 && containers[0]) {
      return this.docker.getContainer(containers[0].Id);
    }

    // Try by sandbox ID label
    const byLabel = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`agentpod.sandbox.id=${sandboxId}`],
      },
    });

    if (byLabel.length > 0 && byLabel[0]) {
      return this.docker.getContainer(byLabel[0].Id);
    }

    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  private buildContainerOptions(
    config: SandboxConfig,
    containerName: string
  ): ContainerCreateOptions {
    const network = config.network ?? this.config.defaultNetwork;
    const resources = { ...this.config.defaultResources, ...config.resources };

    // Build volume bindings
    const binds: string[] = config.volumes.map((v) =>
      this.formatVolumeMount(v)
    );

    // Build port bindings
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, { HostPort: string }[]> = {};

    for (const port of config.ports) {
      const containerPort = `${port.container}/${port.protocol ?? "tcp"}`;
      exposedPorts[containerPort] = {};

      if (port.host) {
        portBindings[containerPort] = [{ HostPort: String(port.host) }];
      }
    }

    // Build environment variables
    const env = Object.entries(config.env).map(([k, v]) => `${k}=${v}`);

    // Parse memory limit to bytes
    const memoryBytes = this.parseMemoryLimit(resources.memory);

    const options: ContainerCreateOptions = {
      name: containerName,
      Image: config.image,
      Env: env,
      Labels: {
        ...config.labels,
        "agentpod.sandbox.id": config.id,
        "agentpod.sandbox.name": config.name,
        "agentpod.managed": "true",
      },
      ExposedPorts: exposedPorts,
      WorkingDir: config.workingDir,
      Cmd: config.command,
      User: config.userId,
      HostConfig: {
        Binds: binds,
        PortBindings: portBindings,
        NetworkMode: network,
        RestartPolicy: { Name: "unless-stopped" },
        // Resource limits
        NanoCpus: resources.cpus
          ? Math.floor(parseFloat(resources.cpus) * 1e9)
          : undefined,
        Memory: memoryBytes,
        MemorySwap: resources.memorySwap
          ? this.parseMemoryLimit(resources.memorySwap)
          : undefined,
        PidsLimit: resources.pidsLimit,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [network]: {},
        },
      },
    };

    return options;
  }

  private formatVolumeMount(volume: VolumeMount): string {
    const mode = volume.mode === "ro" ? "ro" : "rw";
    
    // Translate container paths to host paths when running inside Docker
    let hostPath = volume.host;
    if (this.config.hostPathPrefix) {
      // If the volume.host starts with /data (the container's data directory),
      // prepend the host path prefix to convert it to an actual host path
      if (hostPath.startsWith("/data")) {
        hostPath = `${this.config.hostPathPrefix}${hostPath}`;
      }
    }
    
    return `${hostPath}:${volume.container}:${mode}`;
  }

  private parseMemoryLimit(limit?: string): number | undefined {
    if (!limit) return undefined;

    const match = limit.match(/^(\d+(?:\.\d+)?)\s*([kmgKMG])?[bB]?$/);
    if (!match) return undefined;

    const value = parseFloat(match[1] ?? "0");
    const unit = (match[2] ?? "").toLowerCase();

    const multipliers: Record<string, number> = {
      "": 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };

    return Math.floor(value * (multipliers[unit] ?? 1));
  }

  private containerInfoToSandbox(
    sandboxId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info: any
  ): Sandbox {
    const labels = info.Config?.Labels ?? {};
    const state = info.State;

    // Build URLs from labels
    const urls: Record<string, string> = {};

    // Parse URLs from container labels if present
    for (const [key, value] of Object.entries(labels)) {
      if (key.startsWith("agentpod.url.") && typeof value === "string") {
        const urlKey = key.replace("agentpod.url.", "");
        urls[urlKey] = value;
      }
    }

    return {
      id: sandboxId,
      containerId: info.Id,
      name: labels["agentpod.sandbox.name"] ?? info.Name?.replace(/^\//, "") ?? sandboxId,
      status: this.mapContainerState(state),
      urls,
      createdAt: new Date(info.Created),
      startedAt: state?.StartedAt ? new Date(state.StartedAt) : undefined,
      image: info.Config?.Image ?? "",
      labels, // Include all container labels
      health: state?.Health
        ? {
            status: state.Health.Status,
            failingStreak: state.Health.FailingStreak ?? 0,
            lastCheck: state.Health.Log?.[0]?.End
              ? new Date(state.Health.Log[0].End)
              : undefined,
          }
        : undefined,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapContainerState(state: any): SandboxStatus {
    if (!state) return "unknown";

    if (state.Running) {
      if (state.Paused) return "paused";
      if (state.Restarting) return "restarting";
      return "running";
    }

    if (state.Dead) return "dead";
    if (state.Status === "created") return "creating";
    if (state.Status === "exited") return "exited";
    if (state.Status === "removing") return "removing";

    return "stopped";
  }

  private sandboxStatusToDocker(status: SandboxStatus): string {
    const mapping: Record<SandboxStatus, string> = {
      creating: "created",
      running: "running",
      stopped: "exited",
      paused: "paused",
      restarting: "restarting",
      removing: "removing",
      exited: "exited",
      dead: "dead",
      error: "dead",
      unknown: "exited",
    };
    return mapping[status] ?? "exited";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseContainerStats(stats: any): SandboxStats {
    // CPU calculation
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus ?? 1;
    const cpuPercent =
      systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    // Memory calculation
    const memoryUsage = stats.memory_stats.usage ?? 0;
    const memoryLimit = stats.memory_stats.limit ?? 0;
    const memoryPercent =
      memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

    // Network I/O
    let networkRx = 0;
    let networkTx = 0;
    if (stats.networks) {
      for (const net of Object.values(stats.networks) as { rx_bytes: number; tx_bytes: number }[]) {
        networkRx += net.rx_bytes ?? 0;
        networkTx += net.tx_bytes ?? 0;
      }
    }

    // Block I/O
    let blockRead = 0;
    let blockWrite = 0;
    if (stats.blkio_stats?.io_service_bytes_recursive) {
      for (const io of stats.blkio_stats.io_service_bytes_recursive) {
        if (io.op === "Read") blockRead += io.value;
        if (io.op === "Write") blockWrite += io.value;
      }
    }

    return {
      cpuPercent,
      memoryUsage,
      memoryLimit,
      memoryPercent,
      networkRx,
      networkTx,
      blockRead,
      blockWrite,
    };
  }

  /**
   * Demux Docker stream output
   * Docker uses a multiplexed stream format with 8-byte headers
   */
  private demuxDockerOutput(buffer: Buffer): string {
    const output: string[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      // Check if we have enough bytes for the header
      if (offset + 8 > buffer.length) {
        // Not enough data for header, treat rest as raw output
        output.push(buffer.subarray(offset).toString("utf8"));
        break;
      }

      // Read the header
      const streamType = buffer.readUInt8(offset);
      const size = buffer.readUInt32BE(offset + 4);

      // Check if this looks like a valid Docker stream header
      // Stream type should be 0 (stdin), 1 (stdout), or 2 (stderr)
      if (streamType > 2 || size > buffer.length - offset - 8) {
        // Invalid header, treat as raw output
        output.push(buffer.subarray(offset).toString("utf8"));
        break;
      }

      // Extract the payload
      const payload = buffer.subarray(offset + 8, offset + 8 + size);
      output.push(payload.toString("utf8"));

      offset += 8 + size;
    }

    return output.join("");
  }
}
