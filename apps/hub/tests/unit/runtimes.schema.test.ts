import { test, expect } from "bun:test";
import { provisionedRuntimes, runtimeStatusEnum } from "../../src/db/schema/nodes";
import { enrollmentTokens } from "../../src/db/schema/nodes";

test("provisionedRuntimes table is defined", () => {
  expect(provisionedRuntimes).toBeDefined();
});

test("runtimeStatusEnum is defined", () => {
  expect(runtimeStatusEnum).toBeDefined();
});

test("provisionedRuntimes table has required columns", () => {
  const cols = Object.keys(provisionedRuntimes);
  expect(cols).toContain("id");
  expect(cols).toContain("userId");
  expect(cols).toContain("provider");
  expect(cols).toContain("externalId");
  expect(cols).toContain("status");
  expect(cols).toContain("nodeId");
  expect(cols).toContain("name");
  expect(cols).toContain("resourceTier");
  expect(cols).toContain("createdAt");
  expect(cols).toContain("updatedAt");
});

test("enrollmentTokens table has provisionedRuntimeId column", () => {
  expect(Object.keys(enrollmentTokens)).toContain("provisionedRuntimeId");
});
