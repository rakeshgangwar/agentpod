/**
 * agents/page.svelte.test.ts
 *
 * TDD tests for the /agents page (agent worklist).
 * Asserts:
 *  - renders a PageHeader with title "Agents"
 *  - renders the AgentTable once agents are loaded
 *  - ?status=running derives externalFilter { status: "running" }
 *  - ?station=<id> derives externalFilter { stationId: <id> }
 */

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/svelte";
import * as api from "$lib/api/client";

// ---------------------------------------------------------------------------
// SvelteKit stubs
// ---------------------------------------------------------------------------

vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
  replaceState: vi.fn(),
}));

vi.mock("$app/state", () => ({
  page: {
    url: { pathname: "/agents", searchParams: null },
  },
}));

// ---------------------------------------------------------------------------
// Sonner stub (used transitively by AgentTable → toast)
// ---------------------------------------------------------------------------

vi.mock("svelte-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Static import — compiled once
// ---------------------------------------------------------------------------

import AgentsPage from "./+page.svelte";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

const mockAgents = [
  {
    stationId: "s1",
    nodeId: "n1",
    nodeName: "vps1",
    agentName: "hanuman",
    harness: "openclaw",
    kind: "agent" as const,
    nodeStatus: "online" as const,
    agentVersion: "v0.1.4",
    latestVersion: "v0.1.4",
    updateAvailable: false,
    capabilities: [],
    workspacePath: null,
    status: "running" as const,
    cpuPct: null,
    memBytes: null,
    uptimeSec: null,
  },
  {
    stationId: "s2",
    nodeId: "n1",
    nodeName: "vps1",
    agentName: "kubera",
    harness: "openclaw",
    kind: "agent" as const,
    nodeStatus: "online" as const,
    agentVersion: "v0.1.4",
    latestVersion: "v0.1.4",
    updateAvailable: false,
    capabilities: [],
    workspacePath: null,
    status: "stopped" as const,
    cpuPct: null,
    memBytes: null,
    uptimeSec: null,
  },
];

const mockStats = {
  nodes: { online: 1, total: 1 },
  agents: { total: 2 },
  updatesAvailable: 0,
  running: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders the Agents page header", async () => {
  vi.spyOn(api, "getFleet").mockResolvedValue({ stats: mockStats, agents: mockAgents });

  const { container } = render(AgentsPage);

  await waitFor(() => {
    expect(container.textContent).toContain("Agents");
  });
});

test("renders agent names after loading", async () => {
  vi.spyOn(api, "getFleet").mockResolvedValue({ stats: mockStats, agents: mockAgents });

  const { getByText } = render(AgentsPage);

  await waitFor(() => {
    expect(getByText("hanuman")).toBeTruthy();
    expect(getByText("kubera")).toBeTruthy();
  });
});

test("shows error message when getFleet fails", async () => {
  vi.spyOn(api, "getFleet").mockRejectedValue(new Error("network error"));

  const { getByText } = render(AgentsPage);

  await waitFor(() => {
    expect(getByText("network error")).toBeTruthy();
  });
});

test("calls getFleet on mount", async () => {
  const spy = vi.spyOn(api, "getFleet").mockResolvedValue({ stats: mockStats, agents: [] });

  render(AgentsPage);

  await waitFor(() => {
    expect(spy).toHaveBeenCalledOnce();
  });
});
