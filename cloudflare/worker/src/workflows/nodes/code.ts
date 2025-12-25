import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

interface JavaScriptParams {
  code: string;
  inputs?: Record<string, string>;
}

function createSafeContext(params: NodeExecutionParams) {
  return {
    trigger: params.context.trigger,
    steps: params.context.steps,
    inputs: {},
    console: {
      log: (...args: unknown[]) => console.log(`[JS Node ${params.nodeId}]`, ...args),
      error: (...args: unknown[]) => console.error(`[JS Node ${params.nodeId}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[JS Node ${params.nodeId}]`, ...args),
    },
  };
}

export const javascriptExecutor: NodeExecutor = {
  type: "javascript",
  category: "code",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    if (!params.code || typeof params.code !== "string") {
      errors.push("Code is required");
    }
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<JavaScriptParams>;
    const code = p.code;
    const inputs = p.inputs ?? {};
    
    if (!code) {
      return createErrorResult("No code provided");
    }
    
    const context = createSafeContext(params);
    
    for (const [key, path] of Object.entries(inputs)) {
      const parts = path.split(".");
      let value: unknown = params.context;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }
      (context.inputs as Record<string, unknown>)[key] = value;
    }
    
    try {
      const wrappedCode = `
        (async function(trigger, steps, inputs, console) {
          ${code}
        })
      `;
      
      const fn = eval(wrappedCode);
      const result = await fn(
        context.trigger,
        context.steps,
        context.inputs,
        context.console
      );
      
      return createStepResult({
        output: result,
        executedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof Error) {
        return createErrorResult(`JavaScript execution error: ${error.message}`);
      }
      return createErrorResult("Unknown JavaScript execution error");
    }
  },
};

export const mergeExecutor: NodeExecutor = {
  type: "merge",
  category: "logic",
  
  async execute(params: NodeExecutionParams) {
    const { mode = "wait", inputCount = 2 } = params.parameters as {
      mode?: "wait" | "first";
      inputCount?: number;
    };
    
    const inputSteps = Object.entries(params.context.steps)
      .filter(([_, result]) => result.success)
      .map(([nodeId, result]) => ({ nodeId, data: result.data }));
    
    if (mode === "wait" && inputSteps.length < inputCount) {
      return createStepResult({
        waiting: true,
        received: inputSteps.length,
        expected: inputCount,
      });
    }
    
    const mergedData: Record<string, unknown> = {};
    for (const step of inputSteps) {
      mergedData[step.nodeId] = step.data;
    }
    
    return createStepResult({
      merged: true,
      data: mergedData,
      inputCount: inputSteps.length,
    });
  },
};

export const loopExecutor: NodeExecutor = {
  type: "loop",
  category: "logic",
  
  async execute(params: NodeExecutionParams) {
    const { items, itemsPath, batchSize = 1 } = params.parameters as {
      items?: unknown[];
      itemsPath?: string;
      batchSize?: number;
    };
    
    let itemsToProcess = items;
    
    if (!itemsToProcess && itemsPath) {
      const parts = itemsPath.split(".");
      let value: unknown = params.context;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }
      if (Array.isArray(value)) {
        itemsToProcess = value;
      }
    }
    
    if (!Array.isArray(itemsToProcess)) {
      return createErrorResult("Items must be an array");
    }
    
    const batches: unknown[][] = [];
    for (let i = 0; i < itemsToProcess.length; i += batchSize) {
      batches.push(itemsToProcess.slice(i, i + batchSize));
    }
    
    return createStepResult({
      totalItems: itemsToProcess.length,
      batchCount: batches.length,
      batchSize,
      batches,
      items: itemsToProcess,
    });
  },
};
