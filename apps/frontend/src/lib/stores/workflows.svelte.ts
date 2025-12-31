import { getConnectionStatus, authGetToken } from "$lib/api/tauri";
import type {
  IAgentPodWorkflow,
  ICreateWorkflowRequest,
  IUpdateWorkflowRequest,
  IWorkflowListResponse,
  IWorkflowValidationResult,
  IWorkflowExecution,
} from "@agentpod/types";

let workflowList = $state<IAgentPodWorkflow[]>([]);
let currentWorkflow = $state<IAgentPodWorkflow | null>(null);
let isLoading = $state(false);
let isSaving = $state(false);
let error = $state<string | null>(null);
let total = $state(0);
let page = $state(1);
let limit = $state(20);

async function getApiContext(): Promise<{ baseUrl: string; token: string | null }> {
  const [status, token] = await Promise.all([
    getConnectionStatus(),
    authGetToken(),
  ]);
  if (!status.apiUrl) {
    throw new Error("Not connected to API");
  }
  return { baseUrl: status.apiUrl, token };
}

function getHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export const workflows = {
  get list() { return workflowList; },
  get current() { return currentWorkflow; },
  get isLoading() { return isLoading; },
  get isSaving() { return isSaving; },
  get error() { return error; },
  get total() { return total; },
  get page() { return page; },
  get limit() { return limit; },
};

export async function fetchWorkflows(options?: { page?: number; limit?: number; active?: boolean }): Promise<void> {
  isLoading = true;
  error = null;
  
  try {
    const { baseUrl, token } = await getApiContext();
    const params = new URLSearchParams();
    if (options?.page) params.set("page", String(options.page));
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.active !== undefined) params.set("active", String(options.active));
    
    const response = await fetch(`${baseUrl}/api/workflows?${params}`, {
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to fetch workflows: ${response.status}`);
    }
    
    const data: IWorkflowListResponse = await response.json();
    workflowList = data.workflows;
    total = data.total;
    page = data.page;
    limit = data.limit;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch workflows";
    console.error("Failed to fetch workflows:", e);
  } finally {
    isLoading = false;
  }
}

export async function fetchWorkflow(id: string): Promise<IAgentPodWorkflow | null> {
  isLoading = true;
  error = null;
  
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows/${id}`, {
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to fetch workflow: ${response.status}`);
    }
    
    const data = await response.json();
    currentWorkflow = data.workflow;
    return data.workflow;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch workflow";
    console.error("Failed to fetch workflow:", e);
    return null;
  } finally {
    isLoading = false;
  }
}

export async function createWorkflow(request: ICreateWorkflowRequest): Promise<IAgentPodWorkflow | null> {
  isSaving = true;
  error = null;
  
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(request),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to create workflow: ${response.status}`);
    }
    
    const data = await response.json();
    currentWorkflow = data.workflow;
    workflowList = [data.workflow, ...workflowList];
    return data.workflow;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to create workflow";
    console.error("Failed to create workflow:", e);
    return null;
  } finally {
    isSaving = false;
  }
}

export async function updateWorkflow(id: string, request: IUpdateWorkflowRequest): Promise<IAgentPodWorkflow | null> {
  isSaving = true;
  error = null;
  
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows/${id}`, {
      method: "PATCH",
      headers: getHeaders(token),
      body: JSON.stringify(request),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update workflow: ${response.status}`);
    }
    
    const data = await response.json();
    currentWorkflow = data.workflow;
    workflowList = workflowList.map(w => w.id === id ? data.workflow : w);
    return data.workflow;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to update workflow";
    console.error("Failed to update workflow:", e);
    return null;
  } finally {
    isSaving = false;
  }
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  isLoading = true;
  error = null;
  
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows/${id}`, {
      method: "DELETE",
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to delete workflow: ${response.status}`);
    }
    
    workflowList = workflowList.filter(w => w.id !== id);
    if (currentWorkflow?.id === id) {
      currentWorkflow = null;
    }
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete workflow";
    console.error("Failed to delete workflow:", e);
    return false;
  } finally {
    isLoading = false;
  }
}

export async function validateWorkflow(id: string): Promise<IWorkflowValidationResult | null> {
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows/${id}/validate`, {
      method: "POST",
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to validate workflow: ${response.status}`);
    }
    
    return await response.json();
  } catch (e) {
    console.error("Failed to validate workflow:", e);
    return null;
  }
}

export async function executeWorkflow(id: string, triggerData?: Record<string, unknown>): Promise<IWorkflowExecution | null> {
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows/${id}/execute`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ triggerData }),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to execute workflow: ${response.status}`);
    }
    
    const data = await response.json();
    return data.execution;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to execute workflow";
    console.error("Failed to execute workflow:", e);
    return null;
  }
}

export async function fetchExecution(executionId: string): Promise<IWorkflowExecution | null> {
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows/executions/${executionId}`, {
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to fetch execution: ${response.status}`);
    }
    
    const data = await response.json();
    return data.execution;
  } catch (e) {
    console.error("Failed to fetch execution:", e);
    return null;
  }
}

export async function pollExecutionStatus(executionId: string): Promise<{
  execution: IWorkflowExecution | null;
  cloudflareStatus: { status: string; output?: Record<string, unknown>; error?: string } | null;
  error?: string;
}> {
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/v2/workflow-executions/${executionId}/poll`, {
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to poll execution: ${response.status}`);
    }
    
    return await response.json();
  } catch (e) {
    console.error("Failed to poll execution:", e);
    return { execution: null, cloudflareStatus: null, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function pauseExecution(executionId: string): Promise<boolean> {
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/v2/workflow-executions/${executionId}/pause`, {
      method: "POST",
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to pause execution: ${response.status}`);
    }
    
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to pause execution";
    console.error("Failed to pause execution:", e);
    return false;
  }
}

export async function resumeExecution(executionId: string): Promise<boolean> {
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/v2/workflow-executions/${executionId}/resume`, {
      method: "POST",
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to resume execution: ${response.status}`);
    }
    
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to resume execution";
    console.error("Failed to resume execution:", e);
    return false;
  }
}

export async function terminateExecution(executionId: string): Promise<boolean> {
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/v2/workflow-executions/${executionId}/terminate`, {
      method: "POST",
      headers: getHeaders(token),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to terminate execution: ${response.status}`);
    }
    
    return true;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to terminate execution";
    console.error("Failed to terminate execution:", e);
    return false;
  }
}

export async function duplicateWorkflow(id: string, newName?: string): Promise<IAgentPodWorkflow | null> {
  isSaving = true;
  error = null;
  
  try {
    const { baseUrl, token } = await getApiContext();
    const response = await fetch(`${baseUrl}/api/workflows/${id}/duplicate`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ name: newName }),
      credentials: "include",
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to duplicate workflow: ${response.status}`);
    }
    
    const data = await response.json();
    workflowList = [data.workflow, ...workflowList];
    return data.workflow;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to duplicate workflow";
    console.error("Failed to duplicate workflow:", e);
    return null;
  } finally {
    isSaving = false;
  }
}

export function clearCurrentWorkflow(): void {
  currentWorkflow = null;
}

export function clearError(): void {
  error = null;
}
