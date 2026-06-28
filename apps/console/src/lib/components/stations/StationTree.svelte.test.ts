import { test, expect } from "vitest";
import { render } from "@testing-library/svelte";
import StationTree from "./StationTree.svelte";
import type { StationRow } from "$lib/api/client";

const parentStation: StationRow = {
  id: "station_parent_1",
  userId: "user_1",
  nodeId: "node_1",
  harness: "claude",
  stationKey: "claude://workspace",
  kind: "composite",
  parentStationId: null,
  displayName: "Parent Workspace",
  workspacePath: "/home/user/workspace",
  capabilities: ["health", "logs"],
  matrixId: null,
  adoptedAt: new Date("2026-06-22T00:00:00Z"),
  createdAt: new Date("2026-06-22T00:00:00Z"),
};

const childStation: StationRow = {
  id: "station_child_1",
  userId: "user_1",
  nodeId: "node_1",
  harness: "claude",
  stationKey: "claude://workspace/sub",
  kind: "leaf",
  parentStationId: "station_parent_1",
  displayName: "Child Station",
  workspacePath: "/home/user/workspace/sub",
  capabilities: ["health"],
  matrixId: null,
  adoptedAt: new Date("2026-06-22T00:00:00Z"),
  createdAt: new Date("2026-06-22T00:00:00Z"),
};

test("StationTree renders parent and child station names", () => {
  const { getByText } = render(StationTree, {
    props: {
      stations: [parentStation, childStation],
      nodeId: "node_1",
    },
  });

  expect(getByText("Parent Workspace")).toBeTruthy();
  expect(getByText("Child Station")).toBeTruthy();
});

test("StationTree renders child nested under parent", () => {
  const { container } = render(StationTree, {
    props: {
      stations: [parentStation, childStation],
      nodeId: "node_1",
    },
  });

  const items = container.querySelectorAll("[data-station-id]");
  expect(items.length).toBe(2);

  const parentEl = container.querySelector('[data-station-id="station_parent_1"]');
  const childEl = container.querySelector('[data-station-id="station_child_1"]');
  expect(parentEl).toBeTruthy();
  expect(childEl).toBeTruthy();
  // child should be contained within parent container
  expect(parentEl!.contains(childEl)).toBe(true);
});
