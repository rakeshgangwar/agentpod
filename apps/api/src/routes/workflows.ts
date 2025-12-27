import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../db/drizzle.ts";
import { workflows, workflowExecutions } from "../db/schema/workflows.ts";
import { eq, and, desc } from "drizzle-orm";
import { validateWorkflow } from "../utils/workflow-validation.ts";
import { createLogger } from "../utils/logger.ts";
import { getCloudflareProvider, isCloudflareConfigured } from "../services/providers/cloudflare-provider.ts";

const log = createLogger("workflow-routes");

const nodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()).optional().default({}),
  disabled: z.boolean().optional(),
});

const connectionSchema = z.record(
  z.object({
    main: z.array(
      z.array(
        z.object({
          node: z.string(),
          type: z.string(),
          index: z.number(),
          label: z.string().optional(),
        })
      )
    ),
  })
);

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  nodes: z.array(nodeSchema).min(1),
  connections: connectionSchema.optional().default({}),
  settings: z.record(z.unknown()).optional(),
  isPublic: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  nodes: z.array(nodeSchema).optional(),
  connections: connectionSchema.optional(),
  settings: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const listWorkflowsSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  active: z.coerce.boolean().optional(),
});

const executeWorkflowSchema = z.object({
  triggerData: z.record(z.unknown()).optional(),
});

const executionStatusUpdateSchema = z.object({
  executionId: z.string(),
  workflowId: z.string(),
  status: z.enum(["running", "waiting", "completed", "errored"]),
  currentStep: z.string().nullish(),
  completedSteps: z.array(z.string()),
  result: z.record(z.unknown()).optional(),
  error: z.string().nullish(),
  durationMs: z.number().optional(),
});

const duplicateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

function getUserId(c: { get: (key: string) => { id: string } | undefined }): string {
  const user = c.get("user");
  return user?.id || "test-user-id";
}

