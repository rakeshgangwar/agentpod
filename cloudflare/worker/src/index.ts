import { getSandbox } from "@cloudflare/sandbox";
import {
  createOpencode,
  createOpencodeServer,
  proxyToOpencode,
} from "@cloudflare/sandbox/opencode";
import type { Config, OpencodeClient } from "@opencode-ai/sdk";
import { WorkspaceStorage } from "./storage";
import { validateWorkflowForExecution } from "./workflows/executor";
import type { WorkflowDefinition } from "./workflows/utils/context";
import { normalizeWorkflow, type FrontendWorkflow } from "./workflows/utils/format-transformer";
import type { WorkflowParams } from "./workflows/sdk/types";

export { Sandbox } from "@cloudflare/sandbox";
export { AgentPodWorkflow } from "./workflows/sdk/workflow";

const DEFAULT_WORKSPACE_DIR = "/home/user/workspace";

const SYNC_EXCLUDED_PATHS = [
  "node_modules",
  ".git",
  "__pycache__",
  ".cache",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "target",
  ".opencode",
  ".DS_Store",
];



interface Env {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sandbox: DurableObjectNamespace<any>;
  WORKFLOW: Workflow;
  WORKSPACE_BUCKET: R2Bucket;
  AGENTPOD_API_URL: string;
  AGENTPOD_API_TOKEN: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
  AI?: Ai;
}

interface ConfigFile {
  type: "agent" | "command" | "tool" | "plugin";
  name: string;
  extension: "md" | "ts" | "js";
  content: string;
  isSystem?: boolean;
}

interface CreateSandboxBody {
  id: string;
  userId: string;
  config?: Config & {
    files?: ConfigFile[];
    agents_md?: string;
    auth?: Record<string, AuthEntry>;
  };
  directory?: string;
  gitUrl?: string;
  gitBranch?: string;
}

