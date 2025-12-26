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

interface Condition {
  field: string;
  operator: ComparisonOperator;
  value?: unknown;
  outputBranch: string;
}

interface ConditionParams {
  conditions: Condition[];
  defaultBranch?: string;
  mode?: "first" | "all";
}

function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
  }
  return null;
}

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

function resolveField(field: string | undefined | null, context: ExecutionContext): unknown {
  if (!field || typeof field !== "string") {
    return undefined;
  }
  
  if (field.startsWith("trigger.")) {
    return getValueByPath(context.trigger, field.substring(8));
  }
  if (field.startsWith("steps.") || field.startsWith("steps[")) {
    const stepsPath = field.startsWith("steps.") ? field.substring(6) : field.substring(5);
    return getValueByPath(context.steps, stepsPath);
  }
  
  const numValue = parseFloat(field);
  if (!isNaN(numValue) && String(numValue) === field) {
    return numValue;
  }
  
  if (!field.includes(".") && !field.includes("[")) {
    return field;
  }
  
  return getValueByPath(context, field);
}

export const conditionExecutor: NodeExecutor = {
  type: "condition",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    const conditions = params.conditions as Condition[] | undefined;
    
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
      errors.push("At least one condition is required");
    }
    
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<ConditionParams>;
    const conditions = p.conditions;
    const defaultBranch = p.defaultBranch;
    const mode = p.mode ?? "first";
    
    if (!conditions || conditions.length === 0) {
      return createErrorResult("No conditions configured");
    }
    
    const results: Array<{ condition: Condition; matched: boolean; value: unknown }> = [];
    
    for (const condition of conditions) {
      const actualValue = resolveField(condition.field, params.context);
      const matched = evaluateCondition(actualValue, condition.operator, condition.value);
      
      results.push({
        condition,
        matched,
        value: actualValue,
      });
      
      if (mode === "first" && matched) {
        return createStepResult({
          branch: condition.outputBranch,
          matched: true,
          matchedCondition: condition,
          actualValue,
        });
      }
    }
    
    if (mode === "all") {
      const matchedBranches = results
        .filter(r => r.matched)
        .map(r => r.condition.outputBranch);
        
      return createStepResult({
        branches: matchedBranches.length > 0 ? matchedBranches : [defaultBranch || "default"],
        matched: matchedBranches.length > 0,
        results,
      });
    }
    
    return createStepResult({
      branch: defaultBranch || "default",
      matched: false,
      results,
    });
  },
};

export const switchExecutor: NodeExecutor = {
  type: "switch",
  category: "logic",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    if (!params.field || typeof params.field !== "string") {
      errors.push("Field is required for switch node");
    }
    if (!params.cases || !Array.isArray(params.cases) || params.cases.length === 0) {
      errors.push("At least one case is required for switch node");
    }
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const { field, cases, defaultCase } = params.parameters as {
      field?: string;
      cases?: Array<{ value: unknown; outputBranch: string }>;
      defaultCase?: string;
    };
    
    if (!field) {
      return createErrorResult("Field is required for switch node");
    }
    
    const actualValue = resolveField(field, params.context);
    
    for (const caseItem of cases || []) {
      if (actualValue === caseItem.value) {
        return createStepResult({
          branch: caseItem.outputBranch,
          matched: true,
          value: actualValue,
          matchedCase: caseItem.value,
        });
      }
    }
    
    return createStepResult({
      branch: defaultCase || "default",
      matched: false,
      value: actualValue,
    });
  },
};
