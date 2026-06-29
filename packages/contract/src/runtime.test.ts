import { describe, it, expect } from "bun:test";
import { ProvisionRequest, ProvisionedRuntime } from "./runtime";

describe("ProvisionRequest", () => {
  it("applies default resourceTier=small when omitted", () => {
    const result = ProvisionRequest.parse({ provider: "docker", name: "box1" });
    expect(result.resourceTier).toBe("small");
  });

  it("throws for an invalid provider", () => {
    expect(() => ProvisionRequest.parse({ provider: "bogus", name: "x" })).toThrow();
  });

  it("throws when name is empty string (min 1)", () => {
    expect(() => ProvisionRequest.parse({ provider: "docker", name: "" })).toThrow();
  });
});

describe("ProvisionedRuntime", () => {
  const valid = {
    id: "rt-1",
    ownerId: "user-1",
    provider: "docker",
    externalId: "container-abc",
    status: "provisioning",
    nodeId: "node-1",
    name: "box1",
    resourceTier: "small",
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
  };

  it("round-trips a full valid object", () => {
    const result = ProvisionedRuntime.parse(valid);
    expect(result.id).toBe("rt-1");
    expect(result.provider).toBe("docker");
    expect(result.status).toBe("provisioning");
    expect(result.resourceTier).toBe("small");
  });

  it("accepts null for externalId and nodeId", () => {
    const result = ProvisionedRuntime.parse({ ...valid, externalId: null, nodeId: null });
    expect(result.externalId).toBeNull();
    expect(result.nodeId).toBeNull();
  });
});