interface SendMessageBody {
  sessionId?: string;
  message: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  config?: Config;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    try {
      if (request.method === "GET" && pathParts[0] === "health") {
        return Response.json({ status: "ok", timestamp: new Date().toISOString() });
      }

      if (request.method === "POST" && pathParts[0] === "sandbox" && !pathParts[1]) {
        return handleCreateSandbox(request, env);
      }

      if (request.method === "GET" && pathParts[0] === "sandbox" && pathParts[1] && !pathParts[2]) {
        return handleGetSandbox(env, pathParts[1]);
      }

      if (request.method === "DELETE" && pathParts[0] === "sandbox" && pathParts[1]) {
        return handleDeleteSandbox(env, pathParts[1]);
      }

      if (request.method === "POST" && pathParts[2] === "wake") {
        return handleWakeSandbox(request, env, pathParts[1]);
      }

      if (pathParts[0] === "sandbox" && pathParts[2] === "opencode") {
        return handleOpenCodeProxy(request, env, pathParts[1]);
      }

      if (request.method === "POST" && pathParts[2] === "message") {
        return handleSendMessage(request, env, pathParts[1]);
      }

      if (request.method === "POST" && pathParts[2] === "sync") {
        return handleSyncWorkspace(env, pathParts[1]);
      }

      if (request.method === "POST" && pathParts[0] === "workflow" && pathParts[1] === "execute") {
        return handleWorkflowExecute(request, env);
      }

      if (request.method === "POST" && pathParts[0] === "workflow" && pathParts[1] === "validate") {
        return handleWorkflowValidate(request);
      }

      if (request.method === "GET" && pathParts[0] === "workflow" && pathParts[1] && pathParts[2] === "status") {
        return handleWorkflowStatus(env, pathParts[1]);
      }

      if (request.method === "POST" && pathParts[0] === "workflow" && pathParts[1] && pathParts[2] === "pause") {
        return handleWorkflowPause(env, pathParts[1]);
      }

      if (request.method === "POST" && pathParts[0] === "workflow" && pathParts[1] && pathParts[2] === "resume") {
        return handleWorkflowResume(env, pathParts[1]);
      }

      if (request.method === "POST" && pathParts[0] === "workflow" && pathParts[1] && pathParts[2] === "terminate") {
        return handleWorkflowTerminate(env, pathParts[1]);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Worker error:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  },
};

type SandboxInstance = ReturnType<typeof getSandbox>;

interface AuthEntry {
  type: "api" | "oauth";
  key?: string;
  refresh?: string;
  access?: string;
  expires?: number;
}

async function writeConfigFiles(
  sandbox: SandboxInstance,
  workspaceDir: string,
  config?: { files?: ConfigFile[]; agents_md?: string },
  opencodeConfig?: Config,
  authConfig?: Record<string, AuthEntry>
): Promise<number> {
  if (!config && !opencodeConfig && !authConfig) return 0;
  
  let filesWritten = 0;
  const opencodeDir = `${workspaceDir}/.opencode`;
  
  if (config?.agents_md) {
    const agentsMdPath = `${workspaceDir}/AGENTS.md`;
    await sandbox.writeFile(agentsMdPath, config.agents_md);
    filesWritten++;
    console.log(`[CONFIG] Wrote AGENTS.md to ${agentsMdPath}`);
  }
  
  const needsOpencodeDir = opencodeConfig || authConfig || config?.files?.length;
  if (needsOpencodeDir) {
    await sandbox.mkdir(opencodeDir, { recursive: true });
  }
  
  if (opencodeConfig && Object.keys(opencodeConfig).length > 0) {
    const opencodeJsonPath = `${opencodeDir}/opencode.json`;
    await sandbox.writeFile(opencodeJsonPath, JSON.stringify(opencodeConfig, null, 2));
    filesWritten++;
    console.log(`[CONFIG] Wrote opencode.json to ${opencodeJsonPath}`);
  }
  
  if (authConfig && Object.keys(authConfig).length > 0) {
    const authJsonPath = `${opencodeDir}/auth.json`;
    await sandbox.writeFile(authJsonPath, JSON.stringify(authConfig, null, 2));
    filesWritten++;
    console.log(`[CONFIG] Wrote auth.json to ${authJsonPath}`);
  }
  
  if (!config?.files || config.files.length === 0) {
    return filesWritten;
  }
  
  const typeToDir: Record<string, string> = {
    plugin: `${opencodeDir}/plugin`,
    agent: `${opencodeDir}/agent`,
    command: `${opencodeDir}/command`,
    tool: `${opencodeDir}/tool`,
  };
  
  const dirsToCreate = new Set<string>();
  for (const file of config.files) {
    const dir = typeToDir[file.type];
    if (dir) dirsToCreate.add(dir);
  }
  
  for (const dir of dirsToCreate) {
    await sandbox.mkdir(dir, { recursive: true });
    console.log(`[CONFIG] Created directory ${dir}`);
  }
  
  for (const file of config.files) {
    const dir = typeToDir[file.type];
    if (!dir) {
      console.warn(`[CONFIG] Unknown file type: ${file.type}`);
      continue;
    }
    
    const filePath = `${dir}/${file.name}.${file.extension}`;
    await sandbox.writeFile(filePath, file.content);
    filesWritten++;
    console.log(`[CONFIG] Wrote ${file.type} file: ${filePath}`);
  }
  
  return filesWritten;
}

async function setAuthCredentials(
  sandbox: SandboxInstance,
  directory: string,
  authConfig: Record<string, AuthEntry>
): Promise<void> {
  const { client } = await createOpencode<OpencodeClient>(sandbox, { directory });
  
  for (const [providerId, credentials] of Object.entries(authConfig)) {
    try {
      if (credentials.type === "api" && credentials.key) {
        await client.auth.set({
          path: { id: providerId },
          body: { type: "api", key: credentials.key },
        });
        console.log(`[AUTH] Set API key for provider: ${providerId}`);
      } else if (credentials.type === "oauth" && (credentials.refresh || credentials.access)) {
        await client.auth.set({
          path: { id: providerId },
          body: {
            type: "oauth",
            refresh: credentials.refresh || "",
            access: credentials.access || "",
            expires: credentials.expires || 0,
          },
        });
        console.log(`[AUTH] Set OAuth credentials for provider: ${providerId}`);
      }
    } catch (error) {
      console.error(`[AUTH] Failed to set credentials for ${providerId}:`, error);
    }
  }
}

async function handleCreateSandbox(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as CreateSandboxBody;
  const sandboxId = body.id;
  const directory = body.directory || "/home/user/workspace";

  const sandbox = getSandbox(env.Sandbox, sandboxId);

  if (body.gitUrl) {
    await sandbox.gitCheckout(body.gitUrl, {
      targetDir: directory,
      branch: body.gitBranch,
    });
  }

  const { files, agents_md, auth, ...openCodeConfig } = body.config ?? {};
  const hasOpenCodeConfig = Object.keys(openCodeConfig).length > 0;
  
  const filesWritten = await writeConfigFiles(
    sandbox, 
    directory, 
    { files, agents_md },
    hasOpenCodeConfig ? openCodeConfig as Config : undefined,
    auth as Record<string, AuthEntry> | undefined
  );
  console.log(`[CREATE] Wrote ${filesWritten} config files for sandbox ${sandboxId}`);
  
  const server = await createOpencodeServer(sandbox, {
    directory,
  });

  if (auth && Object.keys(auth).length > 0) {
    await setAuthCredentials(sandbox, directory, auth as Record<string, AuthEntry>);
  }

  await notifyAgentPodAPI(env, "sandbox.created", {
    sandboxId,
    userId: body.userId,
    provider: "cloudflare",
    filesWritten,
  });

  return Response.json({
    success: true,
    sandboxId,
    status: "running",
    opencodeUrl: `/sandbox/${sandboxId}/opencode`,
    serverPort: server.port,
    filesWritten,
  });
}

async function handleGetSandbox(env: Env, sandboxId: string): Promise<Response> {
  const workspaceKey = `workspaces/${sandboxId}/`;
  const objects = await env.WORKSPACE_BUCKET.list({ prefix: workspaceKey, limit: 1 });
  const hasWorkspace = objects.objects.length > 0;

  return Response.json({
    sandboxId,
    status: "sleeping",
    hasWorkspace,
    provider: "cloudflare",
  });
}

async function handleDeleteSandbox(env: Env, sandboxId: string): Promise<Response> {
  const workspaceKey = `workspaces/${sandboxId}/`;
  const objects = await env.WORKSPACE_BUCKET.list({ prefix: workspaceKey });

  for (const obj of objects.objects) {
    await env.WORKSPACE_BUCKET.delete(obj.key);
  }

  await notifyAgentPodAPI(env, "sandbox.deleted", {
    sandboxId,
    provider: "cloudflare",
  });

  return Response.json({ success: true, deleted: sandboxId });
}

async function handleWakeSandbox(
  request: Request,
  env: Env,
  sandboxId: string
): Promise<Response> {
  const body = (await request.json()) as { 
    config?: Config & { files?: ConfigFile[]; agents_md?: string; auth?: Record<string, AuthEntry> } 
  };

  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const storage = new WorkspaceStorage(env.WORKSPACE_BUCKET, sandboxId);

  const restoreResult = await restoreR2ToSandbox(sandbox, storage, DEFAULT_WORKSPACE_DIR);
  console.log(`[WAKE] Restored ${restoreResult.restoredFiles} files from R2 for sandbox ${sandboxId}`);

  const { files, agents_md, auth, ...openCodeConfig } = body.config ?? {};
  const hasOpenCodeConfig = Object.keys(openCodeConfig).length > 0;

  const filesWritten = await writeConfigFiles(
    sandbox, 
    DEFAULT_WORKSPACE_DIR, 
    { files, agents_md },
    hasOpenCodeConfig ? openCodeConfig as Config : undefined,
    auth
  );
  console.log(`[WAKE] Wrote ${filesWritten} config files for sandbox ${sandboxId}`);

  const server = await createOpencodeServer(sandbox, {
    directory: DEFAULT_WORKSPACE_DIR,
  });

  if (auth && Object.keys(auth).length > 0) {
    await setAuthCredentials(sandbox, DEFAULT_WORKSPACE_DIR, auth);
  }

  await notifyAgentPodAPI(env, "sandbox.woken", {
    sandboxId,
    restoredFiles: restoreResult.restoredFiles,
    filesWritten,
    provider: "cloudflare",
  });

  return Response.json({
    success: true,
    status: "running",
    serverPort: server.port,
    restoredFiles: restoreResult.restoredFiles,
    filesWritten,
  });
}

async function handleOpenCodeProxy(
  request: Request,
  env: Env,
  sandboxId: string
): Promise<Response> {
  const directory = "/home/user/workspace";

  const url = new URL(request.url);
  const gatewayPrefix = `/sandbox/${sandboxId}/opencode`;
  const opencodeApiPath = url.pathname.replace(gatewayPrefix, "") || "/";

  try {
    const sandbox = getSandbox(env.Sandbox, sandboxId);

    // WORKAROUND: Raw containerFetch returns empty body for long-running AI prompt requests.
    // Use SDK client which handles request lifecycle properly.
    const messageMatch = opencodeApiPath.match(/^\/session\/([^/]+)\/message$/);
    if (request.method === "POST" && messageMatch) {
      const sessionId = messageMatch[1];
      
      const body = await request.json() as {
        parts: Array<{ type: "text"; text: string }>;
        model?: { providerID: string; modelID: string };
        agent?: string;
      };
      
      console.log(`[DEBUG] Using SDK for /session/${sessionId}/message`);
      
      const { client } = await createOpencode<OpencodeClient>(sandbox, { directory });
      
      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: body.parts,
          model: body.model,
          agent: body.agent,
        },
      });
      
