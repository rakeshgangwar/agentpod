import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db/drizzle";
import {
  agents,
  userAgents,
  sandboxAgents,
  type InsertAgent,
  type InsertUserAgent,
  type InsertSandboxAgent,
  type Agent,
  type AgentSquad,
  type AgentMode,
} from "../db/schema";
import { OPENCODE_AGENTS } from "@agentpod/agents/generated";
import { createLogger } from "../utils/logger";
import { nanoid } from "nanoid";

const log = createLogger("agent-catalog-service");

export const MANDATORY_AGENT_SLUGS = [
  "commander-ada",
  "builder-bob", 
  "architect-aria",
] as const;

export const SQUAD_PRIMARY_AGENTS: Record<AgentSquad, string> = {
  orchestration: "commander-ada",
  development: "coder-kai",
  operations: "operations-manager-olivia",
  security: "security-chief-sam",
  research: "data-scientist-diana",
  communication: "document-director-doug",
  product: "project-manager-pete",
  data: "data-scientist-diana",
};

const SQUAD_MAP: Record<string, AgentSquad> = {
  orchestration: "orchestration",
  development: "development",
  product: "product",
  operations: "operations",
  security: "security",
  research: "research",
  communication: "communication",
  data: "data",
};

const MAX_VERSION_HISTORY = 10;

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function seedBuiltinAgents(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const agentDef of OPENCODE_AGENTS) {
    const existing = await db.query.agents.findFirst({
      where: eq(agents.slug, agentDef.name),
    });

    if (existing) {
      skipped++;
      continue;
    }

    const squad = SQUAD_MAP[agentDef.squad] || "development";

    const agentRecord: InsertAgent = {
      id: nanoid(),
      slug: agentDef.name,
      name: slugToDisplayName(agentDef.name),
      role: agentDef.role,
      emoji: agentDef.emoji,
      description: `${agentDef.role} - ${agentDef.squad} squad`,
      squad,
      tier: agentDef.name === "ada" ? "central" : "foundation",
      tags: [agentDef.squad, agentDef.role.toLowerCase().replace(/\s+/g, "-")],
      category: agentDef.squad,
      isBuiltin: true,
      isPremium: false,
      isDefault: agentDef.isDefault,
      installCount: 0,
      ratingCount: 0,
      config: {
        name: agentDef.name,
        role: agentDef.role,
        emoji: agentDef.emoji,
        squad: agentDef.squad,
      },
      opencodeContent: agentDef.content,
      status: "active",
    };

    await db.insert(agents).values(agentRecord);
    created++;
  }

  if (created > 0) {
    log.info("Seeded builtin agents", { created, skipped });
  }

  return { created, skipped };
}

interface MandatoryAgentDef {
  slug: string;
  name: string;
  role: string;
  emoji: string;
  squad: AgentSquad;
  mode: AgentMode;
}

const MANDATORY_AGENTS: MandatoryAgentDef[] = [
  {
    slug: "commander-ada",
    name: "Commander Ada",
    role: "Strategic Command Agent",
    emoji: "🎖️",
    squad: "orchestration",
    mode: "primary",
  },
  {
    slug: "builder-bob",
    name: "Builder Bob",
    role: "Construction and Implementation Expert",
    emoji: "🔨",
    squad: "orchestration",
    mode: "primary",
  },
  {
    slug: "architect-aria",
    name: "Architect Aria",
    role: "Chief Process Design Specialist",
    emoji: "📐",
    squad: "orchestration",
    mode: "primary",
  },
  {
    slug: "guide-grace",
    name: "Guide Grace",
    role: "Workspace Setup Specialist",
    emoji: "🚀",
    squad: "orchestration",
    mode: "subagent",
  },
];

export async function seedMandatoryAgents(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const agentDef of MANDATORY_AGENTS) {
    const existing = await db.query.agents.findFirst({
      where: eq(agents.slug, agentDef.slug),
    });

    if (existing) {
      if (!existing.isMandatory) {
        await db
          .update(agents)
          .set({ isMandatory: true, mode: agentDef.mode, updatedAt: new Date() })
          .where(eq(agents.id, existing.id));
        updated++;
      }
      continue;
    }

    const agentRecord: InsertAgent = {
      id: nanoid(),
      slug: agentDef.slug,
      name: agentDef.name,
      role: agentDef.role,
      emoji: agentDef.emoji,
      description: `${agentDef.role} - Central orchestration agent (mandatory)`,
      squad: agentDef.squad,
      tier: "central",
      mode: agentDef.mode,
      tags: ["orchestration", "mandatory", agentDef.role.toLowerCase().replace(/\s+/g, "-")],
      category: "orchestration",
      isBuiltin: true,
      isPremium: false,
      isDefault: true,
      isMandatory: true,
      installCount: 0,
      ratingCount: 0,
      config: {
        name: agentDef.slug,
        role: agentDef.role,
        emoji: agentDef.emoji,
        squad: agentDef.squad,
        mode: agentDef.mode,
      },
      opencodeContent: getMandatoryAgentContent(agentDef.slug),
      status: "active",
      version: 1,
      versionHistory: [],
    };

    await db.insert(agents).values(agentRecord);
    created++;
  }

  if (created > 0 || updated > 0) {
    log.info("Seeded mandatory agents", { created, updated });
  }

  return { created, updated };
}

