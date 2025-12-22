import { agentpodCentral } from "./central"
import { 
  kaiCoder, 
  danaDebugger, 
  alexArchitect, 
  tessTester, 
  samSecurity 
} from "./development"
import { 
  peteProduct, 
  spencerSpecs, 
  riverRoadmap 
} from "./product"
import { 
  oliviaOperations, 
  noraNotifier 
} from "./operations"

export * from "./central"
export * from "./development"
export * from "./product"
export * from "./operations"

export const ALL_AGENTS = [
  agentpodCentral,
  kaiCoder,
  danaDebugger,
  alexArchitect,
  tessTester,
  samSecurity,
  peteProduct,
  spencerSpecs,
  riverRoadmap,
  oliviaOperations,
  noraNotifier,
] as const

export const AGENTS_BY_SQUAD = {
  orchestration: [agentpodCentral],
  development: [kaiCoder, danaDebugger, alexArchitect, tessTester, samSecurity],
  product: [peteProduct, spencerSpecs, riverRoadmap],
  operations: [oliviaOperations, noraNotifier],
  security: [samSecurity],
  data: [],
} as const

export const AGENTS_BY_NAME = {
  Central: agentpodCentral,
  Kai: kaiCoder,
  Dana: danaDebugger,
  Alex: alexArchitect,
  Tess: tessTester,
  Sam: samSecurity,
  Pete: peteProduct,
  Spencer: spencerSpecs,
  River: riverRoadmap,
  Olivia: oliviaOperations,
  Nora: noraNotifier,
} as const