      console.log(`[DEBUG] SDK result type: ${typeof result}, keys: ${Object.keys(result ?? {}).join(',')}`);
      console.log(`[DEBUG] SDK result.data type: ${typeof result.data}, keys: ${Object.keys(result.data ?? {}).join(',')}`);
      console.log(`[DEBUG] SDK result.data stringified: ${JSON.stringify(result.data).slice(0, 500)}`);
      
      const storage = new WorkspaceStorage(env.WORKSPACE_BUCKET, sandboxId);
      syncSandboxToR2(sandbox, storage, directory).then(syncResult => {
        console.log(`[AUTO-SYNC] Proxy message completed: ${syncResult.syncedFiles} files synced for ${sandboxId}`);
      }).catch(err => {
        console.error(`[AUTO-SYNC] Failed after proxy message for ${sandboxId}:`, err);
      });
      
      return Response.json(result.data ?? {});
    }

    console.log(`[DEBUG] Proxying to OpenCode: ${request.method} ${opencodeApiPath}`);
    
    const server = await createOpencodeServer(sandbox, { directory });
    const rewrittenUrl = new URL(opencodeApiPath + url.search, url.origin);
    const proxyRequest = new Request(rewrittenUrl.toString(), request);

    return proxyToOpencode(proxyRequest, sandbox, server);
  } catch (error) {
    console.error(`[ERROR] OpenCode proxy failed for ${request.method} ${opencodeApiPath}:`, error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error", path: opencodeApiPath },
      { status: 500 }
    );
  }
}

