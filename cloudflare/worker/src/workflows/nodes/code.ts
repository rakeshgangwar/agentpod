import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";
import { getSandbox } from "@cloudflare/sandbox";

interface JavaScriptParams {
  code: string;
  inputs?: Record<string, string>;
  timeout?: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

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
    const inputMappings = p.inputs ?? {};
    const timeout = p.timeout ?? DEFAULT_TIMEOUT_MS;
    
    if (!code) {
      return createErrorResult("No code provided");
    }
    
    const inputs: Record<string, unknown> = {};
    for (const [key, path] of Object.entries(inputMappings)) {
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
      inputs[key] = value;
    }
    
    try {
      const sandboxId = `workflow-js-${params.nodeId}`;
      const sandbox = getSandbox(params.context.env.Sandbox, sandboxId);
      
      const contextData = JSON.stringify({
        trigger: params.context.trigger,
        steps: params.context.steps,
        inputs,
      });
      
      const wrappedCode = `
const __ctx = ${contextData};
const trigger = __ctx.trigger;
const steps = __ctx.steps;
const inputs = __ctx.inputs;

const __result = (function() {
  ${code}
})();

console.log(JSON.stringify({ __output: __result }));
`;
      
      const scriptPath = `/tmp/workflow-${params.nodeId}-${Date.now()}.js`;
      await sandbox.writeFile(scriptPath, wrappedCode);
      
      const result = await sandbox.exec(`node ${scriptPath}`, {
        timeout,
      });
      
      const logs: string[] = [];
      if (result.stdout) {
        logs.push(...result.stdout.split("\n").filter(Boolean).map((l: string) => `[log] ${l}`));
      }
      if (result.stderr) {
        logs.push(...result.stderr.split("\n").filter(Boolean).map((l: string) => `[error] ${l}`));
      }
      
      if (!result.success) {
        return createErrorResult(`JavaScript execution error: ${result.stderr || "Unknown error"}`);
      }
      
      let output: unknown = null;
      try {
        const lastLine = result.stdout?.trim().split("\n").pop() || "";
        const parsed = JSON.parse(lastLine);
        output = parsed.__output;
      } catch {
        output = result.stdout?.trim() || null;
      }
      
      return createStepResult({
        output,
        logs,
        executedAt: new Date().toISOString(),
      });
      
    } catch (error) {
      if (error instanceof Error) {
        return createErrorResult(`JavaScript sandbox error: ${error.message}`);
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

function resolvePath(obj: unknown, path: string): unknown {
  const parts: string[] = [];
  let current = "";
  let inBracket = false;
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
      continue;
    }

    if (char === "[") {
      if (current) {
        parts.push(current);
        current = "";
      }
      inBracket = true;
      continue;
    }

    if (char === "]") {
      if (current) {
        parts.push(current);
        current = "";
      }
      inBracket = false;
      continue;
    }

    if (char === "." && !inBracket) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  let value: unknown = obj;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

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
      const value = resolvePath(params.context, itemsPath);
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
