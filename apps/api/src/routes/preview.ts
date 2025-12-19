import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../config.ts";
import { createLogger } from "../utils/logger.ts";
import { getSandboxById } from "../models/sandbox.ts";
import {
  listPreviewPortsBySandbox,
  getPreviewPortByPort,
  getPreviewPortByPublicToken,
  createPreviewPort,
  updatePreviewPort,
  deletePreviewPort,
  upsertPreviewPort,
  generatePublicToken,
  revokePublicToken,
  touchPreviewPort,
  type PreviewPort,
} from "../models/preview-port.ts";

const log = createLogger("preview-routes");

const registerPortSchema = z.object({
  port: z.number().int().min(1).max(65535),
  label: z.string().max(255).optional(),
});

const updatePortSchema = z.object({
  label: z.string().max(255).optional(),
});

const sharePortSchema = z.object({
  expiresIn: z.string().regex(/^\d+[hdwm]$/).optional(),
});

function buildPreviewUrl(slug: string, port: number): string {
  const protocol = config.domain.protocol;
  const baseDomain = config.domain.base;
  return `${protocol}://preview-${slug}-${port}.${baseDomain}`;
}

function previewPortToResponse(port: PreviewPort, slug: string) {
  return {
    ...port,
    previewUrl: buildPreviewUrl(slug, port.port),
  };
}

