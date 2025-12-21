import { getConnectionStatus, authGetToken } from "$lib/api/tauri";

export interface QuickTask {
  id: string;
  message: string;
  response: string;
  status: "pending" | "streaming" | "completed" | "failed";
  provider: "docker" | "cloudflare";
  templateId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  prompt: string;
  placeholders: Array<{
    name: string;
    label: string;
    type: "text" | "textarea" | "select";
    options?: string[];
  }>;
}

export interface ProviderInfo {
  available: boolean;
  description: string;
}

export type AvailableProviders = Record<"docker" | "cloudflare", ProviderInfo>;

interface SSEEvent {
  type: "start" | "status" | "chunk" | "done" | "error";
  taskId?: string;
  message?: string;
  content?: string;
  sandboxId?: string;
  sessionId?: string;
  messageId?: string;
  createdNewSandbox?: boolean;
}

let isOpen = $state(false);
let isStreaming = $state(false);
let currentResponse = $state("");
let statusMessage = $state("");
let currentTask = $state<QuickTask | null>(null);
let history = $state<QuickTask[]>([]);
let templates = $state<TaskTemplate[]>([]);
let error = $state<string | null>(null);
let availableProviders = $state<AvailableProviders | null>(null);
let providersLoading = $state(false);

let abortController: AbortController | null = null;

function generateId(): string {
  return crypto.randomUUID().slice(0, 12);
}

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

export const quickTask = {
  get isOpen() {
    return isOpen;
  },
  get isStreaming() {
    return isStreaming;
  },
  get currentResponse() {
    return currentResponse;
  },
  get statusMessage() {
    return statusMessage;
  },
  get currentTask() {
    return currentTask;
  },
  get history() {
    return history;
  },
  get templates() {
    return templates;
  },
  get error() {
    return error;
  },
  get availableProviders() {
    return availableProviders;
  },
  get providersLoading() {
    return providersLoading;
  },
  get hasCloudflare() {
    return availableProviders?.cloudflare?.available ?? false;
  },
  get hasDocker() {
    return availableProviders?.docker?.available ?? false;
  },

  open() {
    isOpen = true;
    error = null;
    this.loadProviders();
  },

  close() {
    isOpen = false;
    this.cancel();
  },

  toggle() {
    if (isOpen) {
      this.close();
    } else {
      this.open();
    }
  },

  async loadProviders() {
    if (availableProviders || providersLoading) return;
    
    providersLoading = true;
    try {
      const { baseUrl, token } = await getApiContext();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/v2/agents/providers`, {
        headers,
        credentials: "include",
      });
      if (response.ok) {
        availableProviders = await response.json();
      }
    } catch (e) {
      console.error("Failed to load providers:", e);
    } finally {
      providersLoading = false;
    }
  },

  async run(
    message: string,
    options?: {
      provider?: "docker" | "cloudflare";
      templateId?: string;
    }
  ) {
    const taskId = generateId();
    
    const providerToUse = options?.provider ?? 
      (availableProviders?.cloudflare?.available ? "cloudflare" : "docker");

    currentTask = {
      id: taskId,
      message,
      response: "",
      status: "pending",
      provider: providerToUse,
      templateId: options?.templateId,
      createdAt: new Date(),
    };

    isStreaming = true;
    currentResponse = "";
    statusMessage = "";
    error = null;

    abortController = new AbortController();

    try {
      const { baseUrl, token } = await getApiContext();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/v2/agents/task/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
        }),
        signal: abortController.signal,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      currentTask = { ...currentTask!, status: "streaming" };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const msg of messages) {
          if (!msg.trim()) continue;

          const lines = msg.split("\n");
          let eventData: SSEEvent | null = null;

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                eventData = JSON.parse(line.slice(6));
              } catch {
                console.warn("Failed to parse SSE data:", line);
              }
            }
          }

          if (!eventData) continue;

          switch (eventData.type) {
            case "start":
              statusMessage = "Starting...";
              break;

            case "status":
              statusMessage = eventData.message || "";
              break;

            case "chunk":
              if (eventData.content) {
                currentResponse += eventData.content;
              }
              break;

            case "done":
              currentTask = {
                ...currentTask!,
                status: "completed",
                response: currentResponse,
                completedAt: new Date(),
              };
              history = [currentTask!, ...history.slice(0, 49)];
              isStreaming = false;
              statusMessage = "";
              abortController = null;
              break;

            case "error":
              error = eventData.message || "An error occurred";
              currentTask = { ...currentTask!, status: "failed" };
              isStreaming = false;
              statusMessage = "";
              abortController = null;
              break;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        currentTask = { ...currentTask!, status: "failed" };
      } else {
        error = e instanceof Error ? e.message : "Failed to run task";
        currentTask = { ...currentTask!, status: "failed" };
      }
      isStreaming = false;
      statusMessage = "";
      abortController = null;
    }
  },

  cancel() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isStreaming = false;
    statusMessage = "";
    if (currentTask?.status === "streaming") {
      currentTask = { ...currentTask, status: "failed" };
    }
  },

  async loadTemplates() {
    try {
      const { baseUrl, token } = await getApiContext();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/v2/agents/templates`, {
        headers,
        credentials: "include",
      });
      if (response.ok) {
        templates = await response.json();
      }
    } catch (e) {
      console.error("Failed to load templates:", e);
    }
  },

  async loadHistory() {
    try {
      const { baseUrl, token } = await getApiContext();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/v2/agents/tasks?limit=50`, {
        headers,
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        history = data.tasks || [];
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  },

  applyTemplate(template: TaskTemplate, values: Record<string, string>): string {
    let prompt = template.prompt;
    for (const [key, value] of Object.entries(values)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    return prompt;
  },

  clear() {
    currentResponse = "";
    currentTask = null;
    statusMessage = "";
    error = null;
  },

  restoreFromHistory(task: QuickTask) {
    currentTask = task;
    currentResponse = task.response;
  },
};
