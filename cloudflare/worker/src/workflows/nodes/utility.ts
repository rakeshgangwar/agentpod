import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams, ExecutionContext } from "../utils/context";

interface WaitParams {
  duration: string;
}

interface ErrorHandlerParams {
  onError: "continue" | "stop" | "retry" | "fallback";
  maxRetries?: number;
  retryDelay?: string;
  fallbackValue?: unknown;
  errorPath?: string;
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|seconds?|m|minutes?|h|hours?|d|days?)$/i);
  
  if (!match) {
    const num = parseFloat(duration);
    if (!isNaN(num)) {
      return num;
    }
    return 0;
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

function resolvePath(obj: unknown, path: string): unknown {
  if (!path || typeof path !== "string") {
    return undefined;
  }
  
  const parts = path.split(".");
  let value: unknown = obj;
  
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  
  return value;
}

function getErrorFromContext(context: ExecutionContext, errorPath?: string): { hasError: boolean; error?: string; nodeId?: string } {
  if (errorPath) {
    const error = resolvePath(context, errorPath);
    if (error) {
      return { hasError: true, error: String(error) };
    }
  }
  
  for (const [nodeId, result] of Object.entries(context.steps)) {
    if (!result.success && result.error) {
      return { hasError: true, error: result.error, nodeId };
    }
  }
  
  return { hasError: false };
}

export const waitExecutor: NodeExecutor = {
  type: "wait",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.duration) {
      errors.push("Duration is required");
    }
    
    if (typeof params.duration === "string") {
      const ms = parseDuration(params.duration);
      if (ms <= 0) {
        errors.push("Duration must be a positive value");
      }
      if (ms > 24 * 60 * 60 * 1000) {
        errors.push("Duration cannot exceed 24 hours");
      }
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<WaitParams>;
    const duration = p.duration ?? "1 second";
    
    const waitMs = parseDuration(duration);
    
    if (waitMs <= 0) {
      return createErrorResult("Invalid duration: must be a positive value");
    }
    
    if (waitMs > 24 * 60 * 60 * 1000) {
      return createErrorResult("Duration cannot exceed 24 hours");
    }
    
    const startedAt = new Date().toISOString();
    
    await new Promise(resolve => setTimeout(resolve, waitMs));
    
    const resumedAt = new Date().toISOString();
    
    return createStepResult({
      waitedMs: waitMs,
      duration,
      startedAt,
      resumedAt,
    });
  },
};

export const errorHandlerExecutor: NodeExecutor = {
  type: "error-handler",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    const onError = params.onError as ErrorHandlerParams["onError"];
    if (onError && !["continue", "stop", "retry", "fallback"].includes(onError)) {
      errors.push("onError must be one of: continue, stop, retry, fallback");
    }
    
    if (onError === "retry") {
      const maxRetries = params.maxRetries;
      if (maxRetries !== undefined && (typeof maxRetries !== "number" || maxRetries < 1)) {
        errors.push("maxRetries must be a positive number");
      }
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<ErrorHandlerParams>;
    const onError = p.onError ?? "continue";
    const maxRetries = p.maxRetries ?? 3;
    const retryDelay = p.retryDelay ?? "5 seconds";
    const fallbackValue = p.fallbackValue ?? null;
    const errorPath = p.errorPath;
    
    const errorInfo = getErrorFromContext(params.context, errorPath);
    
    if (!errorInfo.hasError) {
      return createStepResult({
        handled: false,
        reason: "no_error",
        action: "pass_through",
      });
    }
    
    const currentAttempt = (params.context.steps[params.nodeId]?.attempts ?? 0) + 1;
    
    switch (onError) {
      case "continue":
        return createStepResult({
          handled: true,
          action: "continue",
          error: errorInfo.error,
          errorNodeId: errorInfo.nodeId,
          continueWithValue: null,
        });
        
      case "stop":
        return createErrorResult(`Workflow stopped due to error: ${errorInfo.error}`);
        
      case "retry":
        if (currentAttempt <= maxRetries) {
          const delayMs = parseDuration(retryDelay);
          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
          return createStepResult({
            handled: true,
            action: "retry",
            attempt: currentAttempt,
            maxRetries,
            error: errorInfo.error,
            errorNodeId: errorInfo.nodeId,
            shouldRetry: true,
            retryDelay,
          });
        }
        
        return createStepResult({
          handled: true,
          action: "exhausted",
          attempts: currentAttempt,
          maxRetries,
          error: errorInfo.error,
          errorNodeId: errorInfo.nodeId,
          shouldRetry: false,
        });
        
      case "fallback":
        return createStepResult({
          handled: true,
          action: "fallback",
          error: errorInfo.error,
          errorNodeId: errorInfo.nodeId,
          fallbackValue,
        });
        
      default:
        return createErrorResult(`Unknown error handling mode: ${onError}`);
    }
  },
};
