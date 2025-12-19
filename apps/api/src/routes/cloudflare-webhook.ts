import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createLogger } from "../utils/logger";
import { db } from "../db/drizzle";
import { cloudflareSandboxes } from "../db/schema/cloudflare";
import { eq } from "drizzle-orm";

const log = createLogger("cloudflare-webhook");

const webhookPayloadSchema = z.object({
  event: z.enum([
    "sandbox.created",
    "sandbox.started",
    "sandbox.stopped",
    "sandbox.hibernated",
    "sandbox.woken",
    "sandbox.deleted",
    "sandbox.error",
    "session.created",
    "session.message",
    "workspace.synced",
  ]),
  data: z.object({
    sandboxId: z.string(),
    userId: z.string().optional(),
    provider: z.string().optional(),
    sessionId: z.string().optional(),
    error: z.string().optional(),
  }),
  timestamp: z.string(),
});

export const cloudflareWebhookRoutes = new Hono()
  .post(
    "/webhook",
    zValidator("json", webhookPayloadSchema),
    async (c) => {
      const body = c.req.valid("json");

      log.info("Received Cloudflare webhook", { event: body.event, sandboxId: body.data.sandboxId });

      try {
        switch (body.event) {
          case "sandbox.created":
            await handleSandboxCreated(body.data);
            break;

          case "sandbox.hibernated":
            await handleSandboxHibernated(body.data);
            break;

          case "sandbox.woken":
            await handleSandboxWoken(body.data);
            break;

          case "sandbox.deleted":
            await handleSandboxDeleted(body.data);
            break;

          case "sandbox.error":
            await handleSandboxError(body.data);
            break;

          case "session.message":
            await handleSessionMessage(body.data);
            break;

          case "workspace.synced":
            await handleWorkspaceSynced(body.data);
            break;

          default:
            log.debug("Unhandled webhook event", { event: body.event });
        }

        return c.json({ received: true });
      } catch (error) {
        log.error("Webhook processing failed", { event: body.event, error });
        return c.json({ error: "Webhook processing failed" }, 500);
      }
    }
  );

async function handleSandboxCreated(data: { sandboxId: string; userId?: string }) {
  if (!data.userId) {
    log.warn("sandbox.created missing userId", { sandboxId: data.sandboxId });
    return;
  }

  const existing = await db
    .select()
    .from(cloudflareSandboxes)
    .where(eq(cloudflareSandboxes.id, data.sandboxId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(cloudflareSandboxes).values({
      id: data.sandboxId,
      userId: data.userId,
      status: "running",
      workerUrl: "",
      lastActiveAt: new Date(),
    });
    log.info("Created cloudflare sandbox record", { sandboxId: data.sandboxId });
  } else {
    await db
      .update(cloudflareSandboxes)
      .set({
        status: "running",
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cloudflareSandboxes.id, data.sandboxId));
  }
}

async function handleSandboxHibernated(data: { sandboxId: string }) {
  await db
    .update(cloudflareSandboxes)
    .set({
      status: "sleeping",
      updatedAt: new Date(),
    })
    .where(eq(cloudflareSandboxes.id, data.sandboxId));

  log.info("Sandbox hibernated", { sandboxId: data.sandboxId });
}

async function handleSandboxWoken(data: { sandboxId: string }) {
  await db
    .update(cloudflareSandboxes)
    .set({
      status: "running",
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(cloudflareSandboxes.id, data.sandboxId));

  log.info("Sandbox woken", { sandboxId: data.sandboxId });
}

async function handleSandboxDeleted(data: { sandboxId: string }) {
  await db.delete(cloudflareSandboxes).where(eq(cloudflareSandboxes.id, data.sandboxId));

  log.info("Sandbox deleted", { sandboxId: data.sandboxId });
}

async function handleSandboxError(data: { sandboxId: string; error?: string }) {
  await db
    .update(cloudflareSandboxes)
    .set({
      status: "error",
      updatedAt: new Date(),
      metadata: data.error ? { lastError: data.error } : undefined,
    })
    .where(eq(cloudflareSandboxes.id, data.sandboxId));

  log.error("Sandbox error", { sandboxId: data.sandboxId, error: data.error });
}

async function handleSessionMessage(data: { sandboxId: string; sessionId?: string }) {
  await db
    .update(cloudflareSandboxes)
    .set({
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(cloudflareSandboxes.id, data.sandboxId));

  log.debug("Session message received", { sandboxId: data.sandboxId, sessionId: data.sessionId });
}

async function handleWorkspaceSynced(data: { sandboxId: string }) {
  await db
    .update(cloudflareSandboxes)
    .set({
      workspaceSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(cloudflareSandboxes.id, data.sandboxId));

  log.info("Workspace synced", { sandboxId: data.sandboxId });
}