export const previewRoutes = new Hono()
  .get("/detect", async (c) => {
    const sandboxId = c.req.param("id");

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      if (sandbox.status !== "running") {
        return c.json({ error: "Sandbox must be running to detect ports" }, 400);
      }

      const { detectOpenPorts } = await import("../services/preview/detector.ts");
      const detected = await detectOpenPorts(sandboxId);

      return c.json({
        ports: detected,
        count: detected.length,
      });
    } catch (error) {
      log.error("Failed to detect ports", { sandboxId, error });
      return c.json(
        { error: "Failed to detect ports", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .post("/detect", async (c) => {
    const sandboxId = c.req.param("id");

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      if (sandbox.status !== "running") {
        return c.json({ error: "Sandbox must be running to detect ports" }, 400);
      }

      const { detectAndRegisterPorts } = await import("../services/preview/detector.ts");
      const detected = await detectAndRegisterPorts(sandboxId);

      const { onPreviewPortRegistered } = await import("../services/preview/index.ts");
      for (const port of detected) {
        await onPreviewPortRegistered(sandboxId, port.port);
      }

      const ports = await listPreviewPortsBySandbox(sandboxId);
      return c.json({
        ports: ports.map((p) => previewPortToResponse(p, sandbox.slug)),
        detected: detected.length,
      });
    } catch (error) {
      log.error("Failed to detect and register ports", { sandboxId, error });
      return c.json(
        { error: "Failed to detect and register ports", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .get("/", async (c) => {
    const sandboxId = c.req.param("id");

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      const ports = await listPreviewPortsBySandbox(sandboxId);
      return c.json({
        ports: ports.map((p) => previewPortToResponse(p, sandbox.slug)),
        count: ports.length,
      });
    } catch (error) {
      log.error("Failed to list preview ports", { sandboxId, error });
      return c.json(
        { error: "Failed to list preview ports", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .post("/", zValidator("json", registerPortSchema), async (c) => {
    const sandboxId = c.req.param("id");
    const { port, label } = c.req.valid("json");

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      const previewPort = await upsertPreviewPort({
        sandboxId,
        port,
        label,
      });

      const { onPreviewPortRegistered } = await import("../services/preview/index.ts");
      await onPreviewPortRegistered(sandboxId, port);

      log.info("Registered preview port", { sandboxId, port });
      return c.json(previewPortToResponse(previewPort, sandbox.slug), 201);
    } catch (error) {
      log.error("Failed to register preview port", { sandboxId, port, error });
      return c.json(
        { error: "Failed to register preview port", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .get("/:port", async (c) => {
    const sandboxId = c.req.param("id");
    const port = parseInt(c.req.param("port"), 10);

    if (isNaN(port)) {
      return c.json({ error: "Invalid port number" }, 400);
    }

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      const previewPort = await getPreviewPortByPort(sandboxId, port);
      if (!previewPort) {
        return c.json({ error: "Preview port not found" }, 404);
      }

      await touchPreviewPort(sandboxId, port);
      return c.json(previewPortToResponse(previewPort, sandbox.slug));
    } catch (error) {
      log.error("Failed to get preview port", { sandboxId, port, error });
      return c.json(
        { error: "Failed to get preview port", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .put("/:port", zValidator("json", updatePortSchema), async (c) => {
    const sandboxId = c.req.param("id");
    const port = parseInt(c.req.param("port"), 10);
    const { label } = c.req.valid("json");

    if (isNaN(port)) {
      return c.json({ error: "Invalid port number" }, 400);
    }

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      const previewPort = await updatePreviewPort(sandboxId, port, { label });
      if (!previewPort) {
        return c.json({ error: "Preview port not found" }, 404);
      }

      return c.json(previewPortToResponse(previewPort, sandbox.slug));
    } catch (error) {
      log.error("Failed to update preview port", { sandboxId, port, error });
      return c.json(
        { error: "Failed to update preview port", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .delete("/:port", async (c) => {
    const sandboxId = c.req.param("id");
    const port = parseInt(c.req.param("port"), 10);

    if (isNaN(port)) {
      return c.json({ error: "Invalid port number" }, 400);
    }

    try {
      const deleted = await deletePreviewPort(sandboxId, port);
      if (!deleted) {
        return c.json({ error: "Preview port not found" }, 404);
      }

      const { onPreviewPortDeleted } = await import("../services/preview/index.ts");
      await onPreviewPortDeleted(sandboxId, port);

      return c.json({ success: true, message: "Preview port deleted" });
    } catch (error) {
      log.error("Failed to delete preview port", { sandboxId, port, error });
      return c.json(
        { error: "Failed to delete preview port", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .get("/:port/url", async (c) => {
    const sandboxId = c.req.param("id");
    const port = parseInt(c.req.param("port"), 10);

    if (isNaN(port)) {
      return c.json({ error: "Invalid port number" }, 400);
    }

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      const previewPort = await getPreviewPortByPort(sandboxId, port);
      if (!previewPort) {
        return c.json({ error: "Preview port not found" }, 404);
      }

      await touchPreviewPort(sandboxId, port);
      return c.json({
        url: buildPreviewUrl(sandbox.slug, port),
        port: previewPort.port,
        label: previewPort.label,
      });
    } catch (error) {
      log.error("Failed to get preview URL", { sandboxId, port, error });
      return c.json(
        { error: "Failed to get preview URL", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .post("/:port/share", zValidator("json", sharePortSchema), async (c) => {
    const sandboxId = c.req.param("id");
    const port = parseInt(c.req.param("port"), 10);
    const { expiresIn } = c.req.valid("json");

    if (isNaN(port)) {
      return c.json({ error: "Invalid port number" }, 400);
    }

    try {
      const sandbox = await getSandboxById(sandboxId);
      if (!sandbox) {
        return c.json({ error: "Sandbox not found" }, 404);
      }

      const previewPort = await getPreviewPortByPort(sandboxId, port);
      if (!previewPort) {
        return c.json({ error: "Preview port not found" }, 404);
      }

      const { token, expiresAt } = await generatePublicToken(sandboxId, port, expiresIn ?? "24h");
      const publicUrl = `${config.publicUrl}/p/${token}`;

      return c.json({
        url: publicUrl,
        token,
        expiresAt,
      });
    } catch (error) {
      log.error("Failed to generate share link", { sandboxId, port, error });
      return c.json(
        { error: "Failed to generate share link", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  })

  .delete("/:port/share", async (c) => {
    const sandboxId = c.req.param("id");
    const port = parseInt(c.req.param("port"), 10);

    if (isNaN(port)) {
      return c.json({ error: "Invalid port number" }, 400);
    }

    try {
      await revokePublicToken(sandboxId, port);
      return c.json({ success: true, message: "Public access revoked" });
    } catch (error) {
      log.error("Failed to revoke share link", { sandboxId, port, error });
      return c.json(
        { error: "Failed to revoke share link", details: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

export const publicPreviewRoutes = new Hono()
  .get("/:token", async (c) => {
    const token = c.req.param("token");

    try {
      const previewPort = await getPreviewPortByPublicToken(token);
      if (!previewPort || !previewPort.isPublic) {
        return c.text("Preview not found or expired", 404);
      }

      if (previewPort.publicExpiresAt && new Date() > previewPort.publicExpiresAt) {
        return c.text("Preview link expired", 410);
      }

      const sandbox = await getSandboxById(previewPort.sandboxId);
      if (!sandbox) {
        return c.text("Sandbox not found", 404);
      }

      const previewUrl = buildPreviewUrl(sandbox.slug, previewPort.port);
      return c.redirect(previewUrl);
    } catch (error) {
      log.error("Failed to access public preview", { token, error });
      return c.text("Internal server error", 500);
    }
  });
