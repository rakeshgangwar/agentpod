import { commanderAda, builderBob, architectAria, guideGrace } from "./central"
import { 
  kaiCoder, 
  danaDebugger, 
  alexArchitect, 
  testerTim, 
  samSecurity 
} from "./development"
import { 
  peteProduct, 
  spencerSpecs, 
  riverRoadmap 
} from "./product"
import { 
  oliviaOperations, 
  noraNotifier,
  modelDoctorMike
} from "./operations"

export * from "./central"
export * from "./development"
export * from "./product"
export * from "./operations"

export const ALL_AGENTS = [
  commanderAda,
  builderBob,
  architectAria,
  guideGrace,
  kaiCoder,
  danaDebugger,
  alexArchitect,
  testerTim,
  samSecurity,
  peteProduct,
  spencerSpecs,
  riverRoadmap,
  oliviaOperations,
  noraNotifier,
  modelDoctorMike,
] as const

export const AGENTS_BY_SQUAD = {
  orchestration: [commanderAda, builderBob, architectAria, guideGrace],
  development: [kaiCoder, danaDebugger, alexArchitect, testerTim, samSecurity],
  product: [peteProduct, spencerSpecs, riverRoadmap],
  operations: [oliviaOperations, noraNotifier, modelDoctorMike],
  security: [samSecurity],
  data: [],
} as const

export const AGENTS_BY_NAME = {
  "Commander-Ada": commanderAda,
  "Builder-Bob": builderBob,
  "Architect-Aria": architectAria,
  "Guide-Grace": guideGrace,
  "Coder-Kai": kaiCoder,
  "Debugger-Dana": danaDebugger,
  "Architect-Alex": alexArchitect,
  "Tester-Tim": testerTim,
  "Security-Sam": samSecurity,
  "Product-Pete": peteProduct,
  "Specs-Spencer": spencerSpecs,
  "Roadmap-River": riverRoadmap,
  "Operations-Olivia": oliviaOperations,
  "Notifier-Nora": noraNotifier,
  "Model-Doctor-Mike": modelDoctorMike,
} as const
