import { test, expect, vi, beforeEach } from "vitest";
import * as api from "$lib/api/client";
import { nodes, fetchNodes } from "./nodes.svelte";

beforeEach(() => vi.restoreAllMocks());

test("fetchNodes populates the list", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue([
    { id: "node_1", name: "vps1", hostname: "vps1", os: "linux", arch: "amd64", cpuCount: 4, status: "online", lastSeenAt: null, createdAt: "2026-06-22T00:00:00Z", agentVersion: null, latestVersion: null, updateAvailable: false },
  ]);
  await fetchNodes();
  expect(nodes.list).toHaveLength(1);
  expect(nodes.list[0].status).toBe("online");
});
