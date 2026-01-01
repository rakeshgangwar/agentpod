import { db } from "../db/drizzle";
import {
  sessionForks,
  messageBranches,
  type SessionForkRecord,
  type NewSessionForkRecord,
  type MessageBranchRecord,
} from "../db/schema/session-forks";
import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm";
import { opencodeV2 } from "./opencode-v2";
import { createLogger } from "../utils/logger";
import type {
  SessionFork,
  SessionBranch,
  ForkType,
  ForkCreator,
  CreateForkInput,
  ListForksResponse,
  ForkStatistics,
} from "@agentpod/types";

const log = createLogger("session-fork-manager");

function toSessionFork(record: SessionForkRecord): SessionFork {
  return {
    id: record.id,
    parentSessionId: record.parentSessionId,
    forkedAtMessageId: record.forkedAtMessageId,
    forkType: record.forkType as ForkType,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy as ForkCreator,
    tags: record.tags || [],
    metadata: {
      reason: record.reason || undefined,
      agentConfig: record.agentConfig as any || undefined,
      mergedInto: record.mergedInto || undefined,
      originalTitle: record.originalTitle || undefined,
    },
  };
}

function toSessionBranch(record: MessageBranchRecord): SessionBranch {
  return {
    sessionId: record.sessionId,
    branchId: record.branchId,
    messageId: record.messageId,
    branchNumber: record.branchNumber,
    parentBranchId: record.parentBranchId,
    isCurrent: record.isCurrent || false,
    createdAt: record.createdAt.toISOString(),
  };
}

