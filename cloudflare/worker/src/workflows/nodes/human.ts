import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

interface ApprovalParams {
  message: string;
  approvers?: string[];
  timeout?: string;
  notificationChannel?: string;
  approvalId?: string;
  approved?: boolean;
  approvedBy?: string;
  reason?: string;
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?|m|minutes?|h|hours?|d|days?)$/i);
  
  if (!match) {
    const num = parseFloat(duration);
    if (!isNaN(num)) {
      return num;
    }
    return 24 * 60 * 60 * 1000;
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case "ms":
    case "millisecond":
    case "milliseconds":
      return value;
    case "s":
    case "second":
    case "seconds":
      return value * 1000;
    case "m":
    case "minute":
    case "minutes":
      return value * 60 * 1000;
    case "h":
    case "hour":
    case "hours":
      return value * 60 * 60 * 1000;
    case "d":
    case "day":
    case "days":
      return value * 24 * 60 * 60 * 1000;
    default:
      return value;
  }
}

export const approvalExecutor: NodeExecutor = {
  type: "approval",
  category: "human",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.message || typeof params.message !== "string") {
      errors.push("Approval message is required");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<ApprovalParams>;
    
    if (!p.message) {
      return createErrorResult("Approval message is required");
    }
    
    const timeout = p.timeout ?? "24h";
    const timeoutMs = parseDuration(timeout);
    
    if (p.approvalId && p.approved !== undefined) {
      return createStepResult({
        status: "resolved",
        approved: p.approved,
        approvedBy: p.approvedBy,
        reason: p.reason,
        resolvedAt: new Date().toISOString(),
      });
    }
    
    const approvalId = `approval_${params.nodeId}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + timeoutMs);
    
    return createStepResult({
      status: "pending",
      approvalId,
      message: p.message,
      approvers: p.approvers || [],
      timeout,
      timeoutMs,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      webhookPath: `/api/workflows/approval/${approvalId}`,
    });
  },
};