export const workflowRoutes = new Hono()
  .post("/", zValidator("json", createWorkflowSchema), async (c) => {
    const body = c.req.valid("json");
    const userId = getUserId(c);

    const validation = validateWorkflow(body.name, body.nodes as never[], body.connections as never);
    if (!validation.valid) {
      return c.json({ error: "Invalid workflow", errors: validation.errors }, 400);
    }

    const existing = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.userId, userId), eq(workflows.name, body.name)))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: "Workflow with this name already exists" }, 409);
    }

    const id = nanoid(12);
    const now = new Date();

    const [workflow] = await db
      .insert(workflows)
      .values({
        id,
        userId,
        name: body.name,
        description: body.description,
        nodes: body.nodes,
        connections: body.connections,
        settings: body.settings,
        isPublic: body.isPublic,
        tags: body.tags,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!workflow) {
      return c.json({ error: "Failed to create workflow" }, 500);
    }

    log.info("Created workflow", { id: workflow.id, name: workflow.name, userId });

    return c.json({ workflow }, 201);
  })

  .get("/", zValidator("query", listWorkflowsSchema), async (c) => {
    const { page, limit, active } = c.req.valid("query");
    const userId = getUserId(c);
    const offset = (page - 1) * limit;

    let query = db.select().from(workflows).where(eq(workflows.userId, userId));

    if (active !== undefined) {
      query = db
        .select()
        .from(workflows)
        .where(and(eq(workflows.userId, userId), eq(workflows.active, active)));
    }

    const all = await query.orderBy(desc(workflows.updatedAt));
    const paginated = all.slice(offset, offset + limit);

    return c.json({
      workflows: paginated,
      total: all.length,
      page,
      limit,
    });
  })

  .get("/executions/:executionId", async (c) => {
    const { executionId } = c.req.param();
    const userId = getUserId(c);

    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(and(eq(workflowExecutions.id, executionId), eq(workflowExecutions.userId, userId)))
      .limit(1);

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    return c.json({ execution });
  })

  .get("/:id", async (c) => {
    const { id } = c.req.param();
    const userId = getUserId(c);

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .limit(1);

    if (!workflow) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    return c.json({ workflow });
  })

  .patch("/:id", zValidator("json", updateWorkflowSchema), async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const userId = getUserId(c);

    const [existing] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      version: existing.version + 1,
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.nodes !== undefined) updateData.nodes = body.nodes;
    if (body.connections !== undefined) updateData.connections = body.connections;
    if (body.settings !== undefined) updateData.settings = body.settings;
    if (body.active !== undefined) updateData.active = body.active;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const [workflow] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, id))
      .returning();

    if (!workflow) {
      return c.json({ error: "Failed to update workflow" }, 500);
    }

    log.info("Updated workflow", { id: workflow.id, name: workflow.name });

    return c.json({ workflow });
  })

  .delete("/:id", async (c) => {
    const { id } = c.req.param();
    const userId = getUserId(c);

    const [existing] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    await db.delete(workflows).where(eq(workflows.id, id));

    log.info("Deleted workflow", { id, name: existing.name });

    return c.json({ success: true });
  })

  .post("/:id/execute", zValidator("json", executeWorkflowSchema), async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const userId = getUserId(c);

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .limit(1);

    if (!workflow) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    const executionId = nanoid(12);
    const instanceId = nanoid(16);
    const now = new Date();

    const [execution] = await db
      .insert(workflowExecutions)
      .values({
        id: executionId,
        workflowId: id,
        userId,
        instanceId,
        status: "queued",
        triggerType: "manual",
        triggerData: body.triggerData,
        startedAt: now,
      })
      .returning();

    await db
      .update(workflows)
      .set({
        executionCount: workflow.executionCount + 1,
        lastExecutedAt: now,
      })
      .where(eq(workflows.id, id));

    log.info("Queued workflow execution", { workflowId: id, executionId });

    if (isCloudflareConfigured()) {
      const provider = getCloudflareProvider();
      
      provider.executeWorkflow({
        executionId,
        workflowId: id,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          nodes: workflow.nodes as Array<{
            id: string;
            name: string;
            type: string;
            position: [number, number];
            parameters: Record<string, unknown>;
            disabled?: boolean;
          }>,
          connections: workflow.connections as Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>,
          settings: workflow.settings as Record<string, unknown> | undefined,
        },
        triggerType: "manual",
        triggerData: body.triggerData,
        userId,
      }).then(async (result) => {
        log.info("Workflow execution queued in Cloudflare", { 
          executionId, 
          instanceId: result.instanceId,
          status: result.status,
        });
        
        await db
          .update(workflowExecutions)
          .set({
            status: "running",
            instanceId: result.instanceId,
          })
          .where(eq(workflowExecutions.id, executionId));
      }).catch(async (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        log.error("Workflow execution failed to start", { 
          executionId, 
          errorMessage,
          errorStack,
        });
        
        await db
          .update(workflowExecutions)
          .set({
            status: "errored",
            error: errorMessage,
            completedAt: new Date(),
          })
          .where(eq(workflowExecutions.id, executionId));
      });
    }

    return c.json({ execution }, 202);
  })

  .get("/:id/executions", async (c) => {
    const { id } = c.req.param();
    const userId = getUserId(c);

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .limit(1);

    if (!workflow) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    const executions = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, id))
      .orderBy(desc(workflowExecutions.startedAt));

    return c.json({
      executions,
      total: executions.length,
    });
  })

  .post("/:id/validate", async (c) => {
    const { id } = c.req.param();
    const userId = getUserId(c);

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .limit(1);

    if (!workflow) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    const result = validateWorkflow(
      workflow.name,
      workflow.nodes as never[],
      workflow.connections as never
    );

    return c.json(result);
  })

  .post("/:id/duplicate", zValidator("json", duplicateWorkflowSchema), async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const userId = getUserId(c);

    const [original] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .limit(1);

    if (!original) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    const newName = body.name || `${original.name} (Copy)`;
    const newId = nanoid(12);
    const now = new Date();

    const [workflow] = await db
      .insert(workflows)
      .values({
        id: newId,
        userId,
        name: newName,
        description: original.description,
        nodes: original.nodes,
        connections: original.connections,
        settings: original.settings,
        isPublic: false,
        tags: original.tags,
        forkedFromId: id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!workflow) {
      return c.json({ error: "Failed to duplicate workflow" }, 500);
    }

    await db
      .update(workflows)
      .set({ forkCount: (original.forkCount || 0) + 1 })
      .where(eq(workflows.id, id));

    log.info("Duplicated workflow", { originalId: id, newId: workflow.id });

    return c.json({ workflow }, 201);
  });

