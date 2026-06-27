import type { NodeSummary } from "@agentpod/contract";

const HUB = import.meta.env.PUBLIC_HUB_URL ?? "http://localhost:3001";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HUB}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const listNodes = () => http<NodeSummary[]>("/api/nodes");
export const createEnrollmentToken = () =>
  http<{ token: string; expiresAt: string }>("/api/enrollment-tokens", { method: "POST" });