async function handleSendMessage(
  request: Request,
  env: Env,
  sandboxId: string
): Promise<Response> {
  const body = (await request.json()) as SendMessageBody;
  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const directory = "/home/user/workspace";

  const hasValidConfig = body.config?.provider && 
    Object.keys(body.config.provider).length > 0;
  
  const { client } = await createOpencode<OpencodeClient>(sandbox, {
    directory,
    ...(hasValidConfig ? { config: body.config } : {}),
  });

  let sessionId = body.sessionId;
  if (!sessionId) {
    const session = await client.session.create({
      body: { title: "Agent Task" },
    });
    if (!session.data) {
      return Response.json({ error: "Failed to create session" }, { status: 500 });
    }
    sessionId = session.data.id;
  }

  console.log(`[DEBUG] handleSendMessage: calling client.session.prompt`, {
    sessionId,
    message: body.message?.slice(0, 50),
    hasModel: !!body.model,
    hasAgent: !!body.agent,
    agent: body.agent,
  });
  
  const response = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: body.message }],
      model: body.model,
      agent: body.agent,
    },
  });

  console.log(`[DEBUG] handleSendMessage: prompt response`, {
    sessionId,
    hasData: !!response.data,
    dataKeys: Object.keys(response.data ?? {}),
    dataStringified: JSON.stringify(response.data ?? {}).slice(0, 500),
  });
  
  const parts = response.data?.parts ?? [];
  const textPart = parts.find((p: { type: string }) => p.type === "text") as
    | { text?: string }
    | undefined;
  
  console.log(`[DEBUG] handleSendMessage: extracted parts`, {
    sessionId,
    partsCount: parts.length,
    textPartFound: !!textPart,
    textPreview: textPart?.text?.slice(0, 100),
  });

  await notifyAgentPodAPI(env, "session.message", {
    sandboxId,
    sessionId,
    provider: "cloudflare",
  });

  const storage = new WorkspaceStorage(env.WORKSPACE_BUCKET, sandboxId);
  const syncResult = await syncSandboxToR2(sandbox, storage, directory).catch(err => {
    console.error(`[AUTO-SYNC] Failed after message for ${sandboxId}:`, err);
    return { syncedFiles: 0, skippedFiles: 0, totalSize: 0, errors: [err.message] };
  });
  
  console.log(`[AUTO-SYNC] After message: ${syncResult.syncedFiles} files synced for ${sandboxId}`);

  return Response.json({
    sessionId,
    response: textPart?.text ?? "",
    parts: response.data?.parts,
    sync: {
      syncedFiles: syncResult.syncedFiles,
      totalSize: syncResult.totalSize,
    },
  });
}

