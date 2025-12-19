import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getCloudflareProvider, isCloudflareConfigured, selectProvider } from "../services/providers";
import { createLogger } from "../utils/logger";

const log = createLogger("agents-routes");

export const agentRoutes = new Hono()
  .post(
    "/task",
    zValidator(
      "json",
      z.object({
        userId: z.string(),
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

      log.info("Creating agent task", { taskId, userId: body.userId, provider: body.provider });

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
          const sandbox = await provider.createSandbox({
            id: `task-${taskId}`,
            userId: body.userId,
            gitUrl: body.gitUrl,
            gitBranch: body.gitBranch,
          });
          sandboxId = sandbox.id;
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

  .get("/task/:id", async (c) => {
    const taskId = c.req.param("id");
    return c.json({ taskId, status: "not_implemented", message: "Task status tracking coming soon" });
  })

  .post(
    "/team",
    zValidator(
      "json",
      z.object({
        userId: z.string(),
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

      log.info("Creating multi-agent team task", { teamId, agentCount: body.agents.length });

      if (!isCloudflareConfigured()) {
        return c.json({ error: "Multi-agent teams require Cloudflare sandboxes" }, 400);
      }

      try {
        const provider = getCloudflareProvider();

        const agentPromises = body.agents.map(async (agent, index) => {
          const sandbox = await provider.createSandbox({
            id: `team-${teamId}-agent-${index}`,
            userId: body.userId,
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
  });
