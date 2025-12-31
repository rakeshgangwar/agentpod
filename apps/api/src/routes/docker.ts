/**
 * Docker Image Management API Routes
 * Endpoints for checking image availability and pulling images
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getSandboxManager } from "../services/sandbox-manager.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("docker-routes");

export const dockerRouter = new Hono();

// =============================================================================
// GET /docker/images/flavors
// =============================================================================
// Get availability status of all flavor images
dockerRouter.get("/images/flavors", async (c) => {
  log.info("Checking flavor image availability");

  try {
    const manager = getSandboxManager();
    const availability = await manager.checkFlavorImageAvailability();

    return c.json({
      success: true,
      images: availability,
    });
  } catch (error) {
    log.error("Failed to check flavor image availability", { error });
    return c.json(
      {
        success: false,
        error: "Failed to check image availability",
      },
      500
    );
  }
});

// =============================================================================
// GET /docker/images/:imageName
// =============================================================================
// Check if a specific image exists
dockerRouter.get("/images/:imageName{.+}", async (c) => {
  const imageName = c.req.param("imageName");
  log.info("Checking image existence", { imageName });

  try {
    const manager = getSandboxManager();
    const imageInfo = await manager.getImageInfo(imageName);

    if (imageInfo) {
      return c.json({
        exists: true,
        image: {
          name: imageInfo.name,
          id: imageInfo.id,
          size: imageInfo.size,
          created: imageInfo.created,
        },
      });
    } else {
      return c.json({
        exists: false,
        imageName,
      });
    }
  } catch (error) {
    log.error("Failed to check image", { imageName, error });
    return c.json(
      {
        exists: false,
        error: "Failed to check image",
      },
      500
    );
  }
});

// =============================================================================
// POST /docker/images/pull
// =============================================================================
// Pull an image with SSE progress streaming
dockerRouter.post("/images/pull", async (c) => {
  const body = await c.req.json<{ imageName?: string; flavorId?: string }>();
  const { imageName, flavorId } = body;

  if (!imageName && !flavorId) {
    return c.json(
      {
        success: false,
        error: "Either imageName or flavorId is required",
      },
      400
    );
  }

  const manager = getSandboxManager();
  const targetImage = imageName || manager.getFlavorImageName(flavorId!);

  log.info("Starting image pull", { targetImage, flavorId });

  // Use SSE for streaming progress
  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({
        event: "start",
        data: JSON.stringify({ imageName: targetImage, status: "starting" }),
      });

      await manager.pullImage(targetImage, async (progress) => {
        await stream.writeSSE({
          event: "progress",
          data: JSON.stringify({
            status: progress.status,
            progress: progress.progress,
            id: progress.id,
          }),
        });
      });

      await stream.writeSSE({
        event: "complete",
        data: JSON.stringify({
          success: true,
          imageName: targetImage,
        }),
      });

      log.info("Image pull completed", { targetImage });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      log.error("Image pull failed", { targetImage, error: errorMessage });

      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          success: false,
          error: errorMessage,
          imageName: targetImage,
        }),
      });
    }
  });
});

// =============================================================================
// POST /docker/images/pull/sync
// =============================================================================
// Pull an image synchronously (without streaming) - simpler for some use cases
dockerRouter.post("/images/pull/sync", async (c) => {
  const body = await c.req.json<{ imageName?: string; flavorId?: string }>();
  const { imageName, flavorId } = body;

  if (!imageName && !flavorId) {
    return c.json(
      {
        success: false,
        error: "Either imageName or flavorId is required",
      },
      400
    );
  }

  const manager = getSandboxManager();
  const targetImage = imageName || manager.getFlavorImageName(flavorId!);

  log.info("Starting synchronous image pull", { targetImage, flavorId });

  try {
    await manager.pullImage(targetImage);

    // Get image info after pull
    const imageInfo = await manager.getImageInfo(targetImage);

    log.info("Synchronous image pull completed", { targetImage });

    return c.json({
      success: true,
      imageName: targetImage,
      image: imageInfo
        ? {
            id: imageInfo.id,
            size: imageInfo.size,
            created: imageInfo.created,
          }
        : null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Synchronous image pull failed", { targetImage, error: errorMessage });

    return c.json(
      {
        success: false,
        error: errorMessage,
        imageName: targetImage,
      },
      500
    );
  }
});

// =============================================================================
// GET /docker/info
// =============================================================================
// Get Docker daemon information
dockerRouter.get("/info", async (c) => {
  log.info("Getting Docker info");

  try {
    const manager = getSandboxManager();
    const info = await manager.getDockerInfo();

    return c.json({
      success: true,
      info,
    });
  } catch (error) {
    log.error("Failed to get Docker info", { error });
    return c.json(
      {
        success: false,
        error: "Failed to get Docker info",
      },
      500
    );
  }
});

// =============================================================================
// GET /docker/health
// =============================================================================
// Check Docker daemon health
dockerRouter.get("/health", async (c) => {
  try {
    const manager = getSandboxManager();
    const healthy = await manager.healthCheck();

    return c.json({
      healthy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      healthy: false,
      error: "Docker health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});
