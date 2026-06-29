/**
 * Docker runtime provisioner driver (P4 Task 5).
 *
 * Creates and manages node-agent containers via the DockerOrchestrator.
 * The container is started with AGENTPOD_HUB_URL and AGENTPOD_ENROLL_TOKEN
 * injected so the node-agent can auto-enroll into the fleet.
 *
 * SECURITY: the enrollment token is written into the container env but is
 * never logged by this module.
 */

import type { RuntimeProvisioner, ProvisionSpec } from "./types";
import { DockerOrchestrator } from "../orchestrator/docker";
import type { ResourceLimits } from "../orchestrator/types";

// ─── Resource tier mapping ────────────────────────────────────────────────────

/**
 * Maps P4 resource tier names (small/medium/large) to Docker resource limits.
 * Mirrors the existing getResourcesForTier approach in docker-provider.ts.
 */
const RUNTIME_RESOURCE_TIERS: Record<
  "small" | "medium" | "large",
  ResourceLimits
> = {
  small:  { cpus: "0.5", memory: "512m",  pidsLimit: 100 },
  medium: { cpus: "1.0", memory: "2g",    pidsLimit: 256 },
  large:  { cpus: "2.0", memory: "4g",    pidsLimit: 512 },
};

// ─── Driver ───────────────────────────────────────────────────────────────────

export class DockerRuntimeProvisioner implements RuntimeProvisioner {
  readonly provider = "docker" as const;

  /**
   * @param orchestrator Injected for testing; defaults to a real DockerOrchestrator
   *   (no-arg constructor uses socket defaults from DockerOrchestratorConfig).
   */
  constructor(
    private readonly orchestrator: DockerOrchestrator = new DockerOrchestrator()
  ) {}

  /**
   * Create and start a node-agent container.
   *
   * Image is read from NODE_AGENT_IMAGE env at call time (not constructor time)
   * so that tests can override it per-invocation.
   *
   * Returns the Docker container ID (sandbox.containerId) as externalId.
   */
  async provision(spec: ProvisionSpec): Promise<{ externalId: string }> {
    const image = process.env.NODE_AGENT_IMAGE ?? "agentpod-node:local";
    const resources = RUNTIME_RESOURCE_TIERS[spec.resourceTier];

    const sandbox = await this.orchestrator.createSandbox({
      id: spec.runtimeId,
      name: spec.name,
      image,
      env: {
        AGENTPOD_HUB_URL: spec.hubUrl,
        // NOTE: enrollToken is injected here but never logged anywhere in
        // this module.  Do not add log statements that reference spec.enrollToken.
        AGENTPOD_ENROLL_TOKEN: spec.enrollToken,
      },
      volumes: [],
      ports: [],
      labels: {
        "agentpod.runtime.id": spec.runtimeId,
        "agentpod.managed": "true",
      },
      resources,
    });

    return { externalId: sandbox.containerId };
  }

  /**
   * Permanently remove the container and its volumes.
   */
  async destroy(externalId: string): Promise<void> {
    await this.orchestrator.deleteSandbox(externalId, true);
  }

  /**
   * Start a previously stopped container.
   */
  async start(externalId: string): Promise<void> {
    await this.orchestrator.startSandbox(externalId);
  }

  /**
   * Stop a running container (without removing it).
   */
  async stop(externalId: string): Promise<void> {
    await this.orchestrator.stopSandbox(externalId);
  }
}
