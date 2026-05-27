import { db } from "../db";
import { auditLog } from "../db/schema";

interface AuditEntry {
  eventId?: string | null;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete" | "restore";
  changes: Record<string, { old: unknown; new: unknown }> | null;
  performedById: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    eventId: entry.eventId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changes: entry.changes,
    performedById: entry.performedById,
  });
}

export function diffFields<T extends Record<string, unknown>>(
  old: T,
  updated: Partial<T>
): Record<string, { old: unknown; new: unknown }> | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, newVal] of Object.entries(updated)) {
    const oldVal = old[key];
    if (oldVal !== newVal) {
      changes[key] = { old: oldVal, new: newVal };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export function snapshotCreate<T extends Record<string, unknown>>(
  entity: T
): Record<string, { old: null; new: unknown }> {
  const changes: Record<string, { old: null; new: unknown }> = {};
  for (const [key, val] of Object.entries(entity)) {
    if (val !== undefined) {
      changes[key] = { old: null, new: val };
    }
  }
  return changes;
}

export function snapshotDelete<T extends Record<string, unknown>>(
  entity: T
): Record<string, { old: unknown; new: null }> {
  const changes: Record<string, { old: unknown; new: null }> = {};
  for (const [key, val] of Object.entries(entity)) {
    if (val !== undefined) {
      changes[key] = { old: val, new: null };
    }
  }
  return changes;
}
