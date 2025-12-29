/**
 * System Plugins Service
 * 
 * Defines system plugins that are injected at runtime into containers.
 * These are NOT stored per-user in the database - they're always fetched
 * fresh from this code, ensuring all users get the latest version.
 */

import { createLogger } from "../utils/logger";

const log = createLogger("system-plugins-service");

// =============================================================================
// Types
// =============================================================================

export interface SystemPlugin {
  name: string;
  description: string;
  extension: "ts" | "js";
  content: string;
  isSystem: true;
}

// =============================================================================
// Plugin Definitions
// =============================================================================

const AGENTPOD_INTEGRATION_PLUGIN: SystemPlugin = {
  name: "agentpod-integration",
  description: "Core AgentPod integration - syncs permissions and session status",
  extension: "ts",
  isSystem: true,
  content: `import type { Plugin } from "@opencode-ai/plugin";

/**
 * AgentPod Integration Plugin
 * 
 * Syncs OpenCode events to the Management API for:
 * - Permission persistence (survives reconnects/restarts)
 * - Session status tracking (idle/busy visibility)
 * - File change notifications
 */
export const AgentPodIntegration: Plugin = async ({ client }) => {
  const API_URL = process.env.MANAGEMENT_API_URL;
  const SANDBOX_ID = process.env.SANDBOX_ID;
  const AUTH_TOKEN = process.env.AUTH_TOKEN;

  if (!API_URL || !SANDBOX_ID) {
    console.log("[AgentPod Plugin] Skipping - MANAGEMENT_API_URL or SANDBOX_ID not set");
    return {};
  }

  const makeRequest = async (path: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(\`\${API_URL}\${path}\`, {
        ...options,
        headers: {
          "Authorization": \`Bearer \${AUTH_TOKEN}\`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      
      if (!response.ok) {
        console.error(\`[AgentPod Plugin] Request failed: \${path} - \${response.status}\`);
      }
      
      return response;
    } catch (error) {
      console.error(\`[AgentPod Plugin] Request error: \${path}\`, error);
    }
  };

  console.log("[AgentPod Plugin] Initialized - syncing to", API_URL);

  return {
    "permission.updated": async ({ event }) => {
      const permission = event.properties;
      
      await makeRequest(\`/api/v2/sandboxes/\${SANDBOX_ID}/permissions\`, {
        method: "POST",
        body: JSON.stringify({
          permissionId: permission.id,
          sessionId: permission.sessionID,
          type: permission.type,
          title: permission.title,
          message: permission.message,
          status: "pending",
          created: permission.time?.created || Date.now(),
        }),
      });
      
      console.log(\`[AgentPod Plugin] Persisted permission \${permission.id}\`);
    },

    "permission.replied": async ({ event }) => {
      const { sessionID, permissionID } = event.properties;
      
      await makeRequest(\`/api/v2/sandboxes/\${SANDBOX_ID}/permissions/\${permissionID}\`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "resolved",
          resolvedAt: Date.now(),
        }),
      });
      
      console.log(\`[AgentPod Plugin] Resolved permission \${permissionID}\`);
    },

    "session.idle": async ({ event }) => {
      await makeRequest(\`/api/v2/sandboxes/\${SANDBOX_ID}/session-status\`, {
        method: "POST",
        body: JSON.stringify({
          sessionId: event.sessionID,
          status: "idle",
          timestamp: Date.now(),
        }),
      });
    },

    "session.status": async ({ event }) => {
      const status = event.properties?.status || "unknown";
      await makeRequest(\`/api/v2/sandboxes/\${SANDBOX_ID}/session-status\`, {
        method: "POST",
        body: JSON.stringify({
          sessionId: event.sessionID,
          status,
          timestamp: Date.now(),
        }),
      });
    },

    "file.edited": async ({ event }) => {
      await makeRequest(\`/api/v2/sandboxes/\${SANDBOX_ID}/file-changes\`, {
        method: "POST",
        body: JSON.stringify({
          path: event.properties?.path || event.path,
          timestamp: Date.now(),
        }),
      });
    },
  };
};
`,
};

