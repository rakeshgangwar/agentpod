import { describe, it, expect } from "vitest";
import { splitExecutor } from "./split";
import type { NodeExecutionParams } from "../utils/context";

function createParams(parameters: Record<string, unknown>): NodeExecutionParams {
  return {
    nodeId: "split-1",
    nodeName: "Split",
    nodeType: "split",
    parameters,
    context: {
      trigger: { type: "manual", data: {}, timestamp: new Date() },
      steps: {},
      env: {} as NodeExecutionParams["context"]["env"],
    },
  };
}

describe("splitExecutor", () => {
  describe("validation", () => {
    it("passes without branches parameter (uses default)", () => {
      const errors = splitExecutor.validate!({});
      expect(errors).toHaveLength(0);
    });

    it("passes with valid branch count", () => {
      const errors = splitExecutor.validate!({ branches: 3 });
      expect(errors).toHaveLength(0);
    });

    it("fails if branches is less than 2", () => {
      const errors = splitExecutor.validate!({ branches: 1 });
      expect(errors).toContain("Branches must be a number between 2 and 10");
    });

    it("fails if branches is greater than 10", () => {
      const errors = splitExecutor.validate!({ branches: 11 });
      expect(errors).toContain("Branches must be a number between 2 and 10");
    });

    it("fails if branches is not a number", () => {
      const errors = splitExecutor.validate!({ branches: "three" });
      expect(errors).toContain("Branches must be a number between 2 and 10");
    });
  });

  describe("execution", () => {
    it("creates default 2 branches", async () => {
      const result = await splitExecutor.execute(createParams({}));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.branches).toEqual(["branch_1", "branch_2"]);
      expect(data.branchCount).toBe(2);
      expect(data.splitAt).toBeDefined();
    });

    it("creates specified number of branches", async () => {
      const result = await splitExecutor.execute(createParams({ branches: 5 }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.branches).toEqual(["branch_1", "branch_2", "branch_3", "branch_4", "branch_5"]);
      expect(data.branchCount).toBe(5);
    });

    it("creates maximum 10 branches", async () => {
      const result = await splitExecutor.execute(createParams({ branches: 10 }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.branchCount).toBe(10);
      expect((data.branches as string[]).length).toBe(10);
    });

    it("includes timestamp in result", async () => {
      const beforeTime = new Date().toISOString();
      const result = await splitExecutor.execute(createParams({}));
      const afterTime = new Date().toISOString();

      expect(result.success).toBe(true);
      const splitAt = (result.data as Record<string, unknown>).splitAt as string;
      expect(splitAt >= beforeTime).toBe(true);
      expect(splitAt <= afterTime).toBe(true);
    });
  });
});
