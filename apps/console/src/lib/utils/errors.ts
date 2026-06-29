/**
 * Error handling utilities for consistent error messages across the app
 */

/**
 * Error categories for user-friendly messages and styling
 */
export type ErrorCategory =
  | "network"       // Connection/network issues
  | "auth"          // Authentication/session issues
  | "permission"    // Authorization/forbidden (403)
  | "resource_limit"// Resource limits exceeded
  | "validation"    // Input validation errors
  | "not_found"     // Resource not found (404)
  | "timeout"       // Operation timed out
  | "server"        // Server-side errors (5xx)
  | "unknown";      // Unknown/unexpected errors

/**
 * Parsed error with category and user-friendly message
 */
export interface ParsedError {
  message: string;
  category: ErrorCategory;
  /** Original error for logging */
  original: unknown;
  /** Suggested action for the user */
  action?: string;
}

/**
 * Patterns to detect specific error types
 */
const ERROR_PATTERNS = {
  resourceLimit: [
    /resource limit/i,
    /maximum.*sandboxes/i,
    /limit exceeded/i,
    /quota exceeded/i,
  ],
  auth: [
    /unauthorized/i,
    /session expired/i,
    /invalid.*token/i,
    /not authenticated/i,
    /please log in/i,
  ],
  permission: [
    /forbidden/i,
    /access denied/i,
    /permission denied/i,
    /not allowed/i,
    /banned/i,
  ],
  network: [
    /network error/i,
    /connection failed/i,
    /failed to fetch/i,
    /net::err/i,
    /econnrefused/i,
    /unable to connect/i,
    /no internet/i,
  ],
  timeout: [
    /timeout/i,
    /timed out/i,
    /took too long/i,
    /deadline exceeded/i,
  ],
  notFound: [
    /not found/i,
    /404/i,
    /does not exist/i,
    /no such/i,
  ],
  validation: [
    /invalid/i,
    /required/i,
    /must be/i,
    /cannot be empty/i,
    /too short/i,
    /too long/i,
  ],
  server: [
    /internal server error/i,
    /500/i,
    /502/i,
    /503/i,
    /service unavailable/i,
  ],
} as const;

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return "An unknown error occurred";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object") {
    // Check for common error object shapes
    const obj = error as Record<string, unknown>;
    
    if (typeof obj.message === "string") {
      return obj.message;
    }
    
    if (typeof obj.error === "string") {
      return obj.error;
    }
    
    if (typeof obj.detail === "string") {
      return obj.detail;
    }

    // Try to stringify the object
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

/**
 * Detect error category from error message
 */
function detectCategory(message: string): ErrorCategory {
  // Check patterns in order of specificity
  for (const pattern of ERROR_PATTERNS.resourceLimit) {
    if (pattern.test(message)) return "resource_limit";
  }

  for (const pattern of ERROR_PATTERNS.auth) {
    if (pattern.test(message)) return "auth";
  }

  for (const pattern of ERROR_PATTERNS.permission) {
    if (pattern.test(message)) return "permission";
  }

  for (const pattern of ERROR_PATTERNS.network) {
    if (pattern.test(message)) return "network";
  }

  for (const pattern of ERROR_PATTERNS.timeout) {
    if (pattern.test(message)) return "timeout";
  }

  for (const pattern of ERROR_PATTERNS.notFound) {
    if (pattern.test(message)) return "not_found";
  }

  for (const pattern of ERROR_PATTERNS.server) {
    if (pattern.test(message)) return "server";
  }

  for (const pattern of ERROR_PATTERNS.validation) {
    if (pattern.test(message)) return "validation";
  }

  return "unknown";
}

/**
 * Get suggested action based on error category
 */
function getSuggestedAction(category: ErrorCategory): string | undefined {
  switch (category) {
    case "network":
      return "Check your internet connection and try again.";
    case "auth":
      return "Please log in again to continue.";
    case "permission":
      return "You don't have permission to perform this action.";
    case "resource_limit":
      return "You've reached your resource limit. Delete unused projects or contact support.";
    case "timeout":
      return "The operation took too long. Please try again.";
    case "not_found":
      return "The requested resource could not be found.";
    case "server":
      return "The server encountered an error. Please try again later.";
    case "validation":
      return "Please check your input and try again.";
    default:
      return undefined;
  }
}

/**
 * Clean up error message for display
 * - Remove prefixes like "Forbidden:", "Error:", etc.
 * - Capitalize first letter
 * - Ensure it ends with proper punctuation
 */
function cleanErrorMessage(message: string): string {
  // Remove common prefixes
  let cleaned = message
    .replace(/^(Forbidden|Unauthorized|Error|ApiError|NetworkError):\s*/i, "")
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Add period if missing punctuation
  if (cleaned.length > 0 && !/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }

  return cleaned;
}

/**
 * Parse an error and return a user-friendly message with category
 */
export function parseError(error: unknown): ParsedError {
  const rawMessage = extractErrorMessage(error);
  const category = detectCategory(rawMessage);
  const message = cleanErrorMessage(rawMessage);
  const action = getSuggestedAction(category);

  return {
    message,
    category,
    original: error,
    action,
  };
}

/**
 * Check if error indicates a resource limit was exceeded
 */
export function isResourceLimitError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return ERROR_PATTERNS.resourceLimit.some(pattern => pattern.test(message));
}

/**
 * Check if error indicates an authentication issue
 */
export function isAuthError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return ERROR_PATTERNS.auth.some(pattern => pattern.test(message));
}

/**
 * Check if error indicates a permission/forbidden issue
 */
export function isPermissionError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return ERROR_PATTERNS.permission.some(pattern => pattern.test(message));
}

/**
 * Check if error indicates a network issue
 */
export function isNetworkError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return ERROR_PATTERNS.network.some(pattern => pattern.test(message));
}

/**
 * Format error for display with optional context
 */
export function formatError(error: unknown, context?: string): string {
  const parsed = parseError(error);
  
  if (context) {
    return `${context}: ${parsed.message}`;
  }
  
  return parsed.message;
}

/**
 * Format error with action suggestion
 */
export function formatErrorWithAction(error: unknown): { message: string; action?: string } {
  const parsed = parseError(error);
  return {
    message: parsed.message,
    action: parsed.action,
  };
}

/**
 * Get CSS color class based on error category
 */
export function getErrorColorClass(category: ErrorCategory): string {
  switch (category) {
    case "auth":
    case "permission":
    case "resource_limit":
      return "text-[var(--cyber-orange)]"; // Warning-style for actionable errors
    case "network":
    case "timeout":
      return "text-[var(--cyber-yellow)]"; // Info-style for transient errors
    default:
      return "text-[var(--cyber-red)]"; // Error-style for others
  }
}

/**
 * Get border color class based on error category
 */
export function getErrorBorderClass(category: ErrorCategory): string {
  switch (category) {
    case "auth":
    case "permission":
    case "resource_limit":
      return "border-[var(--cyber-orange)]/50 bg-[var(--cyber-orange)]/5";
    case "network":
    case "timeout":
      return "border-[var(--cyber-yellow)]/50 bg-[var(--cyber-yellow)]/5";
    default:
      return "border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5";
  }
}
