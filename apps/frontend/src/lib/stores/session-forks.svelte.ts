import * as api from "$lib/api/tauri";
import type {
  SessionFork,
  SessionBranch,
  ListForksResponse,
  ForkStatistics,
  BranchesResponse,
  ForkInfoResponse,
} from "$lib/api/tauri";

let forks = $state<SessionFork[]>([]);
let rootSessions = $state<string[]>([]);
let statistics = $state<ForkStatistics | null>(null);
let sessionBranches = $state<Map<string, SessionBranch[]>>(new Map());
let currentBranches = $state<Map<string, SessionBranch | null>>(new Map());
let forkInfo = $state<Map<string, ForkInfoResponse>>(new Map());
let ancestry = $state<Map<string, string[]>>(new Map());
let children = $state<Map<string, SessionFork[]>>(new Map());

let isLoadingForks = $state(false);
let isLoadingStatistics = $state(false);
let isLoadingBranches = $state(false);
let isCreatingFork = $state(false);
let error = $state<string | null>(null);

let activeSandboxId = $state<string | null>(null);

export const sessionForksStore = {
  get forks() { return forks; },
  get rootSessions() { return rootSessions; },
  get statistics() { return statistics; },
  get isLoadingForks() { return isLoadingForks; },
  get isLoadingStatistics() { return isLoadingStatistics; },
  get isLoadingBranches() { return isLoadingBranches; },
  get isCreatingFork() { return isCreatingFork; },
  get error() { return error; },
  get activeSandboxId() { return activeSandboxId; },
  
  getBranches(sessionId: string): SessionBranch[] {
    return sessionBranches.get(sessionId) ?? [];
  },
  
  getCurrentBranch(sessionId: string): SessionBranch | null {
    return currentBranches.get(sessionId) ?? null;
  },
  
  getForkInfo(sessionId: string): ForkInfoResponse | undefined {
    return forkInfo.get(sessionId);
  },
  
  getAncestry(sessionId: string): string[] {
    return ancestry.get(sessionId) ?? [];
  },
  
  getChildren(sessionId: string): SessionFork[] {
    return children.get(sessionId) ?? [];
  },
  
  getFork(sessionId: string): SessionFork | undefined {
    return forks.find(f => f.id === sessionId);
  },
  
  get hasForks() { return forks.length > 0; },
  get forkCount() { return forks.length; },
};

export function setActiveSandbox(sandboxId: string | null) {
  if (sandboxId !== activeSandboxId) {
    clearForkState();
  }
  activeSandboxId = sandboxId;
}

export function clearForkState() {
  forks = [];
  rootSessions = [];
  statistics = null;
  sessionBranches = new Map();
  currentBranches = new Map();
  forkInfo = new Map();
  ancestry = new Map();
  children = new Map();
  error = null;
}

export async function fetchForks(sandboxId?: string): Promise<ListForksResponse | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    error = "No sandbox ID provided";
    return null;
  }

  isLoadingForks = true;
  error = null;

  try {
    const response = await api.listSessionForks(id);
    forks = response.forks;
    rootSessions = response.rootSessions;
    return response;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch forks";
    console.error("Failed to fetch forks:", e);
    return null;
  } finally {
    isLoadingForks = false;
  }
}

export async function fetchStatistics(sandboxId?: string): Promise<ForkStatistics | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    error = "No sandbox ID provided";
    return null;
  }

  isLoadingStatistics = true;
  error = null;

  try {
    statistics = await api.getForkStatistics(id);
    return statistics;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch statistics";
    console.error("Failed to fetch fork statistics:", e);
    return null;
  } finally {
    isLoadingStatistics = false;
  }
}

export async function createFork(
  sessionId: string,
  options?: {
    messageId?: string;
    messageRole?: 'user' | 'assistant';
    reason?: string;
    tags?: string[];
  },
  sandboxId?: string
): Promise<SessionFork | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    error = "No sandbox ID provided";
    return null;
  }

  isCreatingFork = true;
  error = null;

  try {
    const fork = await api.createSessionFork(
      id,
      sessionId,
      options?.messageId,
      options?.messageRole,
      options?.reason,
      options?.tags
    );
    await fetchForks(id);
    return fork;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to create fork";
    console.error("Failed to create fork:", e);
    return null;
  } finally {
    isCreatingFork = false;
  }
}

export async function fetchSessionAncestry(
  sessionId: string,
  sandboxId?: string
): Promise<string[]> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return [];

  try {
    const path = await api.getSessionAncestry(id, sessionId);
    ancestry = new Map(ancestry).set(sessionId, path);
    return path;
  } catch (e) {
    console.error("Failed to fetch ancestry:", e);
    return [];
  }
}

export async function fetchSessionChildren(
  sessionId: string,
  sandboxId?: string
): Promise<SessionFork[]> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return [];

  try {
    const sessionChildren = await api.getSessionChildren(id, sessionId);
    children = new Map(children).set(sessionId, sessionChildren);
    return sessionChildren;
  } catch (e) {
    console.error("Failed to fetch children:", e);
    return [];
  }
}

export async function fetchSessionBranches(
  sessionId: string,
  sandboxId?: string
): Promise<BranchesResponse | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return null;

  isLoadingBranches = true;

  try {
    const response = await api.getSessionBranches(id, sessionId);
    sessionBranches = new Map(sessionBranches).set(sessionId, response.branches);
    currentBranches = new Map(currentBranches).set(sessionId, response.currentBranch ?? null);
    return response;
  } catch (e) {
    console.error("Failed to fetch session branches:", e);
    return null;
  } finally {
    isLoadingBranches = false;
  }
}

export async function fetchForkInfo(
  sessionId: string,
  sandboxId?: string
): Promise<ForkInfoResponse | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return null;

  try {
    const info = await api.getSessionForkInfo(id, sessionId);
    forkInfo = new Map(forkInfo).set(sessionId, info);
    ancestry = new Map(ancestry).set(sessionId, info.ancestry);
    return info;
  } catch (e) {
    console.error("Failed to fetch fork info:", e);
    return null;
  }
}

export async function addTag(
  sessionId: string,
  tag: string,
  sandboxId?: string
): Promise<string[] | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return null;

  try {
    const tags = await api.addSessionTag(id, sessionId, tag);
    const fork = forks.find(f => f.id === sessionId);
    if (fork) {
      fork.tags = tags;
      forks = [...forks];
    }
    return tags;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to add tag";
    console.error("Failed to add tag:", e);
    return null;
  }
}

export async function removeTag(
  sessionId: string,
  tag: string,
  sandboxId?: string
): Promise<string[] | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return null;

  try {
    const tags = await api.removeSessionTag(id, sessionId, tag);
    const fork = forks.find(f => f.id === sessionId);
    if (fork) {
      fork.tags = tags;
      forks = [...forks];
    }
    return tags;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to remove tag";
    console.error("Failed to remove tag:", e);
    return null;
  }
}

export async function setTags(
  sessionId: string,
  tags: string[],
  sandboxId?: string
): Promise<string[] | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return null;

  try {
    const newTags = await api.setSessionTags(id, sessionId, tags);
    const fork = forks.find(f => f.id === sessionId);
    if (fork) {
      fork.tags = newTags;
      forks = [...forks];
    }
    return newTags;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to set tags";
    console.error("Failed to set tags:", e);
    return null;
  }
}

export async function refreshAll(sandboxId?: string): Promise<void> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return;

  await Promise.all([
    fetchForks(id),
    fetchStatistics(id),
  ]);
}