const SECURITY_GUARDRAILS_PLUGIN: SystemPlugin = {
  name: "security-guardrails",
  description: "Security protection - blocks .env reads and detects secrets",
  extension: "ts",
  isSystem: true,
  content: `import type { Plugin } from "@opencode-ai/plugin";

/**
 * Security Guardrails Plugin
 * 
 * Prevents common security mistakes:
 * - Blocks reading .env files (credentials should stay in environment)
 * - Detects potential secrets in file writes
 * - Protects sensitive file patterns
 */
export const SecurityGuardrails: Plugin = async () => {
  const SECRET_PATTERNS = [
    /api[_-]?key\\s*[:=]\\s*["']?[a-zA-Z0-9_-]{20,}/i,
    /secret\\s*[:=]\\s*["']?[a-zA-Z0-9_-]{20,}/i,
    /password\\s*[:=]\\s*["']?[^\\s"']{8,}/i,
    /private[_-]?key/i,
    /-----BEGIN\\s+(RSA\\s+)?PRIVATE\\s+KEY-----/,
    /ghp_[a-zA-Z0-9]{36}/,
    /sk-[a-zA-Z0-9]{48}/,
    /sk-ant-[a-zA-Z0-9-]{95}/,
  ];

  const PROTECTED_FILES = [
    /\\.env$/,
    /\\.env\\.[a-z]+$/,
    /\\.env\\.local$/,
    /credentials\\.json$/,
    /secrets?\\.ya?ml$/,
    /\\.pem$/,
    /\\.key$/,
    /id_rsa$/,
    /id_ed25519$/,
  ];

  console.log("[Security Plugin] Initialized - protecting sensitive files");

  return {
    "tool.execute.before": async (input, output) => {
      const tool = input.tool;
      const args = output.args || {};

      if (tool === "read" && args.filePath) {
        const filePath = String(args.filePath);
        
        for (const pattern of PROTECTED_FILES) {
          if (pattern.test(filePath)) {
            throw new Error(
              \`⚠️ Security: Cannot read protected file "\${filePath}". \\n\` +
              \`These files may contain secrets. Access environment variables directly instead.\`
            );
          }
        }
      }

      if ((tool === "write" || tool === "edit") && args.content) {
        const content = String(args.content);
        const filePath = String(args.filePath || args.path || "unknown");
        
        for (const pattern of PROTECTED_FILES) {
          if (pattern.test(filePath)) {
            throw new Error(
              \`⚠️ Security: Cannot write to protected file pattern "\${filePath}".\`
            );
          }
        }

        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            throw new Error(
              \`⚠️ Security: Potential secret detected in content being written to "\${filePath}".\\n\` +
              \`Please use environment variables for sensitive values instead of hardcoding them.\`
            );
          }
        }
      }
    },
  };
};
`,
};

const SYSTEM_PLUGINS: SystemPlugin[] = [
  AGENTPOD_INTEGRATION_PLUGIN,
  SECURITY_GUARDRAILS_PLUGIN,
];

// =============================================================================
// Public API
// =============================================================================

export function getSystemPlugins(): SystemPlugin[] {
  return SYSTEM_PLUGINS;
}

export function getSystemPluginsAsFiles(): Array<{
  type: "plugin";
  name: string;
  extension: "ts" | "js";
  content: string;
  isSystem: true;
}> {
  return SYSTEM_PLUGINS.map((p) => ({
    type: "plugin" as const,
    name: p.name,
    extension: p.extension,
    content: p.content,
    isSystem: true as const,
  }));
}

export function isSystemPlugin(pluginName: string): boolean {
  return SYSTEM_PLUGINS.some((p) => p.name === pluginName);
}

export function getSystemPluginNames(): string[] {
  return SYSTEM_PLUGINS.map((p) => p.name);
}

export function getSystemPluginMetadata(): Array<{
  name: string;
  description: string;
  extension: string;
}> {
  return SYSTEM_PLUGINS.map((p) => ({
    name: p.name,
    description: p.description,
    extension: p.extension,
  }));
}
