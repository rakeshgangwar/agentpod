import { describe, it, expect } from "vitest";
import { approvalExecutor } from "./human";
import type { NodeExecutionParams } from "../utils/context";

function createParams(parameters: Record<string, unknown>): NodeExecutionParams {
  return {
    nodeId: "approval-1",
    nodeName: "Approval",
    nodeType: "approval",
    parameters,
    context: {
      trigger: { type: "manual", data: {}, timestamp: new Date() },
      steps: {},
      env: {} as NodeExecutionParams["context"]["env"],
    },
  };
}

describe("approvalExecutor", () => {
  describe("validation", () => {
    it("requires message", () => {
      const errors = approvalExecutor.validate!({});
      expect(errors).toContain("Approval message is required");
    });

    it("passes with valid message", () => {
      const errors = approvalExecutor.validate!({ message: "Please approve this" });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    it("returns error for missing message", async () => {
      const result = await approvalExecutor.execute(createParams({}));
      expect(result.success).toBe(false);
      expect(result.error).toContain("Approval message is required");
    });

    it("creates pending approval request", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Please review and approve this deployment",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("pending");
      expect(data.approvalId).toMatch(/^approval_approval-1_/);
      expect(data.message).toBe("Please review and approve this deployment");
      expect(data.webhookPath).toContain("/api/workflows/approval/");
    });

    it("includes approvers list", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Approve?",
        approvers: ["user1", "user2", "admin"],
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.approvers).toEqual(["user1", "user2", "admin"]);
    });

    it("uses default 24h timeout", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Approve?",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.timeout).toBe("24h");
      expect(data.timeoutMs).toBe(24 * 60 * 60 * 1000);
    });

    it("parses custom timeout", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Approve quickly!",
        timeout: "1h",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.timeout).toBe("1h");
      expect(data.timeoutMs).toBe(60 * 60 * 1000);
    });

    it("parses timeout in minutes", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Approve!",
        timeout: "30 minutes",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.timeoutMs).toBe(30 * 60 * 1000);
    });

    it("calculates expiration time", async () => {
      const beforeTime = Date.now();
      const result = await approvalExecutor.execute(createParams({
        message: "Approve?",
        timeout: "1h",
      }));
      const afterTime = Date.now();

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const expiresAt = new Date(data.expiresAt as string).getTime();
      const oneHourMs = 60 * 60 * 1000;
      
      expect(expiresAt).toBeGreaterThanOrEqual(beforeTime + oneHourMs);
      expect(expiresAt).toBeLessThanOrEqual(afterTime + oneHourMs);
    });

    it("resolves approval when approved", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Approve?",
        approvalId: "approval_123",
        approved: true,
        approvedBy: "admin@example.com",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("resolved");
      expect(data.approved).toBe(true);
      expect(data.approvedBy).toBe("admin@example.com");
      expect(data.resolvedAt).toBeDefined();
    });

    it("resolves approval when rejected", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Approve?",
        approvalId: "approval_123",
        approved: false,
        approvedBy: "manager@example.com",
        reason: "Not ready for deployment",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("resolved");
      expect(data.approved).toBe(false);
      expect(data.reason).toBe("Not ready for deployment");
    });

    it("includes created timestamp", async () => {
      const beforeTime = new Date().toISOString();
      const result = await approvalExecutor.execute(createParams({
        message: "Approve?",
      }));
      const afterTime = new Date().toISOString();

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const createdAt = data.createdAt as string;
      expect(createdAt).toBeDefined();
      expect(createdAt >= beforeTime).toBe(true);
      expect(createdAt <= afterTime).toBe(true);
    });

    it("handles empty approvers list", async () => {
      const result = await approvalExecutor.execute(createParams({
        message: "Open approval",
      }));

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.approvers).toEqual([]);
    });
  });
});
