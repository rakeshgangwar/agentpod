import type { NodeSummary, DetectedStation, StationHealth, FsEntry } from "@agentpod/contract";

/** Resolves the hub base URL at call time so it reflects the runtime connection. */
function hubUrl(): string {
  const stored =
    typeof window !== "undefined" ? window.localStorage.getItem("agentpod.apiUrl") : null;
  return stored ?? import.meta.env.PUBLIC_HUB_URL ?? "http://localhost:3001";
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${hubUrl()}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Node endpoints ───────────────────────────────────────────────────────────

export const listNodes = () => http<NodeSummary[]>("/api/nodes");
export const createEnrollmentToken = () =>
  http<{ token: string; expiresAt: string }>("/api/enrollment-tokens", { method: "POST" });

// ─── Station row type (hub DB shape returned by listStations / adoptStations) ─

export type StationRow = {
  id: string;
  userId: string;
  nodeId: string;
  harness: string;
  stationKey: string;
  kind: string;
  parentStationId: string | null;
  displayName: string;
  workspacePath: string | null;
  capabilities: string[] | null;
  adoptedAt: string | Date;
  createdAt: string | Date;
};

// ─── Station endpoints ────────────────────────────────────────────────────────

export const listDetected = (nodeId: string) =>
  http<DetectedStation[]>(`/api/nodes/${nodeId}/detected`);

export const adoptStations = (nodeId: string, keys: string[]) =>
  http<StationRow[]>(`/api/nodes/${nodeId}/stations/adopt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });

export const listStations = (nodeId: string) =>
  http<StationRow[]>(`/api/nodes/${nodeId}/stations`);

export const stationHealth = (stationId: string) =>
  http<StationHealth>(`/api/stations/${stationId}/health`);

export const listFiles = (stationId: string, path: string) =>
  http<FsEntry[]>(`/api/stations/${stationId}/files?path=${encodeURIComponent(path)}`);

export async function readFile(
  stationId: string,
  path: string
): Promise<{ content: string; truncated: boolean }> {
  const res = await fetch(
    `${hubUrl()}/api/stations/${stationId}/file?path=${encodeURIComponent(path)}`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`GET /api/stations/${stationId}/file → ${res.status}`);
  return {
    content: await res.text(),
    truncated: res.headers.get("X-Truncated") === "true",
  };
}

export const logsUrl = (stationId: string) =>
  `${hubUrl()}/api/stations/${stationId}/logs`;

// ─── Station write endpoints ──────────────────────────────────────────────────

export const writeFile = (
  stationId: string,
  path: string,
  content: string,
  opts?: { backup?: boolean; encoding?: "utf8" | "base64" }
) =>
  http<{ bytesWritten: number; backupPath?: string | null }>(
    `/api/stations/${stationId}/fs/write`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        content,
        encoding: opts?.encoding ?? "utf8",
        ...(opts?.backup !== undefined ? { backup: opts.backup } : {}),
      }),
    }
  );

export const mkdir = (stationId: string, path: string) =>
  http<{ ok: boolean }>(`/api/stations/${stationId}/fs/mkdir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

export const move = (stationId: string, from: string, to: string) =>
  http<{ ok: boolean }>(`/api/stations/${stationId}/fs/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });

export const del = (stationId: string, path: string, opts?: { recursive?: boolean }) =>
  http<{ ok: boolean }>(`/api/stations/${stationId}/fs/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, ...(opts?.recursive !== undefined ? { recursive: opts.recursive } : {}) }),
  });
