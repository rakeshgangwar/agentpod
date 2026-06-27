import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/svelte";
import * as api from "$lib/api/client";
import type { StationHealth } from "@agentpod/contract";
// Static import ensures module is compiled during file collection, so the
// first test doesn't pay the compilation cost inside its waitFor window.
import HealthPanel from "./HealthPanel.svelte";

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

const healthFull: StationHealth = {
  running: true,
  pid: 12345,
  cpuPct: 3.5,
  memBytes: 104857600,
  diskBytes: 1073741824,
  uptimeSec: 3600,
  lastActivity: "2026-06-27T10:00:00Z",
  note: "All systems go",
};

const healthNulls: StationHealth = {
  running: false,
  pid: null,
  cpuPct: null,
  memBytes: null,
  diskBytes: null,
  uptimeSec: null,
  lastActivity: null,
  note: null,
};

test("HealthPanel renders running state and numeric pid", async () => {
  vi.spyOn(api, "stationHealth").mockResolvedValue(healthFull);

  const { getByText } = render(HealthPanel, { props: { stationId: "station_1" } });

  await waitFor(() => {
    // running should appear (e.g. "Running" badge text)
    expect(getByText(/running/i)).toBeTruthy();
    // pid should appear
    expect(getByText(/12345/)).toBeTruthy();
  });

  expect(api.stationHealth).toHaveBeenCalledWith("station_1");
});

test("HealthPanel shows — for null fields", async () => {
  vi.spyOn(api, "stationHealth").mockResolvedValue(healthNulls);

  const { getAllByText } = render(HealthPanel, { props: { stationId: "station_2" } });

  await waitFor(() => {
    // Should have multiple "—" placeholders for null fields
    const dashes = getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });
});

test("HealthPanel shows loading then data", async () => {
  let resolve!: (v: StationHealth) => void;
  const pending = new Promise<StationHealth>((r) => (resolve = r));
  vi.spyOn(api, "stationHealth").mockReturnValue(pending);

  const { getByText, queryByText } = render(HealthPanel, { props: { stationId: "station_3" } });

  // loading state
  expect(getByText(/loading/i)).toBeTruthy();

  resolve(healthFull);
  await waitFor(() => {
    expect(queryByText(/loading/i)).toBeNull();
    expect(getByText(/12345/)).toBeTruthy();
  });
});
