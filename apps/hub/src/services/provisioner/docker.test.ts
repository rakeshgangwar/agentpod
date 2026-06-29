/**
 * Unit tests: DockerRuntimeProvisioner (P4 Task 5)
 *
 * Pure unit test — no real Docker daemon.  All Docker interactions go through
 * a FakeDockerOrchestrator that captures calls and returns controlled responses.
 *
 * RED → GREEN: run `cd apps/hub && bun test provisioner/docker`
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DockerRuntimeProvisioner } from "./docker";
import type { DockerOrchestrator } from "../orchestrator/docker";
import type { SandboxConfig, Sandbox } from "../orchestrator/types";

// ─── Fake container id returned by the fake orchestrator ─────────────────────

const FAKE_CONTAINER_ID = "deadbeef000000000000000000000000";

// ─── Recorded call shape ──────────────────────────────────────────────────────

interface RecordedCall {
  method: string;
  args: unknown[];
}

// ─── Fake orchestrator ────────────────────────────────────────────────────────

/**
 * Minimal fake that implements only the four methods used by
 * DockerRuntimeProvisioner.  Cast to DockerOrchestrator via `as unknown`.
 */
class FakeDockerOrchestrator {
  readonly calls: RecordedCall[] = [];
  capturedConfig: SandboxConfig | null = null;

  async createSandbox(config: SandboxConfig): Promise<Sandbox> {
    this.capturedConfig = config;
    this.calls.push({ method: "createSandbox", args: [config] });
    return {
      id: config.id,
      containerId: FAKE_CONTAINER_ID,
      name: config.name,
      status: "running",
      urls: {},
      createdAt: new Date(),
      image: config.image,
    };
  }

  async startSandbox(id: string): Promise<void> {
    this.calls.push({ method: "startSandbox", args: [id] });
  }

  async stopSandbox(id: string, timeout?: number): Promise<void> {
    this.calls.push({ method: "stopSandbox", args: [id, timeout] });
  }

  async deleteSandbox(id: string, removeVolumes: boolean): Promise<void> {
    this.calls.push({ method: "deleteSandbox", args: [id, removeVolumes] });
  }

  /** Helper: find a recorded call by method name */
  callTo(method: string): RecordedCall | undefined {
    return this.calls.find((c) => c.method === method);
  }

  /** Helper: count recorded calls by method name */
  countCalls(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProvisioner(fake: FakeDockerOrchestrator): DockerRuntimeProvisioner {
  return new DockerRuntimeProvisioner(fake as unknown as DockerOrchestrator);
}

const BASE_SPEC = {
  runtimeId: "rt_1",
  name: "box1",
  resourceTier: "small" as const,
  hubUrl: "http://h:3001",
  enrollToken: "enr_x",
};

// ─── Env snapshot ─────────────────────────────────────────────────────────────

let savedNodeAgentImage: string | undefined;

beforeEach(() => {
  savedNodeAgentImage = process.env.NODE_AGENT_IMAGE;
  delete process.env.NODE_AGENT_IMAGE;
});

afterEach(() => {
  if (savedNodeAgentImage !== undefined) {
    process.env.NODE_AGENT_IMAGE = savedNodeAgentImage;
  } else {
    delete process.env.NODE_AGENT_IMAGE;
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DockerRuntimeProvisioner", () => {
  it('provider === "docker"', () => {
    const p = makeProvisioner(new FakeDockerOrchestrator());
    expect(p.provider).toBe("docker");
  });

  describe("provision", () => {
    it("calls createSandbox exactly once", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.countCalls("createSandbox")).toBe(1);
    });

    it("returns externalId equal to the fake container id", async () => {
      const fake = new FakeDockerOrchestrator();
      const result = await makeProvisioner(fake).provision(BASE_SPEC);
      expect(result.externalId).toBe(FAKE_CONTAINER_ID);
    });

    it("uses the default node-agent image when NODE_AGENT_IMAGE is unset", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.capturedConfig!.image).toBe("agentpod-node:local");
    });

    it("respects NODE_AGENT_IMAGE env override", async () => {
      process.env.NODE_AGENT_IMAGE = "my-registry/agentpod-node:v2";
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.capturedConfig!.image).toBe("my-registry/agentpod-node:v2");
    });

    it("sets AGENTPOD_HUB_URL in env", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.capturedConfig!.env["AGENTPOD_HUB_URL"]).toBe("http://h:3001");
    });

    it("sets AGENTPOD_ENROLL_TOKEN in env", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.capturedConfig!.env["AGENTPOD_ENROLL_TOKEN"]).toBe("enr_x");
    });

    it("sets agentpod.runtime.id label to spec.runtimeId", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.capturedConfig!.labels["agentpod.runtime.id"]).toBe("rt_1");
    });

    it('sets agentpod.managed label to "true"', async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.capturedConfig!.labels["agentpod.managed"]).toBe("true");
    });

    it("maps resourceTier small to low CPU/memory", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision({ ...BASE_SPEC, resourceTier: "small" });
      expect(fake.capturedConfig!.resources.cpus).toBe("0.5");
      expect(fake.capturedConfig!.resources.memory).toBe("512m");
    });

    it("maps resourceTier medium to 1 CPU / 2g memory", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision({ ...BASE_SPEC, resourceTier: "medium" });
      expect(fake.capturedConfig!.resources.cpus).toBe("1.0");
      expect(fake.capturedConfig!.resources.memory).toBe("2g");
    });

    it("maps resourceTier large to 2 CPU / 4g memory", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision({ ...BASE_SPEC, resourceTier: "large" });
      expect(fake.capturedConfig!.resources.cpus).toBe("2.0");
      expect(fake.capturedConfig!.resources.memory).toBe("4g");
    });

    it("opens no ports (node-agent does not expose a preview port)", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).provision(BASE_SPEC);
      expect(fake.capturedConfig!.ports).toHaveLength(0);
    });
  });

  describe("destroy", () => {
    it("calls deleteSandbox with the given id", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).destroy("c1");
      const call = fake.callTo("deleteSandbox");
      expect(call).toBeDefined();
      expect(call!.args[0]).toBe("c1");
    });

    it("passes removeVolumes=true to deleteSandbox", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).destroy("c1");
      const call = fake.callTo("deleteSandbox");
      expect(call!.args[1]).toBe(true);
    });
  });

  describe("start", () => {
    it("calls startSandbox with the given id", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).start("c1");
      const call = fake.callTo("startSandbox");
      expect(call).toBeDefined();
      expect(call!.args[0]).toBe("c1");
    });
  });

  describe("stop", () => {
    it("calls stopSandbox with the given id", async () => {
      const fake = new FakeDockerOrchestrator();
      await makeProvisioner(fake).stop("c1");
      const call = fake.callTo("stopSandbox");
      expect(call).toBeDefined();
      expect(call!.args[0]).toBe("c1");
    });
  });
});
