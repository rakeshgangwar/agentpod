import { getSandbox } from "@cloudflare/sandbox";
import {
  createOpencode,
  createOpencodeServer,
  proxyToOpencode,
} from "@cloudflare/sandbox/opencode";
import type { Config, OpencodeClient } from "@opencode-ai/sdk";

export { Sandbox } from "@cloudflare/sandbox";

interface Env {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sandbox: DurableObjectNamespace<any>;
  WORKSPACE_BUCKET: R2Bucket;
  AGENTPOD_API_URL: string;
  AGENTPOD_API_TOKEN: string;
}

interface CreateSandboxBody {
  id: string;
  userId: string;
  config?: Config;
  directory?: string;
  gitUrl?: string;
  gitBranch?: string;
}

interface SendMessageBody {
  sessionId?: string;
  message: string;
  model?: { providerID: string; modelID: string };
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

  const server = await createOpencodeServer(sandbox, {
    directory,
    config: body.config,
  });

  await notifyAgentPodAPI(env, "sandbox.created", {
    sandboxId,
    userId: body.userId,
    provider: "cloudflare",
  });

  return Response.json({
    success: true,
    sandboxId,
    status: "running",
    opencodeUrl: `/sandbox/${sandboxId}/opencode`,
    serverPort: server.port,
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
  const body = (await request.json()) as { config?: Config };
  const directory = "/home/user/workspace";

  const sandbox = getSandbox(env.Sandbox, sandboxId);

  const server = await createOpencodeServer(sandbox, {
    directory,
    config: body.config,
  });

  await notifyAgentPodAPI(env, "sandbox.woken", {
    sandboxId,
    provider: "cloudflare",
  });

  return Response.json({
    success: true,
    status: "running",
    serverPort: server.port,
  });
}

async function handleOpenCodeProxy(
  request: Request,
  env: Env,
  sandboxId: string
): Promise<Response> {
  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const directory = "/home/user/workspace";

  const server = await createOpencodeServer(sandbox, { directory });

  return proxyToOpencode(request, sandbox, server);
}

async function handleSendMessage(
  request: Request,
  env: Env,
  sandboxId: string
): Promise<Response> {
  const body = (await request.json()) as SendMessageBody;
  const sandbox = getSandbox(env.Sandbox, sandboxId);
  const directory = "/home/user/workspace";

  const { client } = await createOpencode<OpencodeClient>(sandbox, {
    directory,
    config: body.config,
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

  const response = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: body.message }],
      model: body.model,
    },
  });

  const parts = response.data?.parts ?? [];
  const textPart = parts.find((p: { type: string }) => p.type === "text") as
    | { text?: string }
    | undefined;

  await notifyAgentPodAPI(env, "session.message", {
    sandboxId,
    sessionId,
    provider: "cloudflare",
  });

  return Response.json({
    sessionId,
    response: textPart?.text ?? "",
    parts: response.data?.parts,
  });
}

async function handleSyncWorkspace(env: Env, sandboxId: string): Promise<Response> {
  return Response.json({
    success: true,
    syncedFiles: 0,
    sandboxId,
    message: "Workspace sync not yet implemented",
  });
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
