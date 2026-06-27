import { test, expect } from "bun:test";
import { nodes, enrollmentTokens } from "../../src/db/schema/nodes";

test("nodes table has expected columns", () => {
  expect(Object.keys(nodes)).toContain("secretHash");
  expect(Object.keys(nodes)).toContain("status");
});
test("enrollmentTokens table has tokenHash", () => {
  expect(Object.keys(enrollmentTokens)).toContain("tokenHash");
});
