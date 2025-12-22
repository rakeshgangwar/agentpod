import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getCloudflareProvider, isCloudflareConfigured, selectProvider } from "../services/providers";
import { agentPodToCloudflareConfig } from "../services/providers/config-adapter";
import { opencodeV2 } from "../services/opencode-v2";
import { getSandboxManager } from "../services/sandbox-manager";
import * as SandboxModel from "../models/sandbox";
import { buildOpenCodeAuthJson } from "../models/provider";
import { getUserOpencodeFullConfig } from "../models/user-opencode-config";
import { createLogger } from "../utils/logger";
import { db } from "../db/drizzle";
import { agentTasks, taskTemplates } from "../db/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { agentOrchestratorService } from "../services/agents/index";

const log = createLogger("agents-routes");

function getAuthenticatedUserId(c: { get: (key: string) => unknown }): string | null {
  const user = c.get("user") as { id?: string } | undefined;
  return user?.id ?? null;
}

export const agentRoutes = new Hono()
  .post(
    "/task",
    zValidator(
      "json",
      z.object({
        message: z.string(),
        gitUrl: z.string().url().optional(),
        gitBranch: z.string().optional(),
        model: z
          .object({
            providerID: z.string(),
            modelID: z.string(),
          })
          .optional(),
        sandboxId: z.string().optional(),
        provider: z.enum(["docker", "cloudflare"]).optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid("json");
      const taskId = nanoid(12);
      const userId = getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      log.info("Creating agent task", { taskId, userId, provider: body.provider });

      if (!isCloudflareConfigured() && body.provider === "cloudflare") {
        return c.json({ error: "Cloudflare sandboxes not configured" }, 400);
      }

      try {
        const provider = selectProvider({
          provider: body.provider,
          useCase: "quick-task",
        });

        let sandboxId = body.sandboxId;
        if (!sandboxId) {
          const quickSandboxId = `task-${taskId}`;
          
          let openCodeConfig;
          if (provider.type === "cloudflare") {
            const [authJson, userConfig] = await Promise.all([
              buildOpenCodeAuthJson(userId),
              getUserOpencodeFullConfig(userId),
            ]);
            const auth = authJson ? JSON.parse(authJson) : null;
            const adaptedUserConfig = userConfig ? {
              settings: userConfig.settings as Record<string, unknown>,
              agents_md: userConfig.agents_md,
              files: userConfig.files,
            } : null;
            openCodeConfig = agentPodToCloudflareConfig(auth, adaptedUserConfig);
          }
          
          const sandbox = await provider.createSandbox({
            id: quickSandboxId,
            userId,
            gitUrl: body.gitUrl,
            gitBranch: body.gitBranch,
            config: openCodeConfig,
          });
          sandboxId = sandbox.id;

          if (provider.type === "cloudflare") {
            await SandboxModel.createSandbox({
              id: quickSandboxId,
              userId,
              name: `Task ${taskId.slice(0, 6)}`,
              slug: `task-${taskId.slice(0, 8)}`,
              provider: "cloudflare",
              repoName: `task-${taskId}`,
              opencodeUrl: sandbox.opencodeUrl,
              status: "running",
            });
          }
        }

        const client = await provider.getOpenCodeClient(sandboxId);

        const session = await client.session.create({
          body: { title: `Task ${taskId}` },
        });

        if (!session.data) {
          throw new Error("Failed to create session");
        }

        const response = await client.session.prompt({
          path: { id: session.data.id },
          body: {
            parts: [{ type: "text", text: body.message }],
            model: body.model,
          },
        });

        const parts = response.data?.parts ?? [];
        const textPart = parts.find((p) => p.type === "text") as { text?: string } | undefined;

        log.info("Agent task completed", { taskId, sandboxId });

        return c.json({
          taskId,
          sandboxId,
          sessionId: session.data.id,
          response: textPart?.text ?? "",
          parts: response.data?.parts,
        });
      } catch (error) {
        log.error("Agent task failed", { taskId, error });
        return c.json(
          { error: error instanceof Error ? error.message : "Task execution failed" },
          500
        );
      }
    }
  )

  // ===========================================================================
  // Streaming Task Endpoint (SSE)
  // ===========================================================================
  .post(
    "/task/stream",
    zValidator(
      "json",
      z.object({
        message: z.string().min(1, "Message is required"),
        sandboxId: z.string().optional(),
        provider: z.enum(["docker", "cloudflare"]).optional(),
        model: z
          .object({
            providerID: z.string(),
            modelID: z.string(),
          })
          .optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid("json");
      const taskId = nanoid(12);
      const userId = getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      log.info("Starting streaming agent task", { taskId, userId, provider: body.provider });

      return streamSSE(c, async (stream) => {
        const abortController = new AbortController();

        // Global keepalive interval to prevent Bun's idle timeout (10s default)
        // Runs every 5 seconds throughout the entire streaming session
        const keepaliveInterval = setInterval(async () => {
          if (!abortController.signal.aborted) {
            try {
              await stream.writeSSE({
                event: "message",
                data: JSON.stringify({ type: "keepalive" }),
              });
            } catch {
              // Stream closed, cleanup will happen in finally block
            }
          }
        }, 5000);

        stream.onAbort(() => {
          log.info("Client disconnected from streaming task (onAbort called)", { taskId });
          clearInterval(keepaliveInterval);
          abortController.abort();
        });

        log.info("Stream callback started, signal aborted?", { taskId, aborted: abortController.signal.aborted });

        try {
          await stream.writeSSE({
            event: "message",
            data: JSON.stringify({ type: "start", taskId }),
          });

          let sandboxId = body.sandboxId;
          let sessionId: string;
          let createdNewSandbox = false;
          let isCloudflare = false;
          let openCodeConfig: Record<string, unknown> | undefined;

          if (sandboxId) {
            const manager = getSandboxManager();
            const sandbox = await manager.getSandbox(sandboxId);
            if (!sandbox) {
              await stream.writeSSE({
                event: "message",
                data: JSON.stringify({ type: "error", message: "Sandbox not found" }),
              });
              return;
            }
            isCloudflare = sandbox.provider === "cloudflare";
            
            if (isCloudflare) {
              const [authJson, userConfig] = await Promise.all([
                buildOpenCodeAuthJson(userId),
                getUserOpencodeFullConfig(userId),
              ]);
              const auth = authJson ? JSON.parse(authJson) : null;
              const adaptedUserConfig = userConfig ? {
                settings: userConfig.settings as Record<string, unknown>,
                agents_md: userConfig.agents_md,
                files: userConfig.files,
              } : null;
              openCodeConfig = agentPodToCloudflareConfig(auth, adaptedUserConfig);
            }
            
            if (sandbox.status !== "running") {
              await stream.writeSSE({
                event: "message",
                data: JSON.stringify({ type: "status", message: "Starting sandbox..." }),
              });
              await manager.startSandbox(sandboxId);
            }
          } else {
            const provider = selectProvider({ 
              provider: body.provider, 
              useCase: "quick-task" 
            });
            
            const providerName = provider.type;
            const quickSandboxId = `quick-task-${userId}`;
            
            if (providerName === "cloudflare") {
              const [authJson, userConfig] = await Promise.all([
                buildOpenCodeAuthJson(userId),
                getUserOpencodeFullConfig(userId),
              ]);
              const auth = authJson ? JSON.parse(authJson) : null;
              const adaptedUserConfig = userConfig ? {
                settings: userConfig.settings as Record<string, unknown>,
                agents_md: userConfig.agents_md,
                files: userConfig.files,
              } : null;
              openCodeConfig = agentPodToCloudflareConfig(auth, adaptedUserConfig);
            }

            const existingSandbox = await SandboxModel.getSandboxById(quickSandboxId);
            
            if (existingSandbox) {
              sandboxId = existingSandbox.id;
              isCloudflare = existingSandbox.provider === "cloudflare";
              createdNewSandbox = false;
              
              await stream.writeSSE({
                event: "message",
                data: JSON.stringify({ type: "status", message: "Using existing sandbox..." }),
              });
              
              if (existingSandbox.status !== "running") {
                await stream.writeSSE({
                  event: "message",
                  data: JSON.stringify({ type: "status", message: "Waking up sandbox..." }),
                });
                const manager = getSandboxManager();
                await manager.startSandbox(sandboxId);
              }
            } else {
              await stream.writeSSE({
                event: "message",
                data: JSON.stringify({ 
                  type: "status", 
                  message: `Creating ${providerName} sandbox...` 
                }),
              });

              const sandbox = await provider.createSandbox({
                id: quickSandboxId,
                userId,
                name: "Quick Task",
                config: openCodeConfig,
              });
              sandboxId = sandbox.id;
              createdNewSandbox = true;

              if (providerName === "cloudflare") {
                isCloudflare = true;
                await SandboxModel.createSandbox({
                  id: quickSandboxId,
                  userId,
                  name: "Quick Task",
                  slug: `quick-task-${userId.slice(0, 8)}`,
                  provider: "cloudflare",
                  repoName: `quick-task-${userId}`,
                  opencodeUrl: sandbox.opencodeUrl,
                  status: "running",
                });
              }
            }

            await stream.writeSSE({
              event: "message",
              data: JSON.stringify({ type: "status", message: "Sandbox ready" }),
            });
          }

          await stream.writeSSE({
            event: "message",
            data: JSON.stringify({ type: "status", message: "Initializing AI..." }),
          });

          // For Cloudflare: skip session creation - sessions created via proxy aren't usable by /message calls
          if (!isCloudflare) {
            const session = await opencodeV2.createSession(sandboxId, `Quick Task ${taskId.slice(0, 6)}`);
            sessionId = session.id;
          } else {
            sessionId = "";
          }

          const events = await opencodeV2.subscribeToEvents(sandboxId, abortController.signal);

          let currentText = "";
          let assistantMessageId: string | null = null;
          let isComplete = false;

          log.info("Event subscription ready, starting processor", { 
            taskId, 
            sandboxId,
            eventsType: typeof events,
            eventsIsAsyncIterable: events && typeof (events as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function',
          });

          // Create a promise that resolves when SSE connection is established
          // This is critical for Cloudflare sandboxes where SSE fetch can take 2-3 seconds
          let resolveConnected: () => void = () => {};
          const connectedPromise = new Promise<void>((resolve) => {
            resolveConnected = resolve;
          });

          const eventProcessor = (async () => {
            log.info("Event processor started, entering for-await loop", { taskId });
            try {
              let eventCount = 0;
              for await (const event of events) {
                eventCount++;
                log.info("Event processor received event", { taskId, eventType: event.type, eventCount });
                if (abortController.signal.aborted) break;

                const eventType = event.type;
                const props = event.properties as Record<string, unknown>;

                // Signal that SSE is connected when we receive server.connected
                if (eventType === "server.connected") {
                  log.info("SSE server.connected received, safe to send message", { taskId });
                  resolveConnected();
                }

                if (eventType === "message.part.updated") {
                  const part = props.part as {
                    sessionID?: string;
                    messageID?: string;
                    type?: string;
                    text?: string;
                  } | undefined;

                  if (
                    part?.sessionID === sessionId &&
                    part?.type === "text" &&
                    part?.text !== undefined
                  ) {
                    const newText = part.text;
                    if (newText.length > currentText.length) {
                      const chunk = newText.slice(currentText.length);
                      currentText = newText;

                      await stream.writeSSE({
                        event: "message",
                        data: JSON.stringify({ type: "chunk", content: chunk }),
                      });
                    }
                  }
                }

                if (eventType === "message.updated") {
                  const info = props.info as {
                    sessionID?: string;
                    id?: string;
                    role?: string;
                    finish?: boolean;
                  } | undefined;

                  if (
                    info?.sessionID === sessionId &&
                    info?.role === "assistant" &&
                    info?.finish
                  ) {
                    assistantMessageId = info.id ?? null;
                    isComplete = true;

                    await stream.writeSSE({
                      event: "message",
                      data: JSON.stringify({
                        type: "done",
                        taskId,
                        sandboxId,
                        sessionId,
                        messageId: assistantMessageId,
                        createdNewSandbox,
                      }),
                    });

                    abortController.abort();
                    break;
                  }
                }

                if (eventType === "session.error") {
                  const error = props.error as string | undefined;
                  await stream.writeSSE({
                    event: "message",
                    data: JSON.stringify({ type: "error", message: error ?? "Session error" }),
                  });
                  abortController.abort();
                  break;
                }
              }
              log.info("Event processor: for-await loop exited", { taskId, eventCount });
            } catch (error) {
              if (!abortController.signal.aborted) {
                log.error("Event processing error", { taskId, error });
              } else {
                log.info("Event processor: caught error but signal was aborted", { taskId });
              }
            }
            log.info("Event processor: IIFE completing", { taskId });
          })();

          await stream.writeSSE({
            event: "message",
            data: JSON.stringify({ type: "status", message: "AI is thinking..." }),
          });

          // Wait for SSE connection to be established before sending message
          // This prevents the race condition where message completes before SSE receives events
          log.info("Waiting for SSE connection before sending message", { taskId });
          await Promise.race([
            connectedPromise,
            // Timeout after 10 seconds to prevent hanging if SSE fails to connect
            new Promise<void>((_, reject) => 
              setTimeout(() => reject(new Error("SSE connection timeout")), 10000)
            ),
          ]);

          log.info("Sending message to OpenCode", { taskId, sandboxId, sessionId, message: body.message.slice(0, 100), isCloudflare });
          
          if (isCloudflare) {
            // For Cloudflare: await the response and emit it directly
            // The SSE events from Cloudflare only contain heartbeats, not message content
            try {
              const response = await opencodeV2.sendMessage(sandboxId, sessionId, {
                parts: [{ type: "text", text: body.message }],
                model: body.model,
                opencodeConfig: openCodeConfig,
              });
              
              const actualSessionId = (response.info as { sessionID?: string })?.sessionID || sessionId;
              log.info("Cloudflare message response received", { taskId, sandboxId, sessionId: actualSessionId, partsCount: response.parts?.length });
              
              const textParts = response.parts?.filter(p => p.type === "text") as Array<{ type: "text"; text?: string }> | undefined;
              const fullText = textParts?.map(p => p.text ?? "").join("") ?? "";
              
              if (fullText) {
                await stream.writeSSE({
                  event: "message",
                  data: JSON.stringify({ type: "chunk", content: fullText }),
                });
              }
              
              await stream.writeSSE({
                event: "message",
                data: JSON.stringify({
                  type: "done",
                  taskId,
                  sandboxId,
                  sessionId: actualSessionId,
                  messageId: response.info?.id,
                  createdNewSandbox,
                }),
              });
              
              // Abort the event processor since we've already sent the response
              abortController.abort();
            } catch (error) {
              log.error("Cloudflare send message error", { taskId, sandboxId, sessionId, error: error instanceof Error ? error.message : String(error) });
              await stream.writeSSE({
                event: "message",
                data: JSON.stringify({
                  type: "error",
                  message: error instanceof Error ? error.message : "Failed to send message",
                }),
              });
            }
          } else {
            // For Docker: use existing SSE event-based flow
            opencodeV2.sendMessage(sandboxId, sessionId, {
              parts: [{ type: "text", text: body.message }],
              model: body.model,
            }).then(() => {
              log.info("Message sent successfully", { taskId, sandboxId, sessionId });
            }).catch((error) => {
              log.error("Send message error", { taskId, sandboxId, sessionId, error: error instanceof Error ? error.message : String(error) });
              if (!abortController.signal.aborted) {
                stream.writeSSE({
                  event: "message",
                  data: JSON.stringify({
                    type: "error",
                    message: error instanceof Error ? error.message : "Failed to send message",
                  }),
                });
              }
            });

            await eventProcessor;
          }

          log.info("Streaming task completed", { taskId, sandboxId, sessionId, isComplete });
        } catch (error) {
          log.error("Streaming task failed", { taskId, error });

          if (!abortController.signal.aborted) {
            await stream.writeSSE({
              event: "message",
              data: JSON.stringify({
                type: "error",
                message: error instanceof Error ? error.message : "Task execution failed",
              }),
            });
          }
        } finally {
          clearInterval(keepaliveInterval);
        }
      });
    }
  )

  .get("/task/:id", async (c) => {
    const taskId = c.req.param("id");
    const userId = getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    try {
      const [task] = await db
        .select()
        .from(agentTasks)
        .where(and(eq(agentTasks.id, taskId), eq(agentTasks.userId, userId)))
        .limit(1);

      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      return c.json(task);
    } catch (error) {
      log.error("Failed to get task", { taskId, error });
      return c.json({ error: "Failed to get task" }, 500);
    }
  })

  .get("/tasks", async (c) => {
    const userId = getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
    const offset = parseInt(c.req.query("offset") || "0");

    try {
      const tasks = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.userId, userId))
        .orderBy(desc(agentTasks.createdAt))
        .limit(limit)
        .offset(offset);

      return c.json({ tasks, limit, offset });
    } catch (error) {
      log.error("Failed to list tasks", { userId, error });
      return c.json({ error: "Failed to list tasks" }, 500);
    }
  })

  .get("/templates", async (c) => {
    const userId = getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    try {
      const templates = await db
        .select()
        .from(taskTemplates)
        .where(or(eq(taskTemplates.isSystem, true), eq(taskTemplates.userId, userId)))
        .orderBy(taskTemplates.category, taskTemplates.name);

      return c.json(templates);
    } catch (error) {
      log.error("Failed to list templates", { userId, error });
      return c.json({ error: "Failed to list templates" }, 500);
    }
  })

  .post(
    "/team",
    zValidator(
      "json",
      z.object({
        agents: z.array(
          z.object({
            role: z.string(),
            message: z.string(),
            model: z
              .object({
                providerID: z.string(),
                modelID: z.string(),
              })
              .optional(),
          })
        ),
        gitUrl: z.string().url().optional(),
        gitBranch: z.string().optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid("json");
      const teamId = nanoid(12);
      const userId = getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      log.info("Creating multi-agent team task", { teamId, userId, agentCount: body.agents.length });

      if (!isCloudflareConfigured()) {
        return c.json({ error: "Multi-agent teams require Cloudflare sandboxes" }, 400);
      }

      try {
        const provider = getCloudflareProvider();

        const agentPromises = body.agents.map(async (agent, index) => {
          const sandbox = await provider.createSandbox({
            id: `team-${teamId}-agent-${index}`,
            userId,
            gitUrl: body.gitUrl,
            gitBranch: body.gitBranch,
          });

          const client = await provider.getOpenCodeClient(sandbox.id);

          const session = await client.session.create({
            body: { title: `${agent.role} Agent` },
          });

          if (!session.data) {
            throw new Error(`Failed to create session for ${agent.role}`);
          }

          const response = await client.session.prompt({
            path: { id: session.data.id },
            body: {
              parts: [{ type: "text", text: agent.message }],
              model: agent.model,
            },
          });

          return {
            role: agent.role,
            sandboxId: sandbox.id,
            sessionId: session.data.id,
            response: response.data,
          };
        });

        const results = await Promise.all(agentPromises);

        log.info("Multi-agent team task completed", { teamId, agentCount: results.length });

        return c.json({
          teamId,
          agents: results,
        });
      } catch (error) {
        log.error("Multi-agent team task failed", { teamId, error });
        return c.json(
          { error: error instanceof Error ? error.message : "Team execution failed" },
          500
        );
      }
    }
  )

  .get("/providers", async (c) => {
    const providers = {
      docker: { available: true, description: "Full development environment" },
      cloudflare: {
        available: isCloudflareConfigured(),
        description: "Lightweight, on-demand sandboxes",
      },
    };

    return c.json(providers);
  })

  .post(
    "/sandbox/:id/sync",
    async (c) => {
      const sandboxId = c.req.param("id");
      const userId = getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      const sandbox = await SandboxModel.getSandboxById(sandboxId);
      
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      if (sandbox.userId !== userId) {
        return c.json({ error: "Unauthorized" }, 403);
      }

      if (sandbox.provider !== "cloudflare") {
        return c.json({ error: "Sync only available for Cloudflare sandboxes" }, 400);
      }

      if (!isCloudflareConfigured()) {
        return c.json({ error: "Cloudflare not configured" }, 400);
      }

      try {
        const provider = getCloudflareProvider();
        const result = await provider.syncWorkspace(sandboxId);

        log.info("Workspace synced", { sandboxId, syncedFiles: result.syncedFiles });

        return c.json(result);
      } catch (error) {
        log.error("Sync failed", { sandboxId, error });
        return c.json(
          { error: error instanceof Error ? error.message : "Sync failed" },
          500
        );
      }
    }
  )

  // ===========================================================================
  // Agent Orchestration Endpoints
  // ===========================================================================
  .get("/orchestrator/agents", async (c) => {
    try {
      const agents = agentOrchestratorService.getAgentsList();
      return c.json({ agents });
    } catch (error) {
      log.error("Failed to list orchestrator agents", { error });
      return c.json({ error: "Failed to list agents" }, 500);
    }
  })

  .get("/orchestrator/squads", async (c) => {
    try {
      const squads = agentOrchestratorService.getSquads();
      const squadDetails = squads.map(squad => ({
        name: squad,
        agents: agentOrchestratorService.getAgentsBySquad(squad).map(a => ({
          name: a.name,
          role: a.role,
          emoji: a.emoji,
        })),
      }));
      return c.json({ squads: squadDetails });
    } catch (error) {
      log.error("Failed to list squads", { error });
      return c.json({ error: "Failed to list squads" }, 500);
    }
  })

  .get("/orchestrator/workflows", async (c) => {
    try {
      const workflows = agentOrchestratorService.getWorkflowsList();
      return c.json({ workflows });
    } catch (error) {
      log.error("Failed to list workflows", { error });
      return c.json({ error: "Failed to list workflows" }, 500);
    }
  })

  .get("/orchestrator/agents/:name", async (c) => {
    try {
      const name = c.req.param("name");
      const agent = agentOrchestratorService.getAgent(name);
      
      if (!agent) {
        return c.json({ error: "Agent not found" }, 404);
      }

      return c.json({ 
        agent: {
          name: agent.name,
          role: agent.role,
          emoji: agent.emoji,
          squad: agent.squad,
          tier: agent.tier,
          personality: agent.personality,
          intelligenceLevel: agent.intelligenceLevel,
          relatedAgents: agent.relatedAgents,
          workflows: agent.workflows,
          delegationTriggers: agent.delegationTriggers,
        }
      });
    } catch (error) {
      log.error("Failed to get agent", { error });
      return c.json({ error: "Failed to get agent" }, 500);
    }
  })

  .post(
    "/orchestrator/route",
    zValidator(
      "json",
      z.object({
        message: z.string().min(1).max(10000),
        sandboxId: z.string().optional(),
        context: z.object({
          currentFile: z.string().optional(),
          selectedCode: z.string().optional(),
          recentErrors: z.array(z.string()).optional(),
          sessionHistory: z.array(z.string()).optional(),
        }).optional(),
      })
    ),
    async (c) => {
      try {
        const body = c.req.valid("json");
        const userId = getAuthenticatedUserId(c) || "anonymous";

        const startTime = Date.now();
        const result = await agentOrchestratorService.routeRequest({
          userId,
          sandboxId: body.sandboxId || "",
          message: body.message,
          context: body.context,
        });
        const processingTime = Date.now() - startTime;

        log.info("Routed request via orchestrator", {
          userId,
          routingType: result.decision.type,
          selectedAgent: result.selectedAgent.name,
          processingTime,
        });

        return c.json({
          routing: {
            type: result.decision.type,
            selectedAgent: {
              name: result.selectedAgent.name,
              role: result.selectedAgent.role,
              emoji: result.selectedAgent.emoji,
              squad: result.selectedAgent.squad,
            },
            allAgents: result.decision.agents.map(a => ({
              name: a.name,
              role: a.role,
              emoji: a.emoji,
            })),
            workflow: result.decision.workflow ? {
              id: result.decision.workflow.id,
              name: result.decision.workflow.name,
            } : undefined,
          },
          intent: result.decision.intent,
          reasoning: result.reasoning,
          suggestedFollowUp: result.suggestedFollowUp,
          processingTimeMs: processingTime,
        });
      } catch (error) {
        log.error("Failed to route request", { error });
        return c.json(
          { error: "Failed to route request", details: error instanceof Error ? error.message : "Unknown error" },
          500
        );
      }
    }
  )

  .get("/orchestrator/workflows/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const workflow = agentOrchestratorService.getWorkflow(id);
      
      if (!workflow) {
        return c.json({ error: "Workflow not found" }, 404);
      }

      return c.json({ workflow });
    } catch (error) {
      log.error("Failed to get workflow", { error });
      return c.json({ error: "Failed to get workflow" }, 500);
    }
  });
