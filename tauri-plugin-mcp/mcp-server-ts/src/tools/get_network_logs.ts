import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { socketClient } from "./client.js";

export function registerGetNetworkLogsTool(server: McpServer) {
  server.tool(
    "get_network_logs",
    "Retrieves captured network requests (fetch and XMLHttpRequest) from the application window. Logs include request/response headers, body, status, timing, and errors. Useful for debugging API calls and network issues.",
    {
      window_label: z.string().default("main").describe("The window to query. Defaults to 'main'."),
      method: z.string().optional().describe("Filter by HTTP method (GET, POST, PUT, DELETE, etc.)."),
      url_pattern: z.string().optional().describe("Filter by URL pattern (regex). Example: 'api/users' or '^https://api\\.example\\.com'"),
      status: z.number().optional().describe("Filter by HTTP status code. Example: 404, 500."),
      limit: z.number().default(100).describe("Maximum number of log entries to return. Default: 100, Max: 500."),
      clear: z.boolean().default(false).describe("If true, clears the network log buffer after retrieval."),
    },
    {
      title: "Get Network Logs",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ window_label, method, url_pattern, status, limit, clear }) => {
      try {
        const payload = {
          window_label,
          method,
          url_pattern,
          status,
          limit: Math.min(limit, 500),
          clear,
        };
        
        const result = await socketClient.sendCommand('get_network_logs', payload);
        
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
        console.error('Network logs retrieval error:', error);
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get network logs: ${(error as Error).message}` }],
        };
      }
    },
  );
}
