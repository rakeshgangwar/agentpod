import type { WorkflowEnv } from "./types";
import type { StepResult } from "../utils/context";

export async function notifyAgentPodAPI(
  env: WorkflowEnv,
  executionId: string,
  workflowId: string,
  status: "running" | "waiting" | "completed" | "errored",
  completedSteps: string[],
  currentStep: string | null,
  result?: Record<string, StepResult>,
  error?: string
): Promise<void> {
  if (!env.AGENTPOD_API_URL || !env.AGENTPOD_API_TOKEN) {
    console.log("[Workflow SDK] API not configured, skipping status update");
    return;
  }

  const url = `${env.AGENTPOD_API_URL}/api/v2/workflow-executions/${executionId}/status`;

  try {
    console.log(
      `[Workflow SDK] Sending status update: ${status}, step: ${currentStep}, completed: ${completedSteps.length}`
    );

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AGENTPOD_API_TOKEN}`,
      },
      body: JSON.stringify({
        executionId,
        workflowId,
        status,
        currentStep,
        completedSteps,
        result,
        error,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Workflow SDK] Status update failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    } else {
      console.log(`[Workflow SDK] Status update sent successfully`);
    }
  } catch (err) {
    console.error("[Workflow SDK] Failed to notify status:", err);
  }
}
