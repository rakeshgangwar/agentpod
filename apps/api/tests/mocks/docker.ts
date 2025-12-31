/**
 * Docker Orchestrator Mock
 *
 * Provides a mock implementation of DockerOrchestrator for testing.
 * Uses in-memory data structures instead of actual Docker API calls.
 */

import { mock } from 'bun:test';
import type {
  Sandbox,
  SandboxConfig,
  SandboxStatus,
  SandboxStats,
  ExecResult,
  ExecOptions,
  ImageInfo,
  ImagePullProgress,
  NetworkInfo,
  LogOptions,
  DockerInfo,
  SandboxFilter,
} from '../../src/services/orchestrator/types';

// =============================================================================
// Types
// =============================================================================

export interface MockSandboxData {
  id: string;
  containerId: string;
  name: string;
  status: SandboxStatus;
  image: string;
  urls: Record<string, string>;
  createdAt: Date;
  startedAt?: Date;
  labels: Record<string, string>;
  logs: string[];
}

export interface MockImageData {
  name: string;
  id: string;
  size: number;
  created: Date;
  labels?: Record<string, string>;
}

// =============================================================================
// Mock State
// =============================================================================

let mockSandboxes: Map<string, MockSandboxData> = new Map();
let mockImages: Map<string, MockImageData> = new Map();
let mockNetworks: Map<string, NetworkInfo> = new Map();
let mockHealthy = true;
let mockDockerInfo: DockerInfo = {
  version: '24.0.0',
  apiVersion: '1.43',
  os: 'linux',
  arch: 'amd64',
  cpus: 8,
  totalMemory: 16 * 1024 * 1024 * 1024, // 16GB
  containersRunning: 0,
  containersStopped: 0,
  images: 0,
};

// Track method calls for assertions
export const mockCalls = {
  createSandbox: [] as SandboxConfig[],
  startSandbox: [] as string[],
  stopSandbox: [] as Array<{ id: string; timeout?: number }>,
  restartSandbox: [] as Array<{ id: string; timeout?: number }>,
  deleteSandbox: [] as Array<{ id: string; removeVolumes?: boolean }>,
  pauseSandbox: [] as string[],
  unpauseSandbox: [] as string[],
  exec: [] as Array<{ id: string; command: string[]; options?: ExecOptions }>,
  getLogs: [] as Array<{ id: string; options?: LogOptions }>,
  pullImage: [] as string[],
};

// =============================================================================
// Reset Function
// =============================================================================

/**
 * Reset all mock state - call this in beforeEach
 */
export function resetDockerMock(): void {
  mockSandboxes = new Map();
  mockImages = new Map();
  mockNetworks = new Map();
  mockHealthy = true;
  mockDockerInfo = {
    version: '24.0.0',
    apiVersion: '1.43',
    os: 'linux',
    arch: 'amd64',
    cpus: 8,
    totalMemory: 16 * 1024 * 1024 * 1024,
    containersRunning: 0,
    containersStopped: 0,
    images: 0,
  };

  // Reset call tracking
  Object.keys(mockCalls).forEach((key) => {
    (mockCalls as Record<string, unknown[]>)[key] = [];
  });
}

// =============================================================================
// Mock Configuration Functions
// =============================================================================

/**
 * Add a mock sandbox to the state
 */
export function addMockSandbox(data: Partial<MockSandboxData> & { id: string }): MockSandboxData {
  const sandbox: MockSandboxData = {
    id: data.id,
    containerId: data.containerId ?? `container-${data.id}`,
    name: data.name ?? `sandbox-${data.id}`,
    status: data.status ?? 'running',
    image: data.image ?? 'agentpod/opencode:latest',
    urls: data.urls ?? { opencode: `http://localhost:3000` },
    createdAt: data.createdAt ?? new Date(),
    startedAt: data.startedAt ?? new Date(),
    labels: data.labels ?? { 'agentpod.managed': 'true' },
    logs: data.logs ?? [],
  };
  mockSandboxes.set(data.id, sandbox);
  return sandbox;
}

/**
 * Add a mock image to the state
 */
export function addMockImage(data: Partial<MockImageData> & { name: string }): MockImageData {
  const image: MockImageData = {
    name: data.name,
    id: data.id ?? `sha256:${Math.random().toString(36).substring(2)}`,
    size: data.size ?? 500 * 1024 * 1024, // 500MB default
    created: data.created ?? new Date(),
    labels: data.labels,
  };
  mockImages.set(data.name, image);
  return image;
}

