export { prReviewWorkflow } from "./pr-review"
export { incidentResponseWorkflow } from "./incident-response"
export { featurePlanningWorkflow } from "./feature-planning"

import { prReviewWorkflow } from "./pr-review"
import { incidentResponseWorkflow } from "./incident-response"
import { featurePlanningWorkflow } from "./feature-planning"

export const ALL_WORKFLOWS = [
  prReviewWorkflow,
  incidentResponseWorkflow,
  featurePlanningWorkflow,
] as const

export const WORKFLOWS_BY_ID = {
  "pr-review": prReviewWorkflow,
  "incident-response": incidentResponseWorkflow,
  "feature-planning": featurePlanningWorkflow,
} as const