function getMandatoryAgentContent(slug: string): string {
  const agent = OPENCODE_AGENTS.find(a => a.name === slug);
  if (agent) {
    return agent.content;
  }
  log.warn("Mandatory agent content not found in OPENCODE_AGENTS, using fallback", { slug });
  return `# Mandatory Agent - ${slug}

> **Squad**: Orchestration | **Tier**: Central | **Mode**: Primary (Mandatory)

This is a mandatory agent for every sandbox.
`;
}

const DEPRECATED_AGENT_SLUGS = [
  "ada",
  "kai", 
  "dana",
  "alex",
  "tim",
  "tess",
  "sam",
  "pete",
  "spencer",
  "river",
  "olivia",
  "nora",
  "central",
];

export async function cleanupDeprecatedAgents(): Promise<{ deleted: number }> {
  let deleted = 0;
  
  for (const slug of DEPRECATED_AGENT_SLUGS) {
    const existing = await db.query.agents.findFirst({
      where: eq(agents.slug, slug),
    });
    
    if (existing) {
      await db.delete(sandboxAgents).where(eq(sandboxAgents.agentId, existing.id));
      await db.delete(userAgents).where(eq(userAgents.agentId, existing.id));
      await db.delete(agents).where(eq(agents.id, existing.id));
      deleted++;
      log.info("Deleted deprecated agent", { slug, id: existing.id });
    }
  }
  
  if (deleted > 0) {
    log.info("Cleaned up deprecated agents", { deleted });
  }
  
  return { deleted };
}

export async function refreshAgentContent(): Promise<{ updated: number }> {
  let updated = 0;
  
  for (const agentDef of OPENCODE_AGENTS) {
    const existing = await db.query.agents.findFirst({
      where: eq(agents.slug, agentDef.name),
    });
    
    if (!existing) {
      continue;
    }
    
    const hasFrontmatter = existing.opencodeContent?.startsWith("---");
    const contentMatches = existing.opencodeContent === agentDef.content;
    const expectedDisplayName = slugToDisplayName(agentDef.name);
    const nameMatches = existing.name === expectedDisplayName;
    
    if (!hasFrontmatter || !contentMatches || !nameMatches) {
      await db
        .update(agents)
        .set({ 
          opencodeContent: agentDef.content,
          name: expectedDisplayName,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, existing.id));
      updated++;
      log.info("Updated agent", { 
        slug: agentDef.name, 
        nameFixed: !nameMatches,
        contentFixed: !hasFrontmatter || !contentMatches 
      });
    }
  }
  
  if (updated > 0) {
    log.info("Refreshed agents from OPENCODE_AGENTS", { updated });
  }
  
  return { updated };
}

export async function ensureAgentCatalog(): Promise<void> {
  await cleanupDeprecatedAgents();
  await seedBuiltinAgents();
  await seedMandatoryAgents();
  await refreshAgentContent();
}

export async function getAllAgents(includeHidden = false): Promise<Agent[]> {
  if (includeHidden) {
    return db.query.agents.findMany({
      orderBy: (agentsTable, { asc }) => [asc(agentsTable.squad), asc(agentsTable.name)],
    });
  }
  return db.query.agents.findMany({
    where: eq(agents.status, "active"),
    orderBy: (agentsTable, { asc }) => [asc(agentsTable.squad), asc(agentsTable.name)],
  });
}

export async function getMandatoryAgents(): Promise<Agent[]> {
  return db.query.agents.findMany({
    where: eq(agents.isMandatory, true),
    orderBy: (agentsTable, { asc }) => [asc(agentsTable.name)],
  });
}

export async function getAgentBySlug(slug: string): Promise<Agent | undefined> {
  return db.query.agents.findFirst({
    where: eq(agents.slug, slug),
  });
}

