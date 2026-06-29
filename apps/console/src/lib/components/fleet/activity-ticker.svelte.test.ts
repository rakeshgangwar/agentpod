/**
 * activity-ticker.svelte.test.ts
 *
 * TDD tests for the fleet activity ticker.
 * RED → implement activity-ticker.svelte → GREEN.
 *
 * Mocks $lib/api/client; asserts:
 *   - listFleetActivity() → rows → ticker shows verb + harness (station prefix)
 *   - listFleetActivity() → [] → component renders nothing (marquee absent)
 */

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/svelte";

// ---------------------------------------------------------------------------
// API mock — hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("$lib/api/client", () => ({
  listFleetActivity: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as api from "$lib/api/client";
import ActivityTicker from "./activity-ticker.svelte";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

const recentIso = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min ago

const mockRows = [
  {
    id: "a",
    stationKey: "opencode:x",
    verb: "terminal.open",
    result: "ok",
    createdAt: recentIso,
  },
  {
    id: "b",
    stationKey: "hermes:y",
    verb: "fs.write",
    result: "ok",
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders item text with verb and station harness when rows are returned", async () => {
  vi.mocked(api.listFleetActivity).mockResolvedValue(mockRows);

  const { container } = render(ActivityTicker);

  await waitFor(() => {
    const text = container.textContent ?? "";
    expect(text).toContain("terminal.open");
    expect(text).toContain("opencode");
  });
});

test("renders nothing (marquee absent) when listFleetActivity returns empty array", async () => {
  vi.mocked(api.listFleetActivity).mockResolvedValue([]);

  const { container } = render(ActivityTicker);

  // Give the async onMount a chance to resolve
  await new Promise((r) => setTimeout(r, 50));

  const marquee = container.querySelector('[role="marquee"]');
  expect(marquee).toBeNull();
});

test("renders nothing when listFleetActivity rejects", async () => {
  vi.mocked(api.listFleetActivity).mockRejectedValue(new Error("network error"));

  const { container } = render(ActivityTicker);

  await new Promise((r) => setTimeout(r, 50));

  const marquee = container.querySelector('[role="marquee"]');
  expect(marquee).toBeNull();
});
