export * from "./core"
export * from "./library"
export * from "./workflows"

import { AgentOrchestrator } from "./core"
import { ALL_AGENTS } from "./library"
import { ALL_WORKFLOWS } from "./workflows"

export function createOrchestrator(): AgentOrchestrator {
  return new AgentOrchestrator([...ALL_AGENTS], [...ALL_WORKFLOWS])
}