/**
 * Set Docker health status
 */
export function setMockDockerHealth(healthy: boolean): void {
  mockHealthy = healthy;
}

/**
 * Set Docker info
 */
export function setMockDockerInfo(info: Partial<DockerInfo>): void {
  mockDockerInfo = { ...mockDockerInfo, ...info };
}

/**
 * Get a mock sandbox by ID
 */
export function getMockSandbox(id: string): MockSandboxData | undefined {
  return mockSandboxes.get(id);
}

/**
 * Update a mock sandbox
 */
export function updateMockSandbox(id: string, updates: Partial<MockSandboxData>): void {
  const existing = mockSandboxes.get(id);
  if (existing) {
    mockSandboxes.set(id, { ...existing, ...updates });
  }
}

// =============================================================================
// Mock DockerOrchestrator Class
// =============================================================================

export class MockDockerOrchestrator {
  // ===========================================================================
  // Lifecycle Management
  // ===========================================================================

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    mockCalls.createSandbox.push(config);

    const sandbox = addMockSandbox({
      id: config.id,
      name: config.name,
      image: config.image,
      status: 'running',
      labels: config.labels,
    });

    return this.toSandbox(sandbox);
  }

  async startSandbox(id: string): Promise<void> {
    mockCalls.startSandbox.push(id);
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }
    sandbox.status = 'running';
    sandbox.startedAt = new Date();
  }

  async stopSandbox(id: string, timeout = 10): Promise<void> {
    mockCalls.stopSandbox.push({ id, timeout });
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }
    sandbox.status = 'stopped';
  }

  async restartSandbox(id: string, timeout = 10): Promise<void> {
    mockCalls.restartSandbox.push({ id, timeout });
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }
    sandbox.status = 'running';
    sandbox.startedAt = new Date();
  }

  async deleteSandbox(id: string, removeVolumes = false): Promise<void> {
    mockCalls.deleteSandbox.push({ id, removeVolumes });
    if (!mockSandboxes.has(id)) {
      throw new Error(`Sandbox not found: ${id}`);
    }
    mockSandboxes.delete(id);
  }

  async pauseSandbox(id: string): Promise<void> {
    mockCalls.pauseSandbox.push(id);
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }
    sandbox.status = 'paused';
  }

  async unpauseSandbox(id: string): Promise<void> {
    mockCalls.unpauseSandbox.push(id);
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }
    sandbox.status = 'running';
  }

  // ===========================================================================
  // Status & Information
  // ===========================================================================

  async getSandboxStatus(id: string): Promise<SandboxStatus> {
    const sandbox = mockSandboxes.get(id);
    return sandbox?.status ?? 'unknown';
  }

  async getSandbox(id: string): Promise<Sandbox | null> {
    const sandbox = mockSandboxes.get(id);
    return sandbox ? this.toSandbox(sandbox) : null;
  }

  async listSandboxes(filter?: SandboxFilter): Promise<Sandbox[]> {
    let sandboxes = Array.from(mockSandboxes.values());

    // Apply filters
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      sandboxes = sandboxes.filter((s) => statuses.includes(s.status));
    }

    if (filter?.name) {
      sandboxes = sandboxes.filter((s) => s.name.includes(filter.name!));
    }

    if (filter?.labels) {
      sandboxes = sandboxes.filter((s) => {
        return Object.entries(filter.labels!).every(
          ([key, value]) => s.labels[key] === value
        );
      });
    }

    if (filter?.createdAfter) {
      sandboxes = sandboxes.filter((s) => s.createdAt >= filter.createdAfter!);
    }

    if (filter?.createdBefore) {
      sandboxes = sandboxes.filter((s) => s.createdAt <= filter.createdBefore!);
    }

    return sandboxes.map((s) => this.toSandbox(s));
  }

  async getSandboxStats(id: string): Promise<SandboxStats> {
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    // Return mock stats
    return {
      cpuPercent: Math.random() * 50,
      memoryUsage: Math.floor(Math.random() * 500 * 1024 * 1024),
      memoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
      memoryPercent: Math.random() * 25,
      networkRx: Math.floor(Math.random() * 1024 * 1024),
      networkTx: Math.floor(Math.random() * 1024 * 1024),
      blockRead: Math.floor(Math.random() * 10 * 1024 * 1024),
      blockWrite: Math.floor(Math.random() * 5 * 1024 * 1024),
    };
  }

  async sandboxExists(id: string): Promise<boolean> {
    return mockSandboxes.has(id);
  }

  // ===========================================================================
  // Logs
  // ===========================================================================

  async getLogs(id: string, options?: LogOptions): Promise<string> {
    mockCalls.getLogs.push({ id, options });
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    let logs = sandbox.logs;
    if (options?.tail) {
      logs = logs.slice(-options.tail);
    }
    return logs.join('\n');
  }

  async *streamLogs(id: string, _options?: LogOptions): AsyncIterable<string> {
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    for (const log of sandbox.logs) {
      yield log + '\n';
    }
  }

  // ===========================================================================
  // Command Execution
  // ===========================================================================

  async exec(id: string, command: string[], options?: ExecOptions): Promise<ExecResult> {
    mockCalls.exec.push({ id, command, options });
    const sandbox = mockSandboxes.get(id);
    if (!sandbox) {
      throw new Error(`Sandbox not found: ${id}`);
    }

    // Default mock implementation returns empty success
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
  }

  // ===========================================================================
  // Image Management
  // ===========================================================================

  async pullImage(imageName: string, onProgress?: (progress: ImagePullProgress) => void): Promise<void> {
    mockCalls.pullImage.push(imageName);

    // Simulate progress callbacks
    if (onProgress) {
      onProgress({ status: 'Pulling from library/image', progress: '10%' });
      onProgress({ status: 'Download complete', progress: '100%' });
    }

    // Add to mock images
    if (!mockImages.has(imageName)) {
      addMockImage({ name: imageName });
    }
  }

  async imageExists(imageName: string): Promise<boolean> {
    return mockImages.has(imageName);
  }

  async getImage(imageName: string): Promise<ImageInfo | null> {
    const image = mockImages.get(imageName);
    return image
      ? {
          name: image.name,
          id: image.id,
          size: image.size,
          created: image.created,
          labels: image.labels,
        }
      : null;
  }

  async listImages(filter?: string): Promise<ImageInfo[]> {
    let images = Array.from(mockImages.values());
    if (filter) {
      images = images.filter((i) => i.name.includes(filter));
    }
    return images.map((i) => ({
      name: i.name,
      id: i.id,
      size: i.size,
      created: i.created,
      labels: i.labels,
    }));
  }

  async removeImage(imageName: string, _force = false): Promise<void> {
    mockImages.delete(imageName);
  }

  // ===========================================================================
  // Network Management
  // ===========================================================================

  async ensureNetwork(networkName?: string): Promise<string> {
    const name = networkName ?? 'agentpod-net';
    if (!mockNetworks.has(name)) {
      mockNetworks.set(name, {
        id: `network-${name}`,
        name,
        driver: 'bridge',
        scope: 'local',
        internal: false,
        containers: [],
      });
    }
    return mockNetworks.get(name)!.id;
  }

  async getNetwork(networkName: string): Promise<NetworkInfo | null> {
    return mockNetworks.get(networkName) ?? null;
  }

  // ===========================================================================
  // Health & Events
  // ===========================================================================

  async healthCheck(): Promise<boolean> {
    return mockHealthy;
  }

  async getInfo(): Promise<DockerInfo> {
    return mockDockerInfo;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private toSandbox(data: MockSandboxData): Sandbox {
    return {
      id: data.id,
      containerId: data.containerId,
      name: data.name,
      status: data.status,
      urls: data.urls,
      createdAt: data.createdAt,
      startedAt: data.startedAt,
      image: data.image,
      labels: data.labels,
    };
  }
}

// =============================================================================
// Mock Factory
// =============================================================================

/**
 * Create a mock DockerOrchestrator instance
 */
export function createMockDockerOrchestrator(): MockDockerOrchestrator {
  return new MockDockerOrchestrator();
}

/**
 * Create a Bun mock function that returns the mock orchestrator
 */
export function mockDockerOrchestratorModule(): void {
  // This can be used with Bun's mock.module if needed
  mock.module('../../src/services/orchestrator/docker', () => ({
    DockerOrchestrator: MockDockerOrchestrator,
  }));
}
