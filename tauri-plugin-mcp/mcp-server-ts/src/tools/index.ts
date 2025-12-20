import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTakeScreenshotTool } from "./take_screenshot.js";
import { registerExecuteJsTool } from "./execute_js.js";
import { registerManageWindowTool } from "./manage_window.js";
import { registerManageLocalStorageTool } from "./manage_local_storage.js";
import { registerTextInputTool } from "./text_input.js";
import { registerMouseMovementTool } from "./mouse_movement.js";
import { registerGetElementPositionTool } from "./get_element_position.js";
import { registerSendTextToElementTool } from "./send_text_to_element.js";
import { registerGetConsoleLogsTool } from "./get_console_logs.js";
import { registerGetNetworkLogsTool } from "./get_network_logs.js";
import { socketClient } from "./client.js";

// Re-export the socket client for direct use
export { socketClient } from "./client.js";

// Function to register all tools with a server instance
export function registerAllTools(server: McpServer) {
  registerTakeScreenshotTool(server);
  registerExecuteJsTool(server);
  registerManageWindowTool(server);
  registerManageLocalStorageTool(server);
  registerTextInputTool(server);
  registerMouseMovementTool(server);
  registerGetElementPositionTool(server);
  registerSendTextToElementTool(server);
  registerGetConsoleLogsTool(server);
  registerGetNetworkLogsTool(server);
}

// Function to initialize socket connection (can be awaited before registering tools)
export async function initializeSocket(): Promise<void> {
  try {
    await socketClient.connect();
    console.error("Socket connection initialized successfully");
  } catch (error) {
    console.error("Failed to initialize socket connection:", error);
    // Don't rethrow - allow operation to continue without socket
  }
} 