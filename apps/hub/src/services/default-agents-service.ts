import { OPENCODE_AGENTS, AGENT_NAMES } from "@agentpod/agents/generated"
import { upsertUserOpencodeFile, listUserOpencodeFiles } from "../models/user-opencode-config"
import { createLogger } from "../utils/logger"

const log = createLogger("default-agents-service")

export async function ensureDefaultAgents(userId: string): Promise<{ created: number; skipped: number }> {
  const existingFiles = await listUserOpencodeFiles(userId, "agent")
  const existingNames = new Set(existingFiles.map(f => f.name))
  
  let created = 0
  let skipped = 0
  
  for (const agent of OPENCODE_AGENTS) {
    if (existingNames.has(agent.name)) {
      skipped++
      continue
    }
    
    await upsertUserOpencodeFile(
      userId,
      "agent",
      agent.name,
      "md",
      agent.content
    )
    created++
  }
  
  if (created > 0) {
    log.info("Created default agents for user", { userId, created, skipped })
  }
  
  return { created, skipped }
}

export async function resetAgentToDefault(userId: string, agentName: string): Promise<boolean> {
  const agent = OPENCODE_AGENTS.find(a => a.name === agentName)
  if (!agent) {
    log.warn("Agent not found in defaults", { agentName })
    return false
  }
  
  await upsertUserOpencodeFile(
    userId,
    "agent",
    agent.name,
    "md",
    agent.content
  )
  
  log.info("Reset agent to default", { userId, agentName })
  return true
}

export function isSystemAgent(agentName: string): boolean {
  return (AGENT_NAMES as readonly string[]).includes(agentName)
}

export function getSystemAgentNames(): readonly string[] {
  return AGENT_NAMES
}

export function getSystemAgentMetadata() {
  return OPENCODE_AGENTS.map(a => ({
    name: a.name,
    role: a.role,
    emoji: a.emoji,
    squad: a.squad,
  }))
}
