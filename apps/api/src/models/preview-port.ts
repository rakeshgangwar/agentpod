import { db } from '../db/drizzle';
import { sandboxPreviewPorts } from '../db/schema/preview-ports';
import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '../utils/logger.ts';
import { nanoid } from 'nanoid';

const log = createLogger('preview-port-model');

export interface PreviewPort {
  id: string;
  sandboxId: string;
  port: number;
  label?: string;
  isPublic: boolean;
  publicToken?: string;
  publicExpiresAt?: Date;
  detectedFramework?: string;
  detectedProcess?: string;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePreviewPortInput {
  sandboxId: string;
  port: number;
  label?: string;
  detectedFramework?: string;
  detectedProcess?: string;
}

export interface UpdatePreviewPortInput {
  label?: string;
  isPublic?: boolean;
  publicToken?: string;
  publicExpiresAt?: Date;
  detectedFramework?: string;
  detectedProcess?: string;
  lastSeenAt?: Date;
}

function rowToPreviewPort(row: typeof sandboxPreviewPorts.$inferSelect): PreviewPort {
  return {
    id: row.id,
    sandboxId: row.sandboxId,
    port: row.port,
    label: row.label ?? undefined,
    isPublic: row.isPublic ?? false,
    publicToken: row.publicToken ?? undefined,
    publicExpiresAt: row.publicExpiresAt ?? undefined,
    detectedFramework: row.detectedFramework ?? undefined,
    detectedProcess: row.detectedProcess ?? undefined,
    lastSeenAt: row.lastSeenAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createPreviewPort(input: CreatePreviewPortInput): Promise<PreviewPort> {
  const now = new Date();
  const id = nanoid();

  const rows = await db
    .insert(sandboxPreviewPorts)
    .values({
      id,
      sandboxId: input.sandboxId,
      port: input.port,
      label: input.label ?? null,
      detectedFramework: input.detectedFramework ?? null,
      detectedProcess: input.detectedProcess ?? null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create preview port');
  }

  log.info('Created preview port', { sandboxId: input.sandboxId, port: input.port });
  return rowToPreviewPort(row);
}

export async function getPreviewPortById(id: string): Promise<PreviewPort | null> {
  const [row] = await db
    .select()
    .from(sandboxPreviewPorts)
    .where(eq(sandboxPreviewPorts.id, id));

  return row ? rowToPreviewPort(row) : null;
}

export async function getPreviewPortByPort(sandboxId: string, port: number): Promise<PreviewPort | null> {
  const [row] = await db
    .select()
    .from(sandboxPreviewPorts)
    .where(and(
      eq(sandboxPreviewPorts.sandboxId, sandboxId),
      eq(sandboxPreviewPorts.port, port)
    ));

  return row ? rowToPreviewPort(row) : null;
}

export async function getPreviewPortByPublicToken(token: string): Promise<PreviewPort | null> {
  const [row] = await db
    .select()
    .from(sandboxPreviewPorts)
    .where(eq(sandboxPreviewPorts.publicToken, token));

  return row ? rowToPreviewPort(row) : null;
}

export async function listPreviewPortsBySandbox(sandboxId: string): Promise<PreviewPort[]> {
  const rows = await db
    .select()
    .from(sandboxPreviewPorts)
    .where(eq(sandboxPreviewPorts.sandboxId, sandboxId))
    .orderBy(desc(sandboxPreviewPorts.lastSeenAt));

  return rows.map(rowToPreviewPort);
}

export async function updatePreviewPort(
  sandboxId: string,
  port: number,
  input: UpdatePreviewPortInput
): Promise<PreviewPort | null> {
  const existing = await getPreviewPortByPort(sandboxId, port);
  if (!existing) return null;

  const updateData: Partial<typeof sandboxPreviewPorts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.label !== undefined) updateData.label = input.label ?? null;
  if (input.isPublic !== undefined) updateData.isPublic = input.isPublic;
  if (input.publicToken !== undefined) updateData.publicToken = input.publicToken ?? null;
  if (input.publicExpiresAt !== undefined) updateData.publicExpiresAt = input.publicExpiresAt ?? null;
  if (input.detectedFramework !== undefined) updateData.detectedFramework = input.detectedFramework ?? null;
  if (input.detectedProcess !== undefined) updateData.detectedProcess = input.detectedProcess ?? null;
  if (input.lastSeenAt !== undefined) updateData.lastSeenAt = input.lastSeenAt ?? null;

  const [row] = await db
    .update(sandboxPreviewPorts)
    .set(updateData)
    .where(and(
      eq(sandboxPreviewPorts.sandboxId, sandboxId),
      eq(sandboxPreviewPorts.port, port)
    ))
    .returning();

  log.info('Updated preview port', { sandboxId, port, updates: Object.keys(input) });
  return row ? rowToPreviewPort(row) : null;
}

export async function touchPreviewPort(sandboxId: string, port: number): Promise<void> {
  await db
    .update(sandboxPreviewPorts)
    .set({ lastSeenAt: new Date() })
    .where(and(
      eq(sandboxPreviewPorts.sandboxId, sandboxId),
      eq(sandboxPreviewPorts.port, port)
    ));
}

export async function deletePreviewPort(sandboxId: string, port: number): Promise<boolean> {
  const result = await db
    .delete(sandboxPreviewPorts)
    .where(and(
      eq(sandboxPreviewPorts.sandboxId, sandboxId),
      eq(sandboxPreviewPorts.port, port)
    ))
    .returning({ id: sandboxPreviewPorts.id });

  if (result.length > 0) {
    log.info('Deleted preview port', { sandboxId, port });
    return true;
  }
  return false;
}

export async function deletePreviewPortsBySandbox(sandboxId: string): Promise<number> {
  const result = await db
    .delete(sandboxPreviewPorts)
    .where(eq(sandboxPreviewPorts.sandboxId, sandboxId))
    .returning({ id: sandboxPreviewPorts.id });

  if (result.length > 0) {
    log.info('Deleted sandbox preview ports', { sandboxId, count: result.length });
  }
  return result.length;
}

export async function upsertPreviewPort(input: CreatePreviewPortInput): Promise<PreviewPort> {
  const existing = await getPreviewPortByPort(input.sandboxId, input.port);
  
  if (existing) {
    const updated = await updatePreviewPort(input.sandboxId, input.port, {
      label: input.label,
      detectedFramework: input.detectedFramework,
      detectedProcess: input.detectedProcess,
      lastSeenAt: new Date(),
    });
    // Handle race condition where port was deleted between check and update
    if (!updated) {
      return createPreviewPort(input);
    }
    return updated;
  }
  
  return createPreviewPort(input);
}

export async function generatePublicToken(sandboxId: string, port: number, expiresIn?: string): Promise<{
  token: string;
  expiresAt: Date | null;
}> {
  const token = nanoid(32);
  let expiresAt: Date | null = null;
  
  if (expiresIn) {
    expiresAt = calculateExpiration(expiresIn);
  }
  
  await updatePreviewPort(sandboxId, port, {
    isPublic: true,
    publicToken: token,
    publicExpiresAt: expiresAt ?? undefined,
  });
  
  log.info('Generated public token for preview port', { sandboxId, port, expiresAt });
  return { token, expiresAt };
}

export async function revokePublicToken(sandboxId: string, port: number): Promise<void> {
  await updatePreviewPort(sandboxId, port, {
    isPublic: false,
    publicToken: undefined,
    publicExpiresAt: undefined,
  });
  
  log.info('Revoked public token for preview port', { sandboxId, port });
}

function calculateExpiration(expiresIn: string): Date {
  const now = new Date();
  const match = expiresIn.match(/^(\d+)([hdwm])$/);
  
  if (!match) {
    throw new Error(`Invalid expiration format: ${expiresIn}. Use format like "24h", "7d", "1w", "1m"`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 'h':
      now.setHours(now.getHours() + value);
      break;
    case 'd':
      now.setDate(now.getDate() + value);
      break;
    case 'w':
      now.setDate(now.getDate() + value * 7);
      break;
    case 'm':
      now.setMonth(now.getMonth() + value);
      break;
  }
  
  return now;
}