export const sessionForkManager = {
  async createFork(params: {
    sandboxId: string;
    parentSessionId: string;
    input: CreateForkInput;
    forkType?: ForkType;
    createdBy?: ForkCreator;
  }): Promise<SessionFork> {
    const {
      sandboxId,
      parentSessionId,
      input,
      forkType = "explicit",
      createdBy = "user",
    } = params;

    log.info("Creating session fork", {
      sandboxId,
      parentSessionId,
      messageId: input.messageId,
      messageRole: input.messageRole,
      forkType,
    });

    // OpenCode's fork creates a session with messages BEFORE the specified messageId.
    // For assistant messages, we want to INCLUDE that message, so pass the NEXT message's ID.
    let forkAtMessageId = input.messageId;

    if (input.messageRole === "assistant" && input.messageId) {
      const messages = await opencodeV2.listMessages(sandboxId, parentSessionId);
      const messageIndex = messages.findIndex((m) => m.info.id === input.messageId);

      if (messageIndex !== -1) {
        const nextMessage = messages[messageIndex + 1];
        if (nextMessage) {
          forkAtMessageId = nextMessage.info.id;
          log.debug("Fork from assistant: using next message as fork point", {
            assistantMessageId: input.messageId,
            nextMessageId: forkAtMessageId,
          });
        } else {
          forkAtMessageId = undefined;
          log.debug("Fork from assistant: last message, forking with all");
        }
      }
    }

    const newSession = await opencodeV2.forkSession(
      sandboxId,
      parentSessionId,
      forkAtMessageId
    );

    const forkRecord: NewSessionForkRecord = {
      id: newSession.id,
      sandboxId,
      parentSessionId,
      forkedAtMessageId: input.messageId || null,
      forkType,
      createdBy,
      tags: input.tags || [],
      reason: input.reason || null,
      agentConfig: input.agentConfig || null,
      originalTitle: newSession.title || null,
    };

    const [insertedRecord] = await db
      .insert(sessionForks)
      .values(forkRecord)
      .returning();

    if (!insertedRecord) {
      throw new Error("Failed to insert fork record into database");
    }

    log.info("Fork created successfully", {
      sandboxId,
      newSessionId: newSession.id,
      parentSessionId,
    });

    return toSessionFork(insertedRecord);
  },

  async listForks(sandboxId: string): Promise<ListForksResponse> {
    const records = await db
      .select()
      .from(sessionForks)
      .where(eq(sessionForks.sandboxId, sandboxId))
      .orderBy(desc(sessionForks.createdAt));

    const forks = records.map(toSessionFork);
    const forkIds = new Set(forks.map((f) => f.id));

    const rootSessionIds = new Set<string>();

    for (const fork of forks) {
      if (fork.parentSessionId && !forkIds.has(fork.parentSessionId)) {
        rootSessionIds.add(fork.parentSessionId);
      } else if (!fork.parentSessionId) {
        rootSessionIds.add(fork.id);
      }
    }

    return { forks, rootSessions: Array.from(rootSessionIds) };
  },

  async getFork(sessionId: string): Promise<SessionFork | null> {
    const records = await db
      .select()
      .from(sessionForks)
      .where(eq(sessionForks.id, sessionId))
      .limit(1);

    const record = records[0];
    if (!record) return null;
    return toSessionFork(record);
  },

  async getAncestry(sessionId: string): Promise<string[]> {
    const path: string[] = [sessionId];
    let currentId = sessionId;

    while (true) {
      const records = await db
        .select()
        .from(sessionForks)
        .where(eq(sessionForks.id, currentId))
        .limit(1);

      const record = records[0];
      if (!record || !record.parentSessionId) break;

      path.unshift(record.parentSessionId);
      currentId = record.parentSessionId;
    }

    return path;
  },

  async getChildren(sessionId: string): Promise<SessionFork[]> {
    const records = await db
      .select()
      .from(sessionForks)
      .where(eq(sessionForks.parentSessionId, sessionId))
      .orderBy(desc(sessionForks.createdAt));

    return records.map(toSessionFork);
  },

  async getRootSessions(sandboxId: string): Promise<string[]> {
    const records = await db
      .select({ id: sessionForks.id })
      .from(sessionForks)
      .where(
        and(
          eq(sessionForks.sandboxId, sandboxId),
          isNull(sessionForks.parentSessionId)
        )
      );

    return records.map((r) => r.id);
  },

  async addTag(sessionId: string, tag: string): Promise<void> {
    const fork = await this.getFork(sessionId);
    if (!fork) {
      log.warn("Cannot add tag: fork not found", { sessionId, tag });
      return;
    }

    const newTags = [...new Set([...fork.tags, tag])];

    await db
      .update(sessionForks)
      .set({ tags: newTags })
      .where(eq(sessionForks.id, sessionId));

    log.debug("Tag added to session", { sessionId, tag });
  },

  async removeTag(sessionId: string, tag: string): Promise<void> {
    const fork = await this.getFork(sessionId);
    if (!fork) return;

    const newTags = fork.tags.filter((t) => t !== tag);

    await db
      .update(sessionForks)
      .set({ tags: newTags })
      .where(eq(sessionForks.id, sessionId));

    log.debug("Tag removed from session", { sessionId, tag });
  },

  async setTags(sessionId: string, tags: string[]): Promise<void> {
    await db
      .update(sessionForks)
      .set({ tags })
      .where(eq(sessionForks.id, sessionId));
  },

  async deleteFork(sessionId: string): Promise<void> {
    await db.delete(sessionForks).where(eq(sessionForks.id, sessionId));
    log.debug("Fork record deleted", { sessionId });
  },

  async deleteForkTree(sandboxId: string, sessionId: string): Promise<void> {
    const descendants = await this.getDescendants(sessionId);
    const allIds = [sessionId, ...descendants];

    log.info("Deleting fork tree", {
      sandboxId,
      rootSessionId: sessionId,
      descendantCount: descendants.length,
    });

    for (const id of allIds.reverse()) {
      try {
        await opencodeV2.deleteSession(sandboxId, id);
      } catch (error) {
        log.warn("Failed to delete OpenCode session", { sessionId: id, error });
      }
    }

    if (allIds.length > 0) {
      await db
        .delete(sessionForks)
        .where(inArray(sessionForks.id, allIds));
    }

    log.info("Fork tree deleted", {
      sandboxId,
      deletedCount: allIds.length,
    });
  },

  async getDescendants(sessionId: string): Promise<string[]> {
    const children = await this.getChildren(sessionId);
    const descendants: string[] = children.map((c) => c.id);

    for (const child of children) {
      const childDescendants = await this.getDescendants(child.id);
      descendants.push(...childDescendants);
    }

    return descendants;
  },

  async recordBranch(params: {
    sandboxId: string;
    sessionId: string;
    messageId: string;
    branchNumber: number;
    parentBranchId?: string;
  }): Promise<SessionBranch> {
    const { sandboxId, sessionId, messageId, branchNumber, parentBranchId } =
      params;
    const branchId = `${messageId}-branch-${branchNumber}`;

    await db
      .update(messageBranches)
      .set({ isCurrent: false })
      .where(eq(messageBranches.sessionId, sessionId));

    const newBranch = {
      sandboxId,
      sessionId,
      branchId,
      messageId,
      branchNumber,
      parentBranchId: parentBranchId || null,
      isCurrent: true,
    };

    await db.insert(messageBranches).values(newBranch);

    log.debug("Branch recorded", { sessionId, branchId, branchNumber });

    return {
      ...newBranch,
      createdAt: new Date().toISOString(),
    };
  },

  async getBranches(sessionId: string): Promise<SessionBranch[]> {
    const records = await db
      .select()
      .from(messageBranches)
      .where(eq(messageBranches.sessionId, sessionId))
      .orderBy(desc(messageBranches.createdAt));

    return records.map(toSessionBranch);
  },

  async getCurrentBranch(sessionId: string): Promise<SessionBranch | null> {
    const records = await db
      .select()
      .from(messageBranches)
      .where(
        and(
          eq(messageBranches.sessionId, sessionId),
          eq(messageBranches.isCurrent, true)
        )
      )
      .limit(1);

    const record = records[0];
    if (!record) return null;
    return toSessionBranch(record);
  },

  async switchBranch(sessionId: string, branchId: string): Promise<void> {
    await db
      .update(messageBranches)
      .set({ isCurrent: false })
      .where(eq(messageBranches.sessionId, sessionId));

    await db
      .update(messageBranches)
      .set({ isCurrent: true })
      .where(
        and(
          eq(messageBranches.sessionId, sessionId),
          eq(messageBranches.branchId, branchId)
        )
      );

    log.debug("Branch switched", { sessionId, branchId });
  },

  async getStatistics(sandboxId: string): Promise<ForkStatistics> {
    const allForks = await db
      .select()
      .from(sessionForks)
      .where(eq(sessionForks.sandboxId, sandboxId));

    const rootCount = allForks.filter((f) => !f.parentSessionId).length;
    const forkedCount = allForks.filter((f) => f.parentSessionId).length;

    let maxDepth = 0;
    for (const fork of allForks) {
      const ancestry = await this.getAncestry(fork.id);
      maxDepth = Math.max(maxDepth, ancestry.length - 1);
    }

    const byType = {
      explicit: allForks.filter((f) => f.forkType === "explicit").length,
      autoEdit: allForks.filter((f) => f.forkType === "auto-edit").length,
      autoRegenerate: allForks.filter((f) => f.forkType === "auto-regenerate")
        .length,
    };

    const tagCounts = new Map<string, number>();
    for (const fork of allForks) {
      for (const tag of fork.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSessions: allForks.length,
      rootSessions: rootCount,
      forkedSessions: forkedCount,
      maxDepth,
      byType,
      topTags,
    };
  },

  async ensureForkRecord(params: {
    sandboxId: string;
    sessionId: string;
    parentSessionId?: string;
    forkType?: ForkType;
  }): Promise<void> {
    const existing = await this.getFork(params.sessionId);
    if (existing) return;

    const record: NewSessionForkRecord = {
      id: params.sessionId,
      sandboxId: params.sandboxId,
      parentSessionId: params.parentSessionId || null,
      forkedAtMessageId: null,
      forkType: params.forkType || "explicit",
      createdBy: "system",
      tags: [],
    };

    await db
      .insert(sessionForks)
      .values(record)
      .onConflictDoNothing();
  },
};

export type SessionForkManager = typeof sessionForkManager;
