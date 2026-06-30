/**
 * FleetHeatmap.svelte.test.ts
 *
 * TDD tests for the interactive fleet heatmap.
 * Asserts:
 *   - renders one cell per agent
 *   - cells carry a data-status attribute matching agent.status
 *   - clicking a cell calls onSelectAgent(stationId)
 *   - legend chips appear for each status that has at least one agent
 *   - clicking a legend chip calls onFilterStatus(status)
 *   - statusCounts in the legend reflect actual agent statuses
 *   - no legend chip rendered for a status with 0 agents
 */

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/svelte";
import type { FleetAgent } from "@agentpod/contract";
import FleetHeatmap from "./FleetHeatmap.svelte";

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
  status: "running",
  cpuPct: 12.5,
  memBytes: 740 * 1024 * 1024,
  uptimeSec: 3600,
  ...overrides,
});

const agentRunning = makeAgent({ stationId: "s1", agentName: "hanuman", status: "running" });
const agentStopped = makeAgent({ stationId: "s2", agentName: "kubera", status: "stopped" });
const agentError   = makeAgent({ stationId: "s3", agentName: "arjuna", status: "error" });
const agentUnknown = makeAgent({ stationId: "s4", agentName: "bhima",  status: "unknown", cpuPct: null, memBytes: null, uptimeSec: null });

// ---------------------------------------------------------------------------
// Tests — cell rendering
// ---------------------------------------------------------------------------

test("renders one cell per agent", () => {
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentStopped, agentError],
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  expect(getAllByTestId("heatmap-cell").length).toBe(3);
});

test("renders zero cells when agents array is empty", () => {
  const { queryAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [],
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  expect(queryAllByTestId("heatmap-cell").length).toBe(0);
});

test("cells carry correct data-status attribute", () => {
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentStopped, agentError, agentUnknown],
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  const cells = getAllByTestId("heatmap-cell");
  expect(cells[0].dataset.status).toBe("running");
  expect(cells[1].dataset.status).toBe("stopped");
  expect(cells[2].dataset.status).toBe("error");
  expect(cells[3].dataset.status).toBe("unknown");
});

// ---------------------------------------------------------------------------
// Tests — cell click → onSelectAgent
// ---------------------------------------------------------------------------

test("clicking the first cell calls onSelectAgent with its stationId", async () => {
  const onSelectAgent = vi.fn();
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentStopped],
      onSelectAgent,
      onFilterStatus: vi.fn(),
    },
  });
  await fireEvent.click(getAllByTestId("heatmap-cell")[0]);
  expect(onSelectAgent).toHaveBeenCalledOnce();
  expect(onSelectAgent).toHaveBeenCalledWith("s1");
});

test("clicking the second cell calls onSelectAgent with the second stationId", async () => {
  const onSelectAgent = vi.fn();
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentStopped],
      onSelectAgent,
      onFilterStatus: vi.fn(),
    },
  });
  await fireEvent.click(getAllByTestId("heatmap-cell")[1]);
  expect(onSelectAgent).toHaveBeenCalledWith("s2");
});

// ---------------------------------------------------------------------------
// Tests — legend chips
// ---------------------------------------------------------------------------

test("legend shows a chip for each status that has at least one agent", () => {
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentStopped, agentError],
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  const chips = getAllByTestId("legend-chip");
  // running, stopped, error — no unknown
  expect(chips.length).toBe(3);
  const statuses = chips.map((c) => c.dataset.status);
  expect(statuses).toContain("running");
  expect(statuses).toContain("stopped");
  expect(statuses).toContain("error");
  expect(statuses).not.toContain("unknown");
});

test("legend chip text includes the status name and count", () => {
  const agentRunning2 = makeAgent({ stationId: "s5", agentName: "nakula", status: "running" });
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentRunning2],  // two distinct running agents
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  const chips = getAllByTestId("legend-chip");
  expect(chips.length).toBe(1);
  expect(chips[0].textContent).toContain("running");
  expect(chips[0].textContent).toContain("2");
});

test("no legend chips when agents array is empty", () => {
  const { queryAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [],
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  expect(queryAllByTestId("legend-chip").length).toBe(0);
});

test("clicking a legend chip calls onFilterStatus with that status", async () => {
  const onFilterStatus = vi.fn();
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentStopped],
      onSelectAgent: vi.fn(),
      onFilterStatus,
    },
  });
  const chips = getAllByTestId("legend-chip");
  // First chip in the rendered order should be "running" (STATUSES order: running, stopped, error, unknown)
  await fireEvent.click(chips[0]);
  expect(onFilterStatus).toHaveBeenCalledWith("running");
});

test("clicking the stopped legend chip calls onFilterStatus with 'stopped'", async () => {
  const onFilterStatus = vi.fn();
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning, agentStopped],
      onSelectAgent: vi.fn(),
      onFilterStatus,
    },
  });
  const chips = getAllByTestId("legend-chip");
  // Second chip should be "stopped"
  await fireEvent.click(chips[1]);
  expect(onFilterStatus).toHaveBeenCalledWith("stopped");
});

// ---------------------------------------------------------------------------
// Tests — tooltip / aria-label
// ---------------------------------------------------------------------------

test("cell aria-label includes agentName and status", () => {
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning],
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  const cell = getAllByTestId("heatmap-cell")[0];
  expect(cell.getAttribute("aria-label")).toContain("hanuman");
  expect(cell.getAttribute("aria-label")).toContain("running");
});

test("cell title includes agentName, nodeName and status", () => {
  const { getAllByTestId } = render(FleetHeatmap, {
    props: {
      agents: [agentRunning],
      onSelectAgent: vi.fn(),
      onFilterStatus: vi.fn(),
    },
  });
  const cell = getAllByTestId("heatmap-cell")[0];
  const title = cell.getAttribute("title") ?? "";
  expect(title).toContain("hanuman");
  expect(title).toContain("superchotu");
  expect(title).toContain("running");
});
