import { getSandbox } from "@cloudflare/sandbox";
import { createOpencode } from "@cloudflare/sandbox/opencode";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type { NodeExecutor } from "./base";
import { createStepResult, createErrorResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

interface AIAgentParams {
  prompt: string;
  model?: {
    providerId: string;
    modelId: string;
  };
  sandboxConfig?: {
    gitUrl?: string;
    workspaceId?: string;
    directory?: string;
  };
  timeout?: string;
}

export const aiAgentExecutor: NodeExecutor = {
  type: "ai-agent",
  category: "ai",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    if (!params.prompt || typeof params.prompt !== "string") {
      errors.push("Prompt is required");
    }
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<AIAgentParams>;
    const prompt = p.prompt;
    const model = p.model;
    const sandboxConfig = p.sandboxConfig;
    
    if (!prompt) {
      return createErrorResult("Prompt is required");
    }
    
    const sandboxId = sandboxConfig?.workspaceId || `wf-${params.nodeId}-${Date.now()}`;
    const directory = sandboxConfig?.directory || "/home/user/workspace";
    
    try {
      const sandbox = getSandbox(params.context.env.Sandbox, sandboxId);
      
      if (sandboxConfig?.gitUrl) {
        await sandbox.gitCheckout(sandboxConfig.gitUrl, {
          targetDir: directory,
        });
      }
      
      const { client } = await createOpencode<OpencodeClient>(sandbox, {
        directory,
      });
      
      const session = await client.session.create({
        body: { title: params.nodeName },
      });
      
      if (!session.data) {
        return createErrorResult("Failed to create session");
      }
      
      const response = await client.session.prompt({
        path: { id: session.data.id },
        body: {
          parts: [{ type: "text", text: prompt }],
          model: model ? { providerID: model.providerId, modelID: model.modelId } : undefined,
        },
      });
      
      const parts = response.data?.parts ?? [];
      const textPart = parts.find((p: { type: string }) => p.type === "text") as
        | { text?: string }
        | undefined;
      
      return createStepResult({
        sessionId: session.data.id,
        sandboxId,
        response: textPart?.text ?? "",
        parts: response.data?.parts,
      });
    } catch (error) {
      if (error instanceof Error) {
        return createErrorResult(`AI Agent error: ${error.message}`);
      }
      return createErrorResult("Unknown AI Agent error");
    }
  },
};

interface AIPromptParams {
  prompt: string;
  model?: {
    providerId: string;
    modelId: string;
  };
  temperature?: number;
  maxTokens?: number;
}

export const aiPromptExecutor: NodeExecutor = {
  type: "ai-prompt",
  category: "ai",
  
  validate(params: Record<string, unknown>) {
    const errors: string[] = [];
    if (!params.prompt || typeof params.prompt !== "string") {
      errors.push("Prompt is required");
    }
    return errors;
  },
  
  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<AIPromptParams>;
    const prompt = p.prompt;
    
    if (!prompt) {
      return createErrorResult("Prompt is required");
    }
    
    return createStepResult({
      response: `[AI Prompt: ${prompt.substring(0, 50)}...]`,
      note: "Direct AI calls not implemented - use ai-agent node with sandbox",
    });
  },
};
