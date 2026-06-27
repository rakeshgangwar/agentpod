import { test, expect } from "bun:test";
import { stations } from "../../src/db/schema/stations";

test("stations table has stationKey column", () => {
  expect(Object.keys(stations)).toContain("stationKey");
});

test("stations table has parentStationId column", () => {
  expect(Object.keys(stations)).toContain("parentStationId");
});

test("stations table has capabilities column", () => {
  expect(Object.keys(stations)).toContain("capabilities");
});

test("stations table has required fleet columns", () => {
  const cols = Object.keys(stations);
  expect(cols).toContain("id");
  expect(cols).toContain("userId");
  expect(cols).toContain("nodeId");
  expect(cols).toContain("harness");
  expect(cols).toContain("kind");
  expect(cols).toContain("displayName");
  expect(cols).toContain("workspacePath");
  expect(cols).toContain("adoptedAt");
  expect(cols).toContain("createdAt");
});
