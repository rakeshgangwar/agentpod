/**
 * Fleet-era runtime provisioning service (P4 Task 8).
 *
 * Orchestrates the full lifecycle of a provisioned runtime:
 *   create → mint-token → provision-driver → persist externalId
 *   destroy → driver.destroy → mark destroyed
 *   start / stop → driver.start/stop (guard on capability)
 *
 * Error semantics for routes:
 *   - "provider disabled: X"     → 400 (user chose a disabled provider)
 *   - "provider not registered"  → 400 (same surface — misconfigured)
 *   - "unsupported operation"    → 400 (start/stop not supported by driver)
 *   - "not found"                → 404
 *   - driver provision() throw   → status set to "error"; rethrow (→ 502)
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { provisionedRuntimes } from "../db/schema/nodes";
import { mintEnrollmentToken } from "./enrollment";
import {
  getProvisioner,
  enabledProviders,
  isProviderEnabled,
} from "./provisioner/registry";
import type { ProvisionedRuntime } from "@agentpod/contract";
import type { RuntimeProviderName } from "./provisioner/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const prefixedId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

type RuntimeRow = typeof provisionedRuntimes.$inferSelect;

function toContract(row: RuntimeRow): ProvisionedRuntime {
  return {
    id: row.id,
    ownerId: row.userId,
    provider: row.provider as ProvisionedRuntime["provider"],
    externalId: row.externalId ?? null,
    status: row.status as ProvisionedRuntime["status"],
    nodeId: row.nodeId ?? null,
    name: row.name,
    resourceTier: row.resourceTier as ProvisionedRuntime["resourceTier"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Create a new provisioned runtime for the user.
 *
 * Flow:
 *   1. Validate the provider is enabled.
 *   2. Insert a `provisioning` row.
 *   3. Mint a one-time enrollment token linked to the row.
 *   4. Call the driver's provision() — injects hubUrl + token into the container env.
 *   5. On success: persist externalId.
 *   6. On driver failure: set status to "error" then rethrow.
 */
export async function createRuntime(
  userId: string,
  req: { provider: string; name: string; resourceTier: string },
  hubUrl: string
): Promise<ProvisionedRuntime> {
  const provider = req.provider;

  // Guard — throws with "provider disabled: X" or "unknown provider: X"
  if (!isProviderEnabled(provider as RuntimeProviderName)) {
    throw Object.assign(
      new Error(`provider disabled: ${provider}`),
      { status: 400 }
    );
  }

  const id = prefixedId("rt");
  const now = new Date();

  await db.insert(provisionedRuntimes).values({
    id,
    userId,
    provider,
    status: "provisioning",
    name: req.name,
    resourceTier: req.resourceTier ?? "small",
    externalId: null,
    nodeId: null,
    createdAt: now,
    updatedAt: now,
  });

  // Mint a short-lived enrollment token linked to this runtime.
  // The node-agent container will use it to self-enroll and flip the runtime online.
  const { token: enrollToken } = await mintEnrollmentToken(userId, {
    provisionedRuntimeId: id,
    ttlMs: 30 * 60 * 1000, // 30-minute window for the container to boot and enroll
  });

  let provisioner: ReturnType<typeof getProvisioner>;
  try {
    provisioner = getProvisioner(provider);
  } catch (err) {
    // Driver not registered (env flag on but no driver wired) → 400
    await db
      .update(provisionedRuntimes)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(provisionedRuntimes.id, id));
    throw Object.assign(err as Error, { status: 400 });
  }

  try {
    const { externalId } = await provisioner.provision({
      runtimeId: id,
      name: req.name,
      resourceTier: (req.resourceTier ?? "small") as "small" | "medium" | "large",
      hubUrl,
      enrollToken,
    });

    await db
      .update(provisionedRuntimes)
      .set({ externalId, updatedAt: new Date() })
      .where(eq(provisionedRuntimes.id, id));

    const [row] = await db
      .select()
      .from(provisionedRuntimes)
      .where(eq(provisionedRuntimes.id, id));

    return toContract(row!);
  } catch (err) {
    await db
      .update(provisionedRuntimes)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(provisionedRuntimes.id, id));
    // Surface as 502 — the driver (external system) failed
    throw Object.assign(err as Error, { status: 502 });
  }
}

/**
 * List all provisioned runtimes for a user.
 */
export async function listRuntimes(userId: string): Promise<ProvisionedRuntime[]> {
  const rows = await db
    .select()
    .from(provisionedRuntimes)
    .where(eq(provisionedRuntimes.userId, userId));

  return rows.map(toContract);
}

/**
 * Get a single runtime, owner-scoped. Returns null if not found or wrong user.
 */
export async function getRuntime(
  userId: string,
  id: string
): Promise<ProvisionedRuntime | null> {
  const [row] = await db
    .select()
    .from(provisionedRuntimes)
    .where(
      and(eq(provisionedRuntimes.id, id), eq(provisionedRuntimes.userId, userId))
    );

  return row ? toContract(row) : null;
}

/**
 * Permanently destroy a runtime and mark it destroyed in the DB.
 * Throws 404 if not found or owned by another user.
 * Throws 502 if the driver destroy() fails.
 */
export async function destroyRuntime(userId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(provisionedRuntimes)
    .where(
      and(eq(provisionedRuntimes.id, id), eq(provisionedRuntimes.userId, userId))
    );

  if (!row) {
    throw Object.assign(new Error("runtime not found"), { status: 404 });
  }

  if (row.externalId) {
    const provisioner = getProvisioner(row.provider);
    try {
      await provisioner.destroy(row.externalId);
    } catch (err) {
      throw Object.assign(err as Error, { status: 502 });
    }
  }

  await db
    .update(provisionedRuntimes)
    .set({ status: "destroyed", updatedAt: new Date() })
    .where(eq(provisionedRuntimes.id, id));
}

/**
 * Start a stopped runtime. Throws 400 if the driver has no start() support.
 */
export async function startRuntime(userId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(provisionedRuntimes)
    .where(
      and(eq(provisionedRuntimes.id, id), eq(provisionedRuntimes.userId, userId))
    );

  if (!row) {
    throw Object.assign(new Error("runtime not found"), { status: 404 });
  }

  const provisioner = getProvisioner(row.provider);
  if (!provisioner.start) {
    throw Object.assign(
      new Error(`provider ${row.provider} does not support start`),
      { status: 400 }
    );
  }

  if (!row.externalId) {
    throw Object.assign(new Error("runtime has no external id"), { status: 400 });
  }

  await provisioner.start(row.externalId);

  await db
    .update(provisionedRuntimes)
    .set({ status: "online", updatedAt: new Date() })
    .where(eq(provisionedRuntimes.id, id));
}

/**
 * Stop a running runtime. Throws 400 if the driver has no stop() support.
 */
export async function stopRuntime(userId: string, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(provisionedRuntimes)
    .where(
      and(eq(provisionedRuntimes.id, id), eq(provisionedRuntimes.userId, userId))
    );

  if (!row) {
    throw Object.assign(new Error("runtime not found"), { status: 404 });
  }

  const provisioner = getProvisioner(row.provider);
  if (!provisioner.stop) {
    throw Object.assign(
      new Error(`provider ${row.provider} does not support stop`),
      { status: 400 }
    );
  }

  if (!row.externalId) {
    throw Object.assign(new Error("runtime has no external id"), { status: 400 });
  }

  await provisioner.stop(row.externalId);

  await db
    .update(provisionedRuntimes)
    .set({ status: "stopped", updatedAt: new Date() })
    .where(eq(provisionedRuntimes.id, id));
}

// Re-export for convenience (routes use this)
export { enabledProviders };
