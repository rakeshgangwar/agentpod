/**
 * Onboarding Service
 *
 * Manages onboarding sessions for sandboxes.
 * Tracks progress through the onboarding flow.
 */

import { db } from "../db/drizzle";
import { onboardingSessions } from "../db/schema/onboarding";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createLogger } from "../utils/logger";
import type {
  OnboardingSession,
  OnboardingStatus,
  OnboardingRequirements,
  GeneratedConfig,
  CreateOnboardingSession,
  UpdateOnboardingSession,
} from "@agentpod/types";

const log = createLogger("onboarding-service");

// =============================================================================
// Onboarding Service Class
// =============================================================================

export class OnboardingService {
  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Get onboarding session by ID.
   */
  async getById(id: string): Promise<OnboardingSession | null> {
    const results = await db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.id, id))
      .limit(1);

    const row = results[0];
    if (!row) {
      return null;
    }
    return this.rowToSession(row);
  }

  /**
   * Get onboarding session for a specific sandbox.
   */
  async getBySandboxId(sandboxId: string): Promise<OnboardingSession | null> {
    const results = await db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.sandboxId, sandboxId))
      .limit(1);

    const row = results[0];
    if (!row) {
      return null;
    }
    return this.rowToSession(row);
  }

  /**
   * Get all onboarding sessions for a user.
   */
  async getByUserId(userId: string): Promise<OnboardingSession[]> {
    const results = await db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.userId, userId))
      .orderBy(desc(onboardingSessions.createdAt));

    return results.map((row) => this.rowToSession(row));
  }

  /**
   * Get active (non-completed) onboarding sessions for a user.
   */
  async getActiveByUserId(userId: string): Promise<OnboardingSession[]> {
    const results = await db
      .select()
      .from(onboardingSessions)
      .where(
        and(
          eq(onboardingSessions.userId, userId),
          // Not completed or skipped or failed
          eq(onboardingSessions.status, "started")
        )
      )
      .orderBy(desc(onboardingSessions.createdAt));

    return results.map((row) => this.rowToSession(row));
  }

  /**
   * Create a new onboarding session.
   */
  async create(data: CreateOnboardingSession): Promise<OnboardingSession> {
    const id = nanoid();
    const now = new Date();

    // Check if sandbox already has an onboarding session
    if (data.sandboxId) {
      const existing = await this.getBySandboxId(data.sandboxId);
      if (existing) {
        log.warn("Sandbox already has onboarding session", {
          sandboxId: data.sandboxId,
          existingId: existing.id,
        });
        return existing;
      }
    }

    const results = await db
      .insert(onboardingSessions)
      .values({
        id,
        userId: data.userId,
        sandboxId: data.sandboxId || null,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const result = results[0];
    if (!result) {
      throw new Error("Failed to create onboarding session");
    }

    log.info("Created onboarding session", {
      id,
      userId: data.userId,
      sandboxId: data.sandboxId,
    });

    return this.rowToSession(result);
  }

  /**
   * Update an existing onboarding session.
   */
  async update(
    id: string,
    data: UpdateOnboardingSession
  ): Promise<OnboardingSession | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.status !== undefined) {
      updateData.status = data.status;
      // Set completedAt when status becomes completed
      if (data.status === "completed") {
        updateData.completedAt = new Date();
      }
    }
    if (data.projectType !== undefined) updateData.projectType = data.projectType;
    if (data.projectName !== undefined) updateData.projectName = data.projectName;
    if (data.projectDescription !== undefined) {
      updateData.projectDescription = data.projectDescription;
    }
    if (data.gatheredRequirements !== undefined) {
      updateData.gatheredRequirements = JSON.stringify(data.gatheredRequirements);
    }
    if (data.generatedConfig !== undefined) {
      updateData.generatedConfig = JSON.stringify(data.generatedConfig);
    }
    if (data.selectedModel !== undefined) {
      updateData.selectedModel = data.selectedModel;
    }
    if (data.selectedSmallModel !== undefined) {
      updateData.selectedSmallModel = data.selectedSmallModel;
    }
    if (data.errorMessage !== undefined) {
      updateData.errorMessage = data.errorMessage;
    }

    const results = await db
      .update(onboardingSessions)
      .set(updateData)
      .where(eq(onboardingSessions.id, id))
      .returning();

    const result = results[0];
    if (!result) {
      return null;
    }

    log.info("Updated onboarding session", { id, status: data.status });

    return this.rowToSession(result);
  }

  /**
   * Delete an onboarding session.
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(onboardingSessions)
      .where(eq(onboardingSessions.id, id))
      .returning({ id: onboardingSessions.id });

    const deleted = result.length > 0;
    if (deleted) {
      log.info("Deleted onboarding session", { id });
    }

    return deleted;
  }

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  /**
   * Start onboarding session.
   */
  async start(id: string): Promise<OnboardingSession | null> {
    return this.update(id, { status: "started" });
  }

  /**
   * Mark session as gathering requirements.
   */
  async markGathering(id: string): Promise<OnboardingSession | null> {
    return this.update(id, { status: "gathering" });
  }

  /**
   * Mark session as generating config.
   */
  async markGenerating(id: string): Promise<OnboardingSession | null> {
    return this.update(id, { status: "generating" });
  }

  /**
   * Mark session as applying config.
   */
  async markApplying(id: string): Promise<OnboardingSession | null> {
    return this.update(id, { status: "applying" });
  }

  /**
   * Complete onboarding session.
   */
  async complete(
    id: string,
    config: GeneratedConfig
  ): Promise<OnboardingSession | null> {
    return this.update(id, {
      status: "completed",
      generatedConfig: config,
    });
  }

  /**
   * Skip onboarding session.
   */
  async skip(id: string): Promise<OnboardingSession | null> {
    return this.update(id, { status: "skipped" });
  }

  /**
   * Mark session as failed.
   */
  async fail(id: string, errorMessage: string): Promise<OnboardingSession | null> {
    return this.update(id, {
      status: "failed",
      errorMessage,
    });
  }

  // ===========================================================================
  // Requirements & Config
  // ===========================================================================

  /**
   * Save gathered requirements.
   */
  async saveRequirements(
    id: string,
    requirements: OnboardingRequirements
  ): Promise<OnboardingSession | null> {
    return this.update(id, {
      gatheredRequirements: requirements,
      projectType: requirements.projectType,
      projectName: requirements.projectName,
      projectDescription: requirements.projectDescription,
    });
  }

  /**
   * Save generated config.
   */
  async saveConfig(
    id: string,
    config: GeneratedConfig
  ): Promise<OnboardingSession | null> {
    return this.update(id, { generatedConfig: config });
  }

  /**
   * Save selected models.
   */
  async saveModels(
    id: string,
    model: string,
    smallModel?: string
  ): Promise<OnboardingSession | null> {
    return this.update(id, {
      selectedModel: model,
      selectedSmallModel: smallModel,
    });
  }

  // ===========================================================================
  // Re-onboarding
  // ===========================================================================

  /**
   * Reset onboarding session for re-onboarding.
   * Can either wipe all data or preserve certain elements.
   */
  async reset(
    id: string,
    options: { preserveModels?: boolean } = {}
  ): Promise<OnboardingSession | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    // Build update data to clear fields
    const updateData: Record<string, unknown> = {
      status: "pending",
      projectType: null,
      projectName: null,
      projectDescription: null,
      gatheredRequirements: null,
      generatedConfig: null,
      errorMessage: null,
      updatedAt: new Date(),
    };

    // Optionally preserve selected models
    if (!options.preserveModels) {
      updateData.selectedModel = null;
      updateData.selectedSmallModel = null;
    }

    const results = await db
      .update(onboardingSessions)
      .set(updateData)
      .where(eq(onboardingSessions.id, id))
      .returning();

    const result = results[0];
    if (!result) {
      return null;
    }

    log.info("Reset onboarding session", { id });

    return this.rowToSession(result);
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get session statistics for a user.
   */
  async getUserStats(userId: string): Promise<{
    total: number;
    completed: number;
    skipped: number;
    failed: number;
    inProgress: number;
  }> {
    const sessions = await this.getByUserId(userId);

    return {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      skipped: sessions.filter((s) => s.status === "skipped").length,
      failed: sessions.filter((s) => s.status === "failed").length,
      inProgress: sessions.filter((s) =>
        ["pending", "started", "gathering", "generating", "applying"].includes(
          s.status
        )
      ).length,
    };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Convert database row to OnboardingSession type.
   */
  private rowToSession(row: {
    id: string;
    userId: string;
    sandboxId: string | null;
    status: string;
    projectType: string | null;
    projectName: string | null;
    projectDescription: string | null;
    gatheredRequirements: string | null;
    generatedConfig: string | null;
    selectedModel: string | null;
    selectedSmallModel: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
  }): OnboardingSession {
    return {
      id: row.id,
      userId: row.userId,
      sandboxId: row.sandboxId,
      status: row.status as OnboardingStatus,
      projectType: row.projectType,
      projectName: row.projectName,
      projectDescription: row.projectDescription,
      gatheredRequirements: row.gatheredRequirements
        ? JSON.parse(row.gatheredRequirements)
        : null,
      generatedConfig: row.generatedConfig
        ? JSON.parse(row.generatedConfig)
        : null,
      selectedModel: row.selectedModel,
      selectedSmallModel: row.selectedSmallModel,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() || null,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const onboardingService = new OnboardingService();
