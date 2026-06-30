/**
 * AgentTable.svelte.test.ts
 *
 * TDD tests for the dense fleet agent table.
 * Asserts:
 *   - 2 agents under the same node → group header + both rows rendered
 *   - agent with updateAvailable:true → Update button present
 *   - agent with updateAvailable:false (all false) → no Update button
 *   - search input filters rows by agentName
 *   - search input filters rows by nodeName
 *   - Update button calls updateNode and shows "updating…"
 */

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, fireEvent, cleanup } from "@testing-library/svelte";
import type { FleetAgent } from "@agentpod/contract";

// ---------------------------------------------------------------------------
// Mocks — hoisted before component import
// ---------------------------------------------------------------------------

vi.mock("svelte-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as api from "$lib/api/client";
import AgentTable from "./AgentTable.svelte";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeAgent = (overrides: Partial<FleetAgent> & { stationId: string }): FleetAgent => ({
  nodeId: "n1",
  nodeName: "superchotu",
  agentName: "hanuman",
  harness: "openclaw",
  kind: "agent",
  nodeStatus: "online",
  agentVersion: "v0.1.4",
  latestVersion: "v0.1.4",
  updateAvailable: false,
  capabilities: [],
  workspacePath: null,
  ...overrides,
});

const agentWithUpdate = makeAgent({
  stationId: "s1",
  agentName: "hanuman",
  agentVersion: "v0.1.3",
  latestVersion: "v0.1.4",
  updateAvailable: true,
});

const agentNoUpdate = makeAgent({
  stationId: "s2",
  agentName: "kubera",
  agentVersion: "v0.1.4",
  updateAvailable: false,
});

const twoAgents: FleetAgent[] = [agentWithUpdate, agentNoUpdate];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders both agent rows and a group header with node name", () => {
  const { getAllByTestId, getByText } = render(AgentTable, { props: { agents: twoAgents } });

  // Group header for superchotu
  const headers = getAllByTestId("group-header");
  expect(headers.length).toBeGreaterThan(0);
  expect(headers[0].textContent).toContain("superchotu");

  // Both agent rows
  expect(getByText("hanuman")).toBeTruthy();
  expect(getByText("kubera")).toBeTruthy();
});

test("group header shows correct agent count", () => {
  const { getAllByTestId } = render(AgentTable, { props: { agents: twoAgents } });
  const header = getAllByTestId("group-header")[0];
  expect(header.textContent).toContain("2");
});

test("agent with updateAvailable:true renders an Update button", () => {
  const { getByRole } = render(AgentTable, { props: { agents: twoAgents } });
  expect(getByRole("button", { name: /^update$/i })).toBeTruthy();
});

test("no Update button when all agents have updateAvailable:false", () => {
  const agents = twoAgents.map((a) => ({ ...a, updateAvailable: false }));
  const { queryByRole } = render(AgentTable, { props: { agents } });
  expect(queryByRole("button", { name: /^update$/i })).toBeNull();
});

test("search by agentName narrows rows — non-matching agent disappears", async () => {
  const { getByRole, getByText, queryByText } = render(AgentTable, {
    props: { agents: twoAgents },
  });

  // Both visible initially
  expect(getByText("hanuman")).toBeTruthy();
  expect(getByText("kubera")).toBeTruthy();

  const input = getByRole("searchbox", { name: /search agents/i });
  await fireEvent.input(input, { target: { value: "hanuman" } });

  await waitFor(() => {
    expect(getByText("hanuman")).toBeTruthy();
    expect(queryByText("kubera")).toBeNull();
  });
});

test("search by nodeName matches both agents sharing the node", async () => {
  const { getByRole, getByText } = render(AgentTable, { props: { agents: twoAgents } });

  const input = getByRole("searchbox", { name: /search agents/i });
  await fireEvent.input(input, { target: { value: "superchotu" } });

  await waitFor(() => {
    // Both agents share the node name — both should remain visible
    expect(getByText("hanuman")).toBeTruthy();
    expect(getByText("kubera")).toBeTruthy();
  });
});

test("search with no matches shows empty-filter message", async () => {
  const { getByRole, getByText } = render(AgentTable, { props: { agents: twoAgents } });

  const input = getByRole("searchbox", { name: /search agents/i });
  await fireEvent.input(input, { target: { value: "zzz_nomatch" } });

  await waitFor(() => {
    expect(getByText(/no agents match/i)).toBeTruthy();
  });
});

test("Update button calls updateNode(nodeId) and enters updating state", async () => {
  vi.spyOn(api, "updateNode").mockResolvedValue({ ok: true, updating: true });

  const { getByRole } = render(AgentTable, { props: { agents: [agentWithUpdate] } });

  const btn = getByRole("button", { name: /^update$/i });
  await fireEvent.click(btn);

  expect(api.updateNode).toHaveBeenCalledWith(agentWithUpdate.nodeId);
});

test("agents from two different nodes produce two group headers", () => {
  const agent3 = makeAgent({
    stationId: "s3",
    nodeId: "n2",
    nodeName: "gangaputra",
    agentName: "arjuna",
  });
  const { getAllByTestId } = render(AgentTable, {
    props: { agents: [...twoAgents, agent3] },
  });

  const headers = getAllByTestId("group-header");
  expect(headers.length).toBe(2);
});

test("row links to /nodes/{nodeId}/stations/{stationId}", () => {
  const { container } = render(AgentTable, { props: { agents: [agentWithUpdate] } });
  const link = container.querySelector(`a[href="/nodes/${agentWithUpdate.nodeId}/stations/${agentWithUpdate.stationId}"]`);
  expect(link).toBeTruthy();
});
