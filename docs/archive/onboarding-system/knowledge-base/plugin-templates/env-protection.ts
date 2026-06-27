/**
 * @id plugin_env_protection
 * @title Environment Protection Plugin
 * @description Prevents reading sensitive files like .env, secrets, and credentials
 * @tags ["security", "protection", "env", "secrets"]
 * @applicable_to null
 * @priority high
 */

import type { Plugin } from "@opencode-ai/plugin";

/**
 * Environment Protection Plugin
 * 
 * This plugin prevents the AI from reading sensitive files that may contain
 * secrets, API keys, passwords, or other confidential information.
 * 
 * Features:
 * - Blocks reading .env files
 * - Blocks reading common secret file patterns
 * - Logs blocked attempts for audit
 * - Configurable patterns via environment variables
 * 
 * Usage:
 * Place this file in .opencode/plugin/env-protection.ts
 */

// Configurable list of protected file patterns
const PROTECTED_PATTERNS = [
  // Environment files
  /\.env$/,
  /\.env\.[a-z]+$/,  // .env.local, .env.production, etc.
  /\.env\..*$/,
  
  // Secret files
  /secrets?\.(json|yaml|yml|toml)$/i,
  /credentials?\.(json|yaml|yml|toml)$/i,
  
  // Key files
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /id_rsa$/,
  /id_ed25519$/,
  /\.ssh\/config$/,
  
  // Cloud provider credentials
  /\.aws\/credentials$/,
  /\.gcloud\/credentials\.json$/,
  /\.azure\/credentials$/,
  
  // Password/token files
  /password/i,
  /token/i,
  /apikey/i,
  
  // Git credentials
  /\.git-credentials$/,
  /\.netrc$/,
];

// Additional patterns from environment variable (comma-separated regex)
const EXTRA_PATTERNS = process.env.OPENCODE_PROTECTED_FILES
  ?.split(",")
  .map((p) => new RegExp(p.trim())) ?? [];

const ALL_PATTERNS = [...PROTECTED_PATTERNS, ...EXTRA_PATTERNS];

function isProtectedFile(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  return ALL_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

/**
 * Environment Protection Plugin
 * 
 * Uses the "tool.execute.before" hook to intercept tool calls before execution
 * and block access to sensitive files.
 */
export const EnvProtectionPlugin: Plugin = async ({ project, directory }) => {
  console.log(`[env-protection] Initialized for project: ${project?.name || directory}`);
  
  return {
    // Hook into tool execution before it runs
    "tool.execute.before": async (input, output) => {
      const { tool, sessionID, callID } = input;
      const { args } = output;
      
      // Check file read operations
      if (tool === "read" || tool === "Read") {
        const filePath = args?.filePath || args?.path || args?.file;
        
        if (filePath && isProtectedFile(filePath)) {
          // Log the blocked attempt
          console.warn(`[env-protection] Blocked read attempt: ${filePath} (session: ${sessionID}, call: ${callID})`);
          
          throw new Error(
            `Access denied: Cannot read protected file "${filePath}". ` +
            `This file may contain sensitive information like API keys or secrets. ` +
            `If you need to configure environment variables, ask the user to provide them securely.`
          );
        }
      }
      
      // Check bash commands that might read files
      if (tool === "bash" || tool === "Bash") {
        const command = args?.command || "";
        
        // Check for cat, head, tail, less, more, etc. reading protected files
        const readCommands = /\b(cat|head|tail|less|more|bat|view)\s+/;
        if (readCommands.test(command)) {
          for (const pattern of ALL_PATTERNS) {
            if (pattern.test(command)) {
              console.warn(`[env-protection] Blocked bash read: ${command} (session: ${sessionID})`);
              
              throw new Error(
                `Access denied: Command may read protected files. ` +
                `Files matching sensitive patterns cannot be accessed.`
              );
            }
          }
        }
      }
      
      // Check grep commands that might expose secrets
      if (tool === "grep" || tool === "Grep") {
        const path = args?.path || args?.include || "";
        
        if (isProtectedFile(path)) {
          console.warn(`[env-protection] Blocked grep on: ${path} (session: ${sessionID})`);
          
          throw new Error(
            `Access denied: Cannot search in protected files.`
          );
        }
      }
      
      // Return modified output (unchanged in this case)
      return output;
    },
  };
};

export default EnvProtectionPlugin;
