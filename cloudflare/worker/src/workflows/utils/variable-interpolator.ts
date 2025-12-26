/**
 * Variable Interpolator - Replaces {{variables}} with actual values
 * 
 * Supports:
 * - {{trigger.data.field}} - Access trigger data
 * - {{steps.nodeId.data.field}} - Access step results by node ID
 * - {{env.VARIABLE}} - Access environment variables (limited)
 * - Nested object access with dot notation
 * - Array access with bracket notation
 */

import type { ExecutionContext } from "./context";

/**
 * Variable pattern: {{path.to.value}}
 * Supports:
 * - Simple paths: {{trigger.data}}
 * - Nested paths: {{steps.http-123.data.users[0].name}}
 * - Array access: {{steps.nodeId.data.items[0]}}
 */
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Interpolate variables in any value (string, object, array)
 * 
 * @param value - Value to interpolate
 * @param context - Execution context with trigger and step data
 * @returns Value with all variables replaced
 * 
 * @example
 * ```ts
 * const params = { url: "{{trigger.data.apiUrl}}/users/{{steps.auth.data.userId}}" };
 * const result = interpolateVariables(params, context);
 * // Returns: { url: "https://api.example.com/users/123" }
 * ```
 */
export function interpolateVariables(
  value: unknown,
  context: ExecutionContext
): unknown {
  if (typeof value === "string") {
    return interpolateString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map(item => interpolateVariables(item, context));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateVariables(val, context);
    }
    return result;
  }

  return value;
}

/**
 * Interpolate variables in a string
 */
function interpolateString(str: string, context: ExecutionContext): string {
  return str.replace(VARIABLE_PATTERN, (match, path) => {
    const value = getValueByPath(context, path.trim());
    
    if (value === undefined) {
      console.warn(`Variable not found: ${path}`);
      return match; // Keep original if not found
    }

    // Convert non-string values to JSON for embedding
    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

function getValueByPath(obj: unknown, path: string): unknown {
  const context = obj as Record<string, unknown>;
  const parts = parsePath(path);
  
  const isLoopVariable = parts.length > 0 && typeof parts[0] === "string" && parts[0].startsWith("$");
  
  if (isLoopVariable) {
    const loopVar = parts[0] as string;
    const loop = context.loop as { $item?: unknown; $index?: number; $items?: unknown[] } | undefined;
    
    if (!loop) {
      return undefined;
    }
    
    let current: unknown;
    if (loopVar === "$item") {
      current = loop.$item;
    } else if (loopVar === "$index") {
      current = loop.$index;
    } else if (loopVar === "$items") {
      current = loop.$items;
    } else {
      return undefined;
    }
    
    if (parts.length === 1) {
      return current;
    }
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof part === "number") {
        if (!Array.isArray(current)) {
          return undefined;
        }
        current = current[part];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }
    return current;
  }
  
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof part === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[part];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Parse a dot-notation path into parts
 * 
 * Handles:
 * - Simple: "trigger.data" -> ["trigger", "data"]
 * - Quoted: 'steps["node-id"].data' -> ["steps", "node-id", "data"]
 * - Array: "items[0].name" -> ["items", 0, "name"]
 */
function parsePath(path: string): Array<string | number> {
  const parts: Array<string | number> = [];
  let current = "";
  let inBracket = false;
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
        quoteChar = "";
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
        // Check if it's a number (array index)
        const num = parseInt(current, 10);
        if (!isNaN(num)) {
          parts.push(num);
        } else {
          parts.push(current);
        }
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

  return parts;
}

/**
 * Extract all variable references from a value
 * 
 * Useful for validating that all required variables are available
 * before execution.
 * 
 * @param value - Value to scan for variables
 * @returns Array of variable paths found
 */
export function extractVariables(value: unknown): string[] {
  const variables: string[] = [];

  function scan(v: unknown) {
    if (typeof v === "string") {
      const matches = v.matchAll(VARIABLE_PATTERN);
      for (const match of matches) {
        variables.push(match[1].trim());
      }
    } else if (Array.isArray(v)) {
      v.forEach(scan);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(scan);
    }
  }

  scan(value);
  return variables;
}

/**
 * Check if a value contains any variable references
 * 
 * @param value - Value to check
 * @returns True if the value contains variables
 */
export function hasVariables(value: unknown): boolean {
  return extractVariables(value).length > 0;
}

/**
 * Validate that all required variables are available in context
 * 
 * @param value - Value with potential variables
 * @param context - Execution context
 * @returns Array of missing variable paths
 */
export function validateVariables(
  value: unknown,
  context: ExecutionContext
): string[] {
  const variables = extractVariables(value);
  const missing: string[] = [];

  for (const path of variables) {
    const resolved = getValueByPath(context, path);
    if (resolved === undefined) {
      missing.push(path);
    }
  }

  return missing;
}
