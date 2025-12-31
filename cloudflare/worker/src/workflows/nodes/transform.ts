import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams, ExecutionContext } from "../utils/context";

type TransformMode = "map" | "pick" | "omit" | "rename" | "flatten" | "unflatten";

interface FieldMapping {
  from: string;
  to: string;
  transform?: "uppercase" | "lowercase" | "trim" | "number" | "string" | "boolean" | "json";
}

interface TransformParams {
  input?: unknown;
  inputPath?: string;
  mode: TransformMode;
  mapping?: FieldMapping[];
  fields?: string[];
  separator?: string;
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

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  
  current[parts[parts.length - 1]] = value;
}

function applyTransform(value: unknown, transform: FieldMapping["transform"]): unknown {
  if (!transform) return value;
  
  switch (transform) {
    case "uppercase":
      return typeof value === "string" ? value.toUpperCase() : value;
    case "lowercase":
      return typeof value === "string" ? value.toLowerCase() : value;
    case "trim":
      return typeof value === "string" ? value.trim() : value;
    case "number":
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
      }
      return value;
    case "string":
      return String(value);
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        if (value.toLowerCase() === "true") return true;
        if (value.toLowerCase() === "false") return false;
      }
      return Boolean(value);
    case "json":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    default:
      return value;
  }
}

function resolveInput(
  input: unknown | undefined,
  inputPath: string | undefined,
  context: ExecutionContext
): unknown {
  if (input !== undefined) {
    return input;
  }
  
  if (inputPath) {
    if (inputPath.startsWith("trigger.")) {
      return resolvePath(context.trigger, inputPath.substring(8));
    } else if (inputPath.startsWith("steps.")) {
      return resolvePath(context.steps, inputPath.substring(6));
    } else {
      return resolvePath(context, inputPath);
    }
  }
  
  return undefined;
}

function flattenObject(obj: unknown, separator: string = ".", prefix: string = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  if (obj === null || typeof obj !== "object") {
    return { [prefix || "value"]: obj };
  }
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const key = prefix ? `${prefix}${separator}${index}` : String(index);
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        Object.assign(result, flattenObject(item, separator, key));
      } else {
        result[key] = item;
      }
    });
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}${separator}${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, separator, newKey));
      } else {
        result[newKey] = value;
      }
    }
  }
  
  return result;
}

function unflattenObject(obj: Record<string, unknown>, separator: string = "."): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split(separator);
    let current = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        const nextPart = parts[i + 1];
        current[part] = /^\d+$/.test(nextPart) ? [] : {};
      }
      current = current[part] as Record<string, unknown>;
    }
    
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
  }
  
  return result;
}

function transformMap(input: unknown, mapping: FieldMapping[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const field of mapping) {
    const value = resolvePath(input, field.from);
    const transformed = applyTransform(value, field.transform);
    setPath(result, field.to, transformed);
  }
  
  return result;
}

function transformPick(input: unknown, fields: string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  
  const result: Record<string, unknown> = {};
  
  for (const field of fields) {
    const value = resolvePath(input, field);
    if (value !== undefined) {
      setPath(result, field, value);
    }
  }
  
  return result;
}

function transformOmit(input: unknown, fields: string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  
  const result: Record<string, unknown> = { ...input as Record<string, unknown> };
  
  for (const field of fields) {
    const parts = field.split(".");
    if (parts.length === 1) {
      delete result[field];
    } else {
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] && typeof current[parts[i]] === "object") {
          current = current[parts[i]] as Record<string, unknown>;
        } else {
          break;
        }
      }
      delete current[parts[parts.length - 1]];
    }
  }
  
  return result;
}

function transformRename(input: unknown, mapping: FieldMapping[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  
  const result: Record<string, unknown> = { ...input as Record<string, unknown> };
  
  for (const field of mapping) {
    const value = resolvePath(result, field.from);
    if (value !== undefined) {
      const fromParts = field.from.split(".");
      if (fromParts.length === 1) {
        delete result[field.from];
      }
      const transformed = applyTransform(value, field.transform);
      setPath(result, field.to, transformed);
    }
  }
  
  return result;
}

export const transformExecutor: NodeExecutor = {
  type: "transform",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.input && !params.inputPath) {
      errors.push("Either input or inputPath is required");
    }
    
    const mode = params.mode as TransformMode;
    if (!mode) {
      errors.push("Mode is required");
    }
    
    if ((mode === "map" || mode === "rename") && (!params.mapping || !Array.isArray(params.mapping))) {
      errors.push("Mapping is required for map/rename modes");
    }
    
    if ((mode === "pick" || mode === "omit") && (!params.fields || !Array.isArray(params.fields))) {
      errors.push("Fields is required for pick/omit modes");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<TransformParams>;
    const mode = p.mode ?? "map";
    const mapping = p.mapping ?? [];
    const fields = p.fields ?? [];
    const separator = p.separator ?? ".";
    
    const input = resolveInput(p.input, p.inputPath, params.context);
    
    if (input === undefined) {
      return createErrorResult("Could not resolve input - provide input or valid inputPath");
    }
    
    let result: unknown;
    let fieldsTransformed = 0;
    
    switch (mode) {
      case "map":
        result = transformMap(input, mapping);
        fieldsTransformed = mapping.length;
        break;
        
      case "pick":
        result = transformPick(input, fields);
        fieldsTransformed = fields.length;
        break;
        
      case "omit":
        result = transformOmit(input, fields);
        fieldsTransformed = fields.length;
        break;
        
      case "rename":
        result = transformRename(input, mapping);
        fieldsTransformed = mapping.length;
        break;
        
      case "flatten":
        result = flattenObject(input, separator);
        fieldsTransformed = typeof result === "object" ? Object.keys(result as object).length : 0;
        break;
        
      case "unflatten":
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          return createErrorResult("Input must be a flat object for unflatten mode");
        }
        result = unflattenObject(input as Record<string, unknown>, separator);
        fieldsTransformed = Object.keys(input).length;
        break;
        
      default:
        return createErrorResult(`Unknown transform mode: ${mode}`);
    }
    
    return createStepResult({
      data: result,
      mode,
      fieldsTransformed,
    });
  },
};
