import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { socketClient } from "./client.js";

export function registerGetConsoleLogsTool(server: McpServer) {
  server.tool(
    "get_console_logs",
    "Retrieves captured console logs (log, info, warn, error, debug) from the application window. Logs are captured from the moment the MCP debug module initializes. Useful for debugging and monitoring application behavior.",
    {
      window_label: z.string().default("main").describe("The window to query. Defaults to 'main'."),
      level: z.enum(["log", "info", "warn", "error", "debug", "all"]).optional().describe("Filter logs by level. If omitted or 'all', returns all log levels."),
      limit: z.number().default(100).describe("Maximum number of log entries to return. Default: 100, Max: 500."),
      clear: z.boolean().default(false).describe("If true, clears the log buffer after retrieval."),
    },
    {
      title: "Get Console Logs",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ window_label, level, limit, clear }) => {
      try {
        const payload = {
          window_label,
          level,
          limit: Math.min(limit, 500),
          clear,
        };
        
        console.error(`Getting console logs with params: ${JSON.stringify(payload)}`);
        
        const result = await socketClient.sendCommand('get_console_logs', payload);
        
        let content: string;
        if (typeof result === 'string') {
          content = result;
        } else if (result && typeof result === 'object') {
          content = JSON.stringify(result, null, 2);
        } else {
          content = String(result);
        }
        
        return {
          content: [{ type: "text", text: content }],
        };
      } catch (error) {
        console.error('Console logs retrieval error:', error);
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get console logs: ${(error as Error).message}` }],
        };
      }
    },
  );
}