async function handleSyncWorkspace(env: Env, sandboxId: string): Promise<Response> {
  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const storage = new WorkspaceStorage(env.WORKSPACE_BUCKET, sandboxId);
  
  try {
    const result = await syncSandboxToR2(sandbox, storage, DEFAULT_WORKSPACE_DIR);
    
    await notifyAgentPodAPI(env, "workspace.synced", {
      sandboxId,
      syncedFiles: result.syncedFiles,
      totalSize: result.totalSize,
      provider: "cloudflare",
    });
    
    return Response.json({
      success: true,
      sandboxId,
      syncedFiles: result.syncedFiles,
      skippedFiles: result.skippedFiles,
      totalSize: result.totalSize,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[ERROR] Sync failed for sandbox ${sandboxId}:`, error);
    return Response.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Sync failed",
        sandboxId,
      },
      { status: 500 }
    );
  }
}

function shouldExcludeFromSync(relativePath: string): boolean {
  const pathParts = relativePath.split("/");
  return SYNC_EXCLUDED_PATHS.some(excluded => 
    pathParts.some(part => part === excluded || part.startsWith(excluded))
  );
}

interface SyncResult {
  syncedFiles: number;
  skippedFiles: number;
  totalSize: number;
  errors: string[];
}

async function syncSandboxToR2(
  sandbox: ReturnType<typeof getSandbox>,
  storage: WorkspaceStorage,
  directory: string
): Promise<SyncResult> {
  const result: SyncResult = {
    syncedFiles: 0,
    skippedFiles: 0,
    totalSize: 0,
    errors: [],
  };

  const listResult = await sandbox.listFiles(directory, { recursive: true });
  
  if (!listResult.success) {
    throw new Error(`Failed to list files in ${directory}`);
  }

  for (const file of listResult.files) {
    if (file.type !== "file") continue;
    
    const relativePath = file.relativePath || file.absolutePath.replace(directory + "/", "");
    
    if (shouldExcludeFromSync(relativePath)) {
      result.skippedFiles++;
      continue;
    }

    try {
      const fileContent = await sandbox.readFile(file.absolutePath);
      
      if (!fileContent.success) {
        result.errors.push(`Failed to read: ${relativePath}`);
        continue;
      }

      const content = fileContent.isBinary 
        ? Uint8Array.from(atob(fileContent.content), c => c.charCodeAt(0))
        : new TextEncoder().encode(fileContent.content);
      
      await storage.saveFile(relativePath, content);
      result.syncedFiles++;
      result.totalSize += file.size;
    } catch (error) {
      result.errors.push(`Error syncing ${relativePath}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  console.log(`[SYNC] Completed: ${result.syncedFiles} files synced, ${result.skippedFiles} skipped, ${result.errors.length} errors`);
  
  return result;
}

async function restoreR2ToSandbox(
  sandbox: ReturnType<typeof getSandbox>,
  storage: WorkspaceStorage,
  directory: string
): Promise<{ restoredFiles: number; errors: string[] }> {
  const result = { restoredFiles: 0, errors: [] as string[] };
  
  const files = await storage.listFiles();
  
  if (files.length === 0) {
    console.log(`[RESTORE] No files found in R2 for workspace`);
    return result;
  }

  const directories = new Set<string>();
  for (const filePath of files) {
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir) {
      directories.add(dir);
    }
  }
  
  for (const dir of Array.from(directories).sort()) {
    await sandbox.mkdir(`${directory}/${dir}`, { recursive: true }).catch(() => {});
  }

  console.log(`[RESTORE] Found ${files.length} files in R2:`, files);

  for (const filePath of files) {
    try {
      const content = await storage.loadFile(filePath);
      if (!content) {
        console.log(`[RESTORE] No content for ${filePath}, skipping`);
        continue;
      }

      const textContent = new TextDecoder().decode(content);
      const fullPath = `${directory}/${filePath}`;
      
      console.log(`[RESTORE] Writing ${filePath} (${content.byteLength} bytes) to ${fullPath}`);
      const writeResult = await sandbox.writeFile(fullPath, textContent);
      
      if (!writeResult.success) {
        result.errors.push(`Failed to write ${filePath}: ${JSON.stringify(writeResult)}`);
        console.error(`[RESTORE] Write failed for ${filePath}:`, writeResult);
        continue;
      }
      
      result.restoredFiles++;
      console.log(`[RESTORE] Successfully restored ${filePath}`);
    } catch (error) {
      result.errors.push(`Error restoring ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`);
      console.error(`[RESTORE] Exception for ${filePath}:`, error);
    }
  }

  console.log(`[RESTORE] Completed: ${result.restoredFiles} files restored, ${result.errors.length} errors`);
  
  return result;
}

async function notifyAgentPodAPI(
  env: Env,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!env.AGENTPOD_API_URL || !env.AGENTPOD_API_TOKEN) {
    console.log("AgentPod API not configured, skipping notification:", event);
    return;
  }

  try {
    await fetch(`${env.AGENTPOD_API_URL}/api/v2/cloudflare/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AGENTPOD_API_TOKEN}`,
      },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  } catch (error) {
    console.error("Failed to notify AgentPod API:", error);
  }
}

interface WorkflowExecuteBody {
  executionId: string;
  workflowId: string;
  workflow: WorkflowDefinition | FrontendWorkflow;
  triggerType: "manual" | "webhook" | "schedule" | "event";
  triggerData?: Record<string, unknown>;
  userId?: string;
}

async function handleWorkflowExecute(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as WorkflowExecuteBody;
  
  const normalizedWorkflow = normalizeWorkflow(body.workflow, body.workflowId);
  
  const validationErrors = validateWorkflowForExecution(normalizedWorkflow);
  if (validationErrors.length > 0) {
    return Response.json(
      { error: "Invalid workflow", errors: validationErrors },
      { status: 400 }
    );
  }

  console.log(`[Workflow] Starting execution ${body.executionId} for workflow ${body.workflowId}`);
  console.log("[Workflow] ENV DEBUG: AGENTPOD_API_URL=" + (env.AGENTPOD_API_URL || "NOT SET"));
  console.log("[Workflow] ENV DEBUG: AGENTPOD_API_TOKEN=" + (env.AGENTPOD_API_TOKEN ? "SET (" + env.AGENTPOD_API_TOKEN.length + " chars)" : "NOT SET"));

  const instance = await env.WORKFLOW.create({
    id: body.executionId,
    params: {
      executionId: body.executionId,
      workflowId: body.workflowId,
      definition: normalizedWorkflow,
      triggerType: body.triggerType,
      triggerData: body.triggerData || {},
      userId: body.userId,
    } as WorkflowParams,
  });

  return Response.json({
    executionId: body.executionId,
    instanceId: instance.id,
    status: "queued",
  }, { status: 202 });
}

async function handleWorkflowValidate(request: Request): Promise<Response> {
  const body = (await request.json()) as { workflow: WorkflowDefinition | FrontendWorkflow };
  
  const normalizedWorkflow = normalizeWorkflow(body.workflow, "validation");
  const errors = validateWorkflowForExecution(normalizedWorkflow);
  
  return Response.json({
    valid: errors.length === 0,
    errors,
  });
}

async function handleWorkflowStatus(env: Env, executionId: string): Promise<Response> {
  try {
    const instance = await env.WORKFLOW.get(executionId);
    const status = await instance.status();
    
    return Response.json({
      executionId,
      status: status.status,
      output: status.output,
      error: status.error,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return Response.json({ error: "Workflow instance not found" }, { status: 404 });
    }
    throw error;
  }
}

async function handleWorkflowPause(env: Env, executionId: string): Promise<Response> {
  try {
    const instance = await env.WORKFLOW.get(executionId);
    await instance.pause();
    
    return Response.json({
      executionId,
      status: "paused",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return Response.json({ error: "Workflow instance not found" }, { status: 404 });
    }
    throw error;
  }
}

async function handleWorkflowResume(env: Env, executionId: string): Promise<Response> {
  try {
    const instance = await env.WORKFLOW.get(executionId);
    await instance.resume();
    
    return Response.json({
      executionId,
      status: "running",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return Response.json({ error: "Workflow instance not found" }, { status: 404 });
    }
    throw error;
  }
}

async function handleWorkflowTerminate(env: Env, executionId: string): Promise<Response> {
  try {
    const instance = await env.WORKFLOW.get(executionId);
    await instance.terminate();
    
    return Response.json({
      executionId,
      status: "terminated",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return Response.json({ error: "Workflow instance not found" }, { status: 404 });
    }
    throw error;
  }
}