export const workflowExecutionRoutes = new Hono()
  .patch("/:executionId/status", zValidator("json", executionStatusUpdateSchema), async (c) => {
    const { executionId } = c.req.param();
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, executionId))
      .limit(1);

    if (!existing) {
      log.warn("Execution status update for non-existent execution", { executionId });
      return c.json({ error: "Execution not found" }, 404);
    }

    const updateData: Record<string, unknown> = {
      status: body.status,
      currentStep: body.currentStep,
      completedSteps: body.completedSteps,
    };

    if (body.result !== undefined) {
      updateData.result = body.result;
    }

    if (body.error !== undefined) {
      updateData.error = body.error;
    }

    if (body.durationMs !== undefined) {
      updateData.durationMs = body.durationMs;
    }

    if (body.status === "completed" || body.status === "errored") {
      updateData.completedAt = new Date();
    }

    await db
      .update(workflowExecutions)
      .set(updateData)
      .where(eq(workflowExecutions.id, executionId));

    log.info("Execution status updated", { 
      executionId, 
      status: body.status, 
      currentStep: body.currentStep,
      completedSteps: body.completedSteps?.length || 0,
    });

    return c.json({ success: true });
  })

  .get("/:executionId/poll", async (c) => {
    const { executionId } = c.req.param();
    const userId = getUserId(c);

    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(and(eq(workflowExecutions.id, executionId), eq(workflowExecutions.userId, userId)))
      .limit(1);

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    if (!isCloudflareConfigured()) {
      return c.json({ 
        execution,
        cloudflareStatus: null,
        message: "Cloudflare not configured",
      });
    }

    try {
      const provider = getCloudflareProvider();
      const cloudflareStatus = await provider.getWorkflowStatus(executionId);
      
      const statusMap: Record<string, typeof execution.status> = {
        queued: "queued",
        running: "running",
        paused: "waiting",
        complete: "completed",
        errored: "errored",
        terminated: "cancelled",
      };

      const mappedStatus = statusMap[cloudflareStatus.status] ?? execution.status;
      const isTerminal = ["complete", "errored", "terminated"].includes(cloudflareStatus.status);

      if (mappedStatus !== execution.status || isTerminal) {
        const updateData: Record<string, unknown> = {
          status: mappedStatus,
        };

        if (cloudflareStatus.output) {
          const output = cloudflareStatus.output as { steps?: Record<string, unknown> };
          log.info("Cloudflare output received", {
            executionId,
            outputKeys: Object.keys(output),
            hasSteps: !!output.steps,
            stepsKeys: output.steps ? Object.keys(output.steps) : [],
            rawOutput: JSON.stringify(output).slice(0, 500),
          });
          updateData.result = output.steps ?? cloudflareStatus.output;
        }

        if (cloudflareStatus.error) {
          updateData.error = cloudflareStatus.error;
        }

        if (isTerminal) {
          updateData.completedAt = new Date();
          if (execution.startedAt) {
            updateData.durationMs = Date.now() - new Date(execution.startedAt).getTime();
          }
        }

        await db
          .update(workflowExecutions)
          .set(updateData)
          .where(eq(workflowExecutions.id, executionId));

        const [updated] = await db
          .select()
          .from(workflowExecutions)
          .where(eq(workflowExecutions.id, executionId))
          .limit(1);

        return c.json({ 
          execution: updated,
          cloudflareStatus,
        });
      }

      return c.json({ 
        execution,
        cloudflareStatus,
      });
    } catch (error) {
      log.error("Failed to poll Cloudflare workflow status", { 
        executionId, 
        error: error instanceof Error ? error.message : String(error),
      });
      
      return c.json({ 
        execution,
        cloudflareStatus: null,
        error: error instanceof Error ? error.message : "Failed to poll status",
      });
    }
  })

  .post("/:executionId/pause", async (c) => {
    const { executionId } = c.req.param();
    const userId = getUserId(c);

    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(and(eq(workflowExecutions.id, executionId), eq(workflowExecutions.userId, userId)))
      .limit(1);

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    if (execution.status !== "running") {
      return c.json({ error: "Can only pause running executions" }, 400);
    }

    if (!isCloudflareConfigured()) {
      return c.json({ error: "Cloudflare not configured" }, 503);
    }

    try {
      const provider = getCloudflareProvider();
      await provider.pauseWorkflow(executionId);

      await db
        .update(workflowExecutions)
        .set({ status: "waiting" })
        .where(eq(workflowExecutions.id, executionId));

      log.info("Workflow execution paused", { executionId });

      return c.json({ success: true, status: "waiting" });
    } catch (error) {
      log.error("Failed to pause workflow", { 
        executionId, 
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Failed to pause workflow" }, 500);
    }
  })

  .post("/:executionId/resume", async (c) => {
    const { executionId } = c.req.param();
    const userId = getUserId(c);

    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(and(eq(workflowExecutions.id, executionId), eq(workflowExecutions.userId, userId)))
      .limit(1);

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    if (execution.status !== "waiting") {
      return c.json({ error: "Can only resume paused executions" }, 400);
    }

    if (!isCloudflareConfigured()) {
      return c.json({ error: "Cloudflare not configured" }, 503);
    }

    try {
      const provider = getCloudflareProvider();
      await provider.resumeWorkflow(executionId);

      await db
        .update(workflowExecutions)
        .set({ status: "running" })
        .where(eq(workflowExecutions.id, executionId));

      log.info("Workflow execution resumed", { executionId });

      return c.json({ success: true, status: "running" });
    } catch (error) {
      log.error("Failed to resume workflow", { 
        executionId, 
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Failed to resume workflow" }, 500);
    }
  })

  .post("/:executionId/terminate", async (c) => {
    const { executionId } = c.req.param();
    const userId = getUserId(c);

    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(and(eq(workflowExecutions.id, executionId), eq(workflowExecutions.userId, userId)))
      .limit(1);

    if (!execution) {
      return c.json({ error: "Execution not found" }, 404);
    }

    if (execution.status === "completed" || execution.status === "errored" || execution.status === "cancelled") {
      return c.json({ error: "Execution already terminated" }, 400);
    }

    if (!isCloudflareConfigured()) {
      return c.json({ error: "Cloudflare not configured" }, 503);
    }

    try {
      const provider = getCloudflareProvider();
      await provider.terminateWorkflow(executionId);

      await db
        .update(workflowExecutions)
        .set({ 
          status: "cancelled",
          completedAt: new Date(),
          durationMs: execution.startedAt ? Date.now() - new Date(execution.startedAt).getTime() : undefined,
        })
        .where(eq(workflowExecutions.id, executionId));

      log.info("Workflow execution terminated", { executionId });

      return c.json({ success: true, status: "cancelled" });
    } catch (error) {
      log.error("Failed to terminate workflow", { 
        executionId, 
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json({ error: "Failed to terminate workflow" }, 500);
    }
  });