export async function getAgentById(id: string): Promise<Agent | undefined> {
  return db.query.agents.findFirst({
    where: eq(agents.id, id),
  });
}

export async function getAgentsBySquad(squad: AgentSquad): Promise<Agent[]> {
  return db.query.agents.findMany({
    where: eq(agents.squad, squad),
    orderBy: (agentsTable, { asc }) => [asc(agentsTable.name)],
  });
}

export async function getDefaultAgents(): Promise<Agent[]> {
  return db.query.agents.findMany({
    where: and(eq(agents.isDefault, true), eq(agents.status, "active")),
    orderBy: (agentsTable, { asc }) => [asc(agentsTable.squad), asc(agentsTable.name)],
  });
}

export async function getAgentsBySlugs(slugs: string[]): Promise<Agent[]> {
  if (slugs.length === 0) return [];
  return db.query.agents.findMany({
    where: inArray(agents.slug, slugs),
  });
}



export async function ensureUserHasDefaultAgents(userId: string): Promise<{ created: number; skipped: number }> {
  const builtinAgents = await db.query.agents.findMany({
    where: eq(agents.isBuiltin, true),
  });

  let created = 0;
  let skipped = 0;

  for (const agent of builtinAgents) {
    const existing = await db.query.userAgents.findFirst({
      where: and(eq(userAgents.userId, userId), eq(userAgents.agentId, agent.id)),
    });

    if (existing) {
      skipped++;
      continue;
    }

    const userAgentRecord: InsertUserAgent = {
      id: nanoid(),
      userId,
      agentId: agent.id,
      source: "default",
    };

    await db.insert(userAgents).values(userAgentRecord);
    created++;
  }

  if (created > 0) {
    log.info("Ensured user has default agents", { userId, created, skipped });
  }

  return { created, skipped };
}

export async function getUserAgents(userId: string): Promise<Agent[]> {
  const userAgentRecords = await db.query.userAgents.findMany({
    where: eq(userAgents.userId, userId),
  });

  const agentIds = userAgentRecords.map((ua) => ua.agentId);

  if (agentIds.length === 0) {
    return [];
  }

  const agentRecords = await db.query.agents.findMany({
    where: inArray(agents.id, agentIds),
    orderBy: (agentsTable, { asc }) => [asc(agentsTable.squad), asc(agentsTable.name)],
  });

  return agentRecords;
}

export async function assignAgentsToSandbox(
  sandboxId: string,
  agentSlugs: string[],
  addedBy?: string
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const slug of agentSlugs) {
    const agent = await getAgentBySlug(slug);
    if (!agent) {
      log.warn("Agent not found for sandbox assignment", { slug, sandboxId });
      continue;
    }

    const existing = await db.query.sandboxAgents.findFirst({
      where: and(eq(sandboxAgents.sandboxId, sandboxId), eq(sandboxAgents.agentId, agent.id)),
    });

    if (existing) {
      skipped++;
      continue;
    }

    const sandboxAgentRecord: InsertSandboxAgent = {
      id: nanoid(),
      sandboxId,
      agentId: agent.id,
      enabled: true,
      priority: created,
      addedBy,
    };

    await db.insert(sandboxAgents).values(sandboxAgentRecord);
    created++;
  }

  if (created > 0) {
    log.info("Assigned agents to sandbox", { sandboxId, created, skipped });
  }

  return { created, skipped };
}



export async function getSandboxAgents(sandboxId: string): Promise<Agent[]> {
  const sandboxAgentRecords = await db.query.sandboxAgents.findMany({
    where: and(eq(sandboxAgents.sandboxId, sandboxId), eq(sandboxAgents.enabled, true)),
    orderBy: (saTable, { asc }) => [asc(saTable.priority)],
  });

  const agentIds = sandboxAgentRecords.map((sa) => sa.agentId);

  if (agentIds.length === 0) {
    return [];
  }

  const agentRecords = await db.query.agents.findMany({
    where: inArray(agents.id, agentIds),
  });

  const agentMap = new Map(agentRecords.map((a) => [a.id, a]));
  return agentIds.map((id) => agentMap.get(id)!).filter(Boolean);
}

export async function removeAgentFromSandbox(sandboxId: string, agentSlug: string): Promise<{ success: boolean; error?: string }> {
  const agent = await getAgentBySlug(agentSlug);
  if (!agent) {
    return { success: false, error: "Agent not found" };
  }

  if (agent.isMandatory) {
    return { success: false, error: "Cannot remove mandatory agent" };
  }

  await db
    .delete(sandboxAgents)
    .where(and(eq(sandboxAgents.sandboxId, sandboxId), eq(sandboxAgents.agentId, agent.id)));

  return { success: true };
}

