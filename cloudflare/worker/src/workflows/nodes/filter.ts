/**
 * Filter Node - Filter array items based on conditions
 * 
 * Supports the same operators as condition node for consistency.
 */

import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams, ExecutionContext } from "../utils/context";

type ComparisonOperator = 
  | "equals" 
  | "notEquals" 
  | "contains" 
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "lessThan"
  | "greaterThanOrEqual"
  | "lessThanOrEqual"
  | "isEmpty"
  | "isNotEmpty"
  | "isTrue"
  | "isFalse"
  | "regex";

interface FilterCondition {
  field: string;
  operator: ComparisonOperator;
  value?: unknown;
}

interface FilterParams {
  items?: unknown[];
  itemsPath?: string;
  conditions: FilterCondition[];
  mode?: "all" | "any";
}

/**
 * Resolve a path from an object, supporting dot notation and bracket notation
 */
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

/**
 * Convert value to number if possible
 */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
  }
  return null;
}

/**
 * Evaluate a single condition against a value
 */
function evaluateCondition(
  actualValue: unknown,
  operator: ComparisonOperator,
  expectedValue: unknown
): boolean {
  switch (operator) {
    case "equals":
      return actualValue === expectedValue || String(actualValue) === String(expectedValue);
      
    case "notEquals":
      return actualValue !== expectedValue && String(actualValue) !== String(expectedValue);
      
    case "contains":
      if (typeof actualValue === "string" && typeof expectedValue === "string") {
        return actualValue.includes(expectedValue);
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue);
      }
      return false;
      
    case "notContains":
      if (typeof actualValue === "string" && typeof expectedValue === "string") {
        return !actualValue.includes(expectedValue);
      }
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(expectedValue);
      }
      return true;
      
    case "startsWith":
      return typeof actualValue === "string" && 
             typeof expectedValue === "string" && 
             actualValue.startsWith(expectedValue);
             
    case "endsWith":
      return typeof actualValue === "string" && 
             typeof expectedValue === "string" && 
             actualValue.endsWith(expectedValue);
             
    case "greaterThan": {
      const numActual = toNumber(actualValue);
      const numExpected = toNumber(expectedValue);
      if (numActual !== null && numExpected !== null) {
        return numActual > numExpected;
      }
      return false;
    }
             
    case "lessThan": {
      const numActual = toNumber(actualValue);
      const numExpected = toNumber(expectedValue);
      if (numActual !== null && numExpected !== null) {
        return numActual < numExpected;
      }
      return false;
    }
             
    case "greaterThanOrEqual": {
      const numActual = toNumber(actualValue);
      const numExpected = toNumber(expectedValue);
      if (numActual !== null && numExpected !== null) {
        return numActual >= numExpected;
      }
      return false;
    }
             
    case "lessThanOrEqual": {
      const numActual = toNumber(actualValue);
      const numExpected = toNumber(expectedValue);
      if (numActual !== null && numExpected !== null) {
        return numActual <= numExpected;
      }
      return false;
    }
             
    case "isEmpty":
      if (actualValue === null || actualValue === undefined) return true;
      if (typeof actualValue === "string") return actualValue.length === 0;
      if (Array.isArray(actualValue)) return actualValue.length === 0;
      if (typeof actualValue === "object") return Object.keys(actualValue).length === 0;
      return false;
      
    case "isNotEmpty":
      if (actualValue === null || actualValue === undefined) return false;
      if (typeof actualValue === "string") return actualValue.length > 0;
      if (Array.isArray(actualValue)) return actualValue.length > 0;
      if (typeof actualValue === "object") return Object.keys(actualValue).length > 0;
      return true;
      
    case "isTrue":
      return actualValue === true;
      
    case "isFalse":
      return actualValue === false;
      
    case "regex":
      if (typeof actualValue !== "string" || typeof expectedValue !== "string") {
        return false;
      }
      try {
        const regex = new RegExp(expectedValue);
        return regex.test(actualValue);
      } catch {
        return false;
      }
      
    default:
      return false;
  }
}

/**
 * Resolve items from direct input or context path
 */
function resolveItems(
  items: unknown[] | undefined,
  itemsPath: string | undefined,
  context: ExecutionContext
): unknown[] | null {
  if (items && Array.isArray(items)) {
    return items;
  }
  
  if (itemsPath) {
    let value: unknown;
    
    if (itemsPath.startsWith("trigger.")) {
      value = resolvePath(context.trigger, itemsPath.substring(8));
    } else if (itemsPath.startsWith("steps.")) {
      value = resolvePath(context.steps, itemsPath.substring(6));
    } else {
      value = resolvePath(context, itemsPath);
    }
    
    if (Array.isArray(value)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Check if an item matches filter conditions
 */
function itemMatchesConditions(
  item: unknown,
  conditions: FilterCondition[],
  mode: "all" | "any"
): boolean {
  if (conditions.length === 0) {
    return true;
  }
  
  const results = conditions.map(condition => {
    const actualValue = resolvePath(item, condition.field);
    return evaluateCondition(actualValue, condition.operator, condition.value);
  });
  
  if (mode === "all") {
    return results.every(r => r);
  } else {
    return results.some(r => r);
  }
}

export const filterExecutor: NodeExecutor = {
  type: "filter",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    
    if (!params.items && !params.itemsPath) {
      errors.push("Either items or itemsPath is required");
    }
    
    if (!params.conditions || !Array.isArray(params.conditions)) {
      errors.push("Conditions must be an array");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<FilterParams>;
    const conditions = p.conditions || [];
    const mode = p.mode ?? "all";
    
    // Resolve items from input or context path
    const items = resolveItems(p.items, p.itemsPath, params.context);
    
    if (!items) {
      return createErrorResult("Could not resolve items array - provide items or valid itemsPath");
    }
    
    // Filter items based on conditions
    const filteredItems: unknown[] = [];
    const rejectedItems: unknown[] = [];
    
    for (const item of items) {
      if (itemMatchesConditions(item, conditions, mode)) {
        filteredItems.push(item);
      } else {
        rejectedItems.push(item);
      }
    }
    
    return createStepResult({
      items: filteredItems,
      rejected: rejectedItems,
      originalCount: items.length,
      filteredCount: filteredItems.length,
      rejectedCount: rejectedItems.length,
    });
  },
};
