import type { NodeExecutionParams, StepResult } from "../utils/context";

export interface NodeExecutor {
  readonly type: string;
  readonly category: "trigger" | "ai" | "logic" | "action" | "human" | "code";
  
  execute(params: NodeExecutionParams): Promise<StepResult>;
  
  validate?(params: Record<string, unknown>): string[];
}

export interface RetryConfig {
  limit: number;
  delay: string;
  backoff: "constant" | "linear" | "exponential";
}

export function createStepResult(data: unknown): StepResult {
  return {
    success: true,
    data,
  };
}

export function createErrorResult(error: string, attempts = 1): StepResult {
  return {
    success: false,
    error,
    attempts,
  };
}

export function parseRetryConfig(params: Record<string, unknown>): RetryConfig {
  return {
    limit: typeof params.maxRetries === "number" ? params.maxRetries : 3,
    delay: typeof params.retryDelay === "string" ? params.retryDelay : "5 seconds",
    backoff: (params.retryBackoff as RetryConfig["backoff"]) || "exponential",
  };
}

export function parseTimeout(params: Record<string, unknown>): string {
  return typeof params.timeout === "string" ? params.timeout : "30 seconds";
}