export async function addAgentToSandbox(
  sandboxId: string,
  agentSlug: string,
  addedBy?: string
): Promise<boolean> {
  const agent = await getAgentBySlug(agentSlug);
  if (!agent) {
    return false;
  }

  const existing = await db.query.sandboxAgents.findFirst({
    where: and(eq(sandboxAgents.sandboxId, sandboxId), eq(sandboxAgents.agentId, agent.id)),
  });

  if (existing) {
    return false;
  }

  const currentCount = await db.query.sandboxAgents.findMany({
    where: eq(sandboxAgents.sandboxId, sandboxId),
  });

  const sandboxAgentRecord: InsertSandboxAgent = {
    id: nanoid(),
    sandboxId,
    agentId: agent.id,
    enabled: true,
    priority: currentCount.length,
    addedBy,
  };

  await db.insert(sandboxAgents).values(sandboxAgentRecord);
  return true;
}

export async function clearSandboxAgents(sandboxId: string): Promise<void> {
  await db.delete(sandboxAgents).where(eq(sandboxAgents.sandboxId, sandboxId));
}

export interface UpdateAgentInput {
  name?: string;
  role?: string;
  emoji?: string;
  description?: string;
  squad?: AgentSquad;
  tier?: "central" | "foundation" | "specialized" | "premium";
  mode?: AgentMode;
  tags?: string[];
  category?: string;
  isDefault?: boolean;
  isPremium?: boolean;
  status?: "active" | "deprecated" | "hidden" | "pending_review";
  config?: Record<string, unknown>;
  opencodeContent?: string;
}

interface VersionHistoryEntry {
  version: number;
  opencodeContent: string;
  updatedAt: string;
  updatedBy?: string;
}

export async function updateAgent(
  agentId: string,
  updates: UpdateAgentInput,
  updatedBy?: string
): Promise<Agent | undefined> {
  const existing = await getAgentById(agentId);
  if (!existing) {
    return undefined;
  }

  const updateData: Record<string, unknown> = { ...updates, updatedAt: new Date() };

  if (updates.opencodeContent && updates.opencodeContent !== existing.opencodeContent) {
    const currentVersion = existing.version ?? 1;
    const history = (existing.versionHistory as VersionHistoryEntry[]) ?? [];
    
    const newHistoryEntry: VersionHistoryEntry = {
      version: currentVersion,
      opencodeContent: existing.opencodeContent,
      updatedAt: existing.updatedAt.toISOString(),
      updatedBy,
    };

    const newHistory = [newHistoryEntry, ...history].slice(0, MAX_VERSION_HISTORY);

    updateData.version = currentVersion + 1;
    updateData.versionHistory = newHistory;
    
    log.info("Agent content updated with versioning", { 
      agentId, 
      oldVersion: currentVersion, 
      newVersion: currentVersion + 1 
    });
  }

  const [updated] = await db
    .update(agents)
    .set(updateData)
    .where(eq(agents.id, agentId))
    .returning();
  return updated;
}

export async function validateAgentSelection(agentSlugs: string[]): Promise<{ valid: boolean; error?: string; missingSlugs?: string[] }> {
  const missingSlugs = MANDATORY_AGENT_SLUGS.filter(
    (mandatory) => !agentSlugs.includes(mandatory)
  );

  if (missingSlugs.length > 0) {
    return {
      valid: false,
      error: `Missing mandatory agents: ${missingSlugs.join(", ")}`,
      missingSlugs: [...missingSlugs],
    };
  }

  return { valid: true };
}

export async function updateSandboxAgents(
  sandboxId: string,
  agentSlugs: string[],
  addedBy?: string
): Promise<{ created: number; error?: string }> {
  const validation = await validateAgentSelection(agentSlugs);
  if (!validation.valid) {
    log.warn("Invalid agent selection - missing mandatory agents", { 
      sandboxId, 
      missingSlugs: validation.missingSlugs 
    });
    return { created: 0, error: validation.error };
  }

  await clearSandboxAgents(sandboxId);
  const result = await assignAgentsToSandbox(sandboxId, agentSlugs, addedBy);
  return { created: result.created };
}

export async function ensureMandatoryAgentsInSandbox(
  sandboxId: string,
  addedBy?: string
): Promise<{ created: number }> {
  const result = await assignAgentsToSandbox(sandboxId, [...MANDATORY_AGENT_SLUGS], addedBy);
  return { created: result.created };
}
