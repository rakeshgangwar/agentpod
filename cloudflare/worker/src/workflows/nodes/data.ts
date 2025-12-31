import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams, ExecutionContext } from "../utils/context";

type VariableType = "string" | "number" | "boolean" | "object" | "array" | "auto";

interface Variable {
  name: string;
  value: unknown;
  type?: VariableType;
}

interface SetVariableParams {
  variables: Variable[];
}

interface ParseJsonParams {
  input?: string;
  inputPath?: string;
  errorHandling?: "error" | "default";
  defaultValue?: unknown;
}

type AggregateOperation = "count" | "sum" | "avg" | "min" | "max" | "first" | "last" | "concat" | "unique";

interface AggregateOperationConfig {
  operation: AggregateOperation;
  field?: string;
  outputName: string;
}

interface AggregateParams {
  items?: unknown[];
  itemsPath?: string;
  operations: AggregateOperationConfig[];
}

function resolvePath(obj: unknown, path: string): unknown {
  if (!path || typeof path !== "string") {
    return undefined;
  }
  
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

function resolveFromContext(path: string, context: ExecutionContext): unknown {
  if (path.startsWith("trigger.")) {
    return resolvePath(context.trigger, path.substring(8));
  } else if (path.startsWith("steps.")) {
    return resolvePath(context.steps, path.substring(6));
  } else {
    return resolvePath(context, path);
  }
}

function coerceType(value: unknown, type: VariableType): unknown {
  if (type === "auto") {
    return value;
  }
  
  switch (type) {
    case "string":
      return String(value);
    case "number":
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
      }
      return 0;
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        return value.toLowerCase() === "true";
      }
      return Boolean(value);
    case "object":
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value;
      }
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
        }
      }
      return {};
    case "array":
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
        }
      }
      return [value];
    default:
      return value;
  }
}

export const setVariableExecutor: NodeExecutor = {
  type: "set-variable",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.variables || !Array.isArray(params.variables)) {
      errors.push("Variables must be an array");
    } else {
      const variables = params.variables as Variable[];
      for (const v of variables) {
        if (!v.name || typeof v.name !== "string") {
          errors.push("Each variable must have a name");
        }
      }
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<SetVariableParams>;
    const variables = p.variables || [];
    
    if (variables.length === 0) {
      return createStepResult({
        variables: {},
        count: 0,
      });
    }
    
    const result: Record<string, unknown> = {};
    
    for (const variable of variables) {
      let value = variable.value;
      
      if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
        const path = value.slice(2, -2).trim();
        value = resolveFromContext(path, params.context);
      }
      
      if (variable.type && variable.type !== "auto") {
        value = coerceType(value, variable.type);
      }
      
      result[variable.name] = value;
    }
    
    return createStepResult({
      variables: result,
      count: variables.length,
    });
  },
};

export const parseJsonExecutor: NodeExecutor = {
  type: "parse-json",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.input && !params.inputPath) {
      errors.push("Either input or inputPath is required");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<ParseJsonParams>;
    const errorHandling = p.errorHandling ?? "error";
    const defaultValue = p.defaultValue ?? null;
    
    let input: unknown = p.input;
    
    if (!input && p.inputPath) {
      input = resolveFromContext(p.inputPath, params.context);
    }
    
    if (input === undefined || input === null) {
      if (errorHandling === "default") {
        return createStepResult({
          data: defaultValue,
          parsed: false,
          reason: "input_empty",
        });
      }
      return createErrorResult("Input is empty or not found");
    }
    
    if (typeof input !== "string") {
      if (typeof input === "object") {
        return createStepResult({
          data: input,
          parsed: false,
          reason: "already_object",
        });
      }
      input = String(input);
    }
    
    try {
      const parsed = JSON.parse(input as string);
      return createStepResult({
        data: parsed,
        parsed: true,
        inputLength: (input as string).length,
      });
    } catch (error) {
      if (errorHandling === "default") {
        return createStepResult({
          data: defaultValue,
          parsed: false,
          reason: "parse_error",
          error: error instanceof Error ? error.message : "Unknown parse error",
        });
      }
      return createErrorResult(`Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

function getNumericValue(item: unknown, field?: string): number | null {
  let value: unknown = item;
  
  if (field) {
    value = resolvePath(item, field);
  }
  
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
  }
  return null;
}

function executeAggregateOperation(
  items: unknown[],
  operation: AggregateOperation,
  field?: string
): unknown {
  switch (operation) {
    case "count":
      return items.length;
      
    case "sum": {
      let sum = 0;
      for (const item of items) {
        const num = getNumericValue(item, field);
        if (num !== null) sum += num;
      }
      return sum;
    }
    
    case "avg": {
      let sum = 0;
      let count = 0;
      for (const item of items) {
        const num = getNumericValue(item, field);
        if (num !== null) {
          sum += num;
          count++;
        }
      }
      return count > 0 ? sum / count : 0;
    }
    
    case "min": {
      let min: number | null = null;
      for (const item of items) {
        const num = getNumericValue(item, field);
        if (num !== null && (min === null || num < min)) {
          min = num;
        }
      }
      return min;
    }
    
    case "max": {
      let max: number | null = null;
      for (const item of items) {
        const num = getNumericValue(item, field);
        if (num !== null && (max === null || num > max)) {
          max = num;
        }
      }
      return max;
    }
    
    case "first":
      if (items.length === 0) return null;
      return field ? resolvePath(items[0], field) : items[0];
      
    case "last":
      if (items.length === 0) return null;
      return field ? resolvePath(items[items.length - 1], field) : items[items.length - 1];
      
    case "concat": {
      const arrays: unknown[] = [];
      for (const item of items) {
        const value = field ? resolvePath(item, field) : item;
        if (Array.isArray(value)) {
          arrays.push(...value);
        } else if (value !== undefined && value !== null) {
          arrays.push(value);
        }
      }
      return arrays;
    }
    
    case "unique": {
      const seen = new Set<string>();
      const unique: unknown[] = [];
      for (const item of items) {
        const value = field ? resolvePath(item, field) : item;
        const key = JSON.stringify(value);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(value);
        }
      }
      return unique;
    }
    
    default:
      return null;
  }
}

export const aggregateExecutor: NodeExecutor = {
  type: "aggregate",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.items && !params.itemsPath) {
      errors.push("Either items or itemsPath is required");
    }
    
    if (!params.operations || !Array.isArray(params.operations) || params.operations.length === 0) {
      errors.push("At least one operation is required");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<AggregateParams>;
    const operations = p.operations || [];
    
    let items = p.items;
    
    if (!items && p.itemsPath) {
      const value = resolveFromContext(p.itemsPath, params.context);
      if (Array.isArray(value)) {
        items = value;
      }
    }
    
    if (!Array.isArray(items)) {
      return createErrorResult("Could not resolve items array");
    }
    
    const results: Record<string, unknown> = {};
    
    for (const op of operations) {
      const result = executeAggregateOperation(items, op.operation, op.field);
      results[op.outputName] = result;
    }
    
    return createStepResult({
      results,
      itemCount: items.length,
      operationCount: operations.length,
    });
  },
};
