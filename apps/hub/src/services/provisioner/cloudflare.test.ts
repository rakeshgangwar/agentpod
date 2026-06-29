/**
 * Unit tests: CloudflareRuntimeProvisioner (P4 Task 6)
 *
 * Pure unit test — no real Cloudflare.  All HTTP interactions go through
 * a fakeFetch that records (url, init) calls and returns canned Response-like
 * objects.
 *
 * RED → GREEN: run `cd apps/hub && bun test provisioner/cloudflare`
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CloudflareRuntimeProvisioner } from "./cloudflare";

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RecordedFetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** Build a minimal fetch-compatible function that returns a JSON response. */
function makeFakeFetch(body: unknown, status = 200) {
  const calls: RecordedFetchCall[] = [];

  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };

  return { fakeFetch: fakeFetch as unknown as typeof globalThis.fetch, calls };
}

// ─── Shared spec ─────────────────────────────────────────────────────────────

const BASE_SPEC = {
  runtimeId: "rt_1",
  name: "box1",
  image: "agentpod-node:local",
  resourceTier: "small" as const,
  hubUrl: "http://h:3001",
  enrollToken: "enr_x",
};

// No env snapshot needed — the Cloudflare driver no longer reads NODE_AGENT_IMAGE;
// image resolution happens in the service layer (imageForHarness) and is passed
// via ProvisionSpec.image.

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CloudflareRuntimeProvisioner", () => {
  it('provider === "cloudflare"', () => {
    const { fakeFetch } = makeFakeFetch({});
    const p = new CloudflareRuntimeProvisioner({
      workerUrl: "https://w.example",
      apiToken: "cf_tok",
      fetchImpl: fakeFetch,
    });
    expect(p.provider).toBe("cloudflare");
  });

  it("start is undefined on the instance (ephemeral — no lifecycle)", () => {
    const { fakeFetch } = makeFakeFetch({});
    const p = new CloudflareRuntimeProvisioner({
      workerUrl: "https://w.example",
      apiToken: "cf_tok",
      fetchImpl: fakeFetch,
    });
    // Cast via unknown because the interface marks start? as optional — confirm absent
    expect((p as unknown as Record<string, unknown>)["start"]).toBeUndefined();
  });

  it("stop is undefined on the instance (ephemeral — no lifecycle)", () => {
    const { fakeFetch } = makeFakeFetch({});
    const p = new CloudflareRuntimeProvisioner({
      workerUrl: "https://w.example",
      apiToken: "cf_tok",
      fetchImpl: fakeFetch,
    });
    expect((p as unknown as Record<string, unknown>)["stop"]).toBeUndefined();
  });

  // ─── provision ──────────────────────────────────────────────────────────────

  describe("provision", () => {
    it("POSTs to {workerUrl}/sandbox", async () => {
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("https://w.example/sandbox");
    });

    it("uses HTTP method POST", async () => {
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      expect(calls[0]!.init?.method).toBe("POST");
    });

    it("sets Authorization: Bearer <apiToken> header", async () => {
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      const headers = calls[0]!.init!.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer cf_tok");
    });

    it("sends spec.runtimeId as 'id' in the request body", async () => {
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      const body = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>;
      expect(body["id"]).toBe("rt_1");
    });

    it("sends AGENTPOD_HUB_URL in env with the correct value", async () => {
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      const body = JSON.parse(calls[0]!.init!.body as string) as { env?: Record<string, string> };
      expect(body.env?.["AGENTPOD_HUB_URL"]).toBe("http://h:3001");
    });

    it("sends AGENTPOD_ENROLL_TOKEN in env with the correct value", async () => {
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      const body = JSON.parse(calls[0]!.init!.body as string) as { env?: Record<string, string> };
      expect(body.env?.["AGENTPOD_ENROLL_TOKEN"]).toBe("enr_x");
    });

    it("returns externalId from response.sandboxId when present", async () => {
      const { fakeFetch } = makeFakeFetch({ sandboxId: "sb_abc" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      const result = await p.provision(BASE_SPEC);

      expect(result.externalId).toBe("sb_abc");
    });

    it("falls back to response.id when sandboxId is absent", async () => {
      const { fakeFetch } = makeFakeFetch({ id: "sb_from_id" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      const result = await p.provision(BASE_SPEC);

      expect(result.externalId).toBe("sb_from_id");
    });

    it("falls back to spec.runtimeId when neither sandboxId nor id is in the response", async () => {
      const { fakeFetch } = makeFakeFetch({ success: true });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      const result = await p.provision(BASE_SPEC);

      expect(result.externalId).toBe("rt_1");
    });

    it("passes spec.image to the sandbox POST body (driver is image-agnostic)", async () => {
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      const body = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>;
      expect(body["image"]).toBe(BASE_SPEC.image);
    });

    it("ignores NODE_AGENT_IMAGE env; always uses spec.image", async () => {
      process.env.NODE_AGENT_IMAGE = "my-registry/node:v2";
      const { fakeFetch, calls } = makeFakeFetch({ sandboxId: "sb_rt_1" });
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.provision(BASE_SPEC);

      const body = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>;
      // env override is irrelevant — spec.image wins
      expect(body["image"]).toBe(BASE_SPEC.image);
      delete process.env.NODE_AGENT_IMAGE;
    });

    it("throws when the worker returns a non-2xx status", async () => {
      const { fakeFetch } = makeFakeFetch({ error: "not found" }, 404);
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await expect(p.provision(BASE_SPEC)).rejects.toThrow("Cloudflare Worker error");
    });
  });

  // ─── destroy ────────────────────────────────────────────────────────────────

  describe("destroy", () => {
    it("sends DELETE to {workerUrl}/sandbox/{externalId}", async () => {
      const { fakeFetch, calls } = makeFakeFetch({});
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.destroy("sb_1");

      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("https://w.example/sandbox/sb_1");
      expect(calls[0]!.init?.method).toBe("DELETE");
    });

    it("sets Authorization: Bearer <apiToken> header on destroy", async () => {
      const { fakeFetch, calls } = makeFakeFetch({});
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await p.destroy("sb_1");

      const headers = calls[0]!.init!.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer cf_tok");
    });

    it("throws when the worker returns a non-2xx status", async () => {
      const { fakeFetch } = makeFakeFetch({ error: "not found" }, 404);
      const p = new CloudflareRuntimeProvisioner({
        workerUrl: "https://w.example",
        apiToken: "cf_tok",
        fetchImpl: fakeFetch,
      });

      await expect(p.destroy("sb_1")).rejects.toThrow("Cloudflare Worker error");
    });
  });

  // ─── constructor defaults ────────────────────────────────────────────────────

  describe("constructor defaults", () => {
    it("reads workerUrl from CLOUDFLARE_WORKER_URL env when not injected", () => {
      const original = process.env.CLOUDFLARE_WORKER_URL;
      process.env.CLOUDFLARE_WORKER_URL = "https://env-worker.example";
      try {
        const { fakeFetch } = makeFakeFetch({});
        const p = new CloudflareRuntimeProvisioner({ fetchImpl: fakeFetch });
        // Confirm construction succeeds and provider is correct
        expect(p.provider).toBe("cloudflare");
      } finally {
        if (original !== undefined) {
          process.env.CLOUDFLARE_WORKER_URL = original;
        } else {
          delete process.env.CLOUDFLARE_WORKER_URL;
        }
      }
    });
  });
});
