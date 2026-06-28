/**
 * Audit service — records terminal and write-op events to station_audit.
 *
 * The body is filled in P2 Task 6.  Until then every call is a no-op so the
 * rest of the codebase can wire up audit calls without a forward dependency.
 */

export interface AuditArgs {
  userId: string;
  nodeId: string;
  stationKey: string;
  verb: string;
  params: Record<string, unknown>;
}

export interface AuditHandle {
  done(result: "ok" | "error", error?: string): Promise<void>;
}

// filled in P2 Task 6
export async function recordAudit(_args: AuditArgs): Promise<AuditHandle> {
  return { done: async () => {} };
}
