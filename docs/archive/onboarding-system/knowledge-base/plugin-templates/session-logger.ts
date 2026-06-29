/**
 * @id plugin_session_logger
 * @title Session Logger Plugin
 * @description Logs all session activity for debugging and audit purposes
 * @tags ["logging", "debugging", "audit", "monitoring"]
 * @applicable_to null
 * @priority medium
 */

import type { Plugin } from "@opencode-ai/plugin";

/**
 * Session Logger Plugin
 * 
 * This plugin logs all OpenCode session activity to help with:
 * - Debugging issues
 * - Auditing AI actions
 * - Understanding session flow
 * - Performance monitoring
 * 
 * Features:
 * - Logs session lifecycle events
 * - Logs tool executions with timing
 * - Logs file modifications
 * - Logs message updates
 * - Configurable log levels
 * 
 * Usage:
 * Place this file in .opencode/plugin/session-logger.ts
 * 
 * Environment Variables:
 * - LOG_LEVEL: debug | info | warn | error (default: info)
 * - LOG_FORMAT: json | text (default: text)
 * - LOG_FILE: path to log file (optional, defaults to stdout)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  sessionId?: string;
  data?: Record<string, unknown>;
  duration?: number;
}

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";
const LOG_FORMAT = process.env.LOG_FORMAT || "text";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function formatLog(entry: LogEntry): string {
  if (LOG_FORMAT === "json") {
    return JSON.stringify(entry);
  }
  
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.event,
  ];
  
  if (entry.sessionId) {
    parts.push(`session=${entry.sessionId}`);
  }
  
  if (entry.duration !== undefined) {
    parts.push(`duration=${entry.duration}ms`);
  }
  
  if (entry.data) {
    parts.push(JSON.stringify(entry.data));
  }
  
  return parts.join(" ");
}

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    data,
  };
  
  const formatted = formatLog(entry);
  
  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

// Track tool execution times
const toolStartTimes = new Map<string, number>();

// Helper to sanitize sensitive data from args
function sanitizeArgs(args?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!args) return undefined;
  
  const sanitized = { ...args };
  const sensitiveKeys = ["password", "secret", "token", "key", "auth", "credential"];
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    }
  }
  
  return sanitized;
}

/**
 * Session Logger Plugin
 * 
 * Uses the generic "event" handler to receive all session events
 * and log them based on event type.
 */
export const SessionLoggerPlugin: Plugin = async ({ project, directory }) => {
  log("info", "Session logger initialized", { 
    project: project?.name, 
    directory 
  });
  
  return {
    // Generic event handler receives ALL events
    event: async ({ event }) => {
      const { type, properties } = event;
      
      switch (type) {
        // Session lifecycle events
        case "session.created":
          log("info", "Session started", { sessionId: properties?.sessionId });
          break;
          
        case "session.idle":
          log("debug", "Session idle", { 
            sessionId: properties?.sessionId, 
            duration: properties?.duration 
          });
          break;
          
        case "session.error":
          log("error", "Session error", { 
            sessionId: properties?.sessionId, 
            error: String(properties?.error) 
          });
          break;
          
        case "session.compacted":
          log("info", "Session compacted", { 
            sessionId: properties?.sessionId, 
            tokensSaved: properties?.tokensSaved 
          });
          break;
        
        // Tool execution events
        case "tool.execute.before":
          toolStartTimes.set(properties?.tool || "unknown", Date.now());
          log("debug", `Tool started: ${properties?.tool}`, { 
            tool: properties?.tool, 
            args: sanitizeArgs(properties?.args as Record<string, unknown>) 
          });
          break;
          
        case "tool.execute.after":
          const startTime = toolStartTimes.get(properties?.tool || "unknown");
          const duration = startTime ? Date.now() - startTime : undefined;
          toolStartTimes.delete(properties?.tool || "unknown");
          
          const result = properties?.result;
          log("info", `Tool completed: ${properties?.tool}`, { 
            tool: properties?.tool,
            duration,
            resultSize: typeof result === "string" 
              ? result.length 
              : JSON.stringify(result).length
          });
          break;
        
        // File events
        case "file.edited":
          log("info", "File edited", { path: properties?.path });
          break;
          
        case "file.watcher.updated":
          log("debug", "File system change", { 
            path: properties?.path, 
            changeType: properties?.changeType 
          });
          break;
        
        // Message events
        case "message.updated":
          log("debug", "Message updated", { 
            messageId: properties?.messageId,
            role: properties?.role 
          });
          break;
        
        // Permission events
        case "permission.replied":
          log("info", "Permission response", { 
            tool: properties?.tool, 
            allowed: properties?.allowed 
          });
          break;
          
        default:
          log("debug", `Event: ${type}`, properties as Record<string, unknown>);
      }
    },
  };
};

export default SessionLoggerPlugin;
