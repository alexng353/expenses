import { describe, test, expect, beforeEach } from "bun:test";
import {
  testDb,
  cleanDatabase,
  createTestUser,
  createTestEvent,
} from "./helpers";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, diffFields, snapshotCreate } from "../src/lib/audit";

beforeEach(async () => {
  await cleanDatabase();
});

// closeDatabase() intentionally omitted — bun runs test files concurrently
// in the same process, so closing the shared client in afterAll would break
// other test files still running. The connection closes on process exit.

describe("audit helpers", () => {
  test("diffFields detects changed fields", () => {
    const old = { name: "Pizza", amountCents: 26000, notes: "hello" };
    const updated = { name: "Pizza Hike", amountCents: 26000 };
    const diff = diffFields(old, updated);
    expect(diff).toEqual({
      name: { old: "Pizza", new: "Pizza Hike" },
    });
  });

  test("diffFields returns null when nothing changed", () => {
    const old = { name: "Pizza", amountCents: 26000 };
    const updated = { name: "Pizza", amountCents: 26000 };
    expect(diffFields(old, updated)).toBeNull();
  });

  test("snapshotCreate captures all fields", () => {
    const entity = { name: "Test", amountCents: 1000 };
    const snap = snapshotCreate(entity);
    expect(snap.name).toEqual({ old: null, new: "Test" });
    expect(snap.amountCents).toEqual({ old: null, new: 1000 });
  });

  test("logAudit writes to audit_log table", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    await logAudit({
      eventId: event.id,
      entityType: "event",
      entityId: event.id,
      action: "create",
      changes: { name: { old: null, new: event.name } },
      performedById: user.id,
    });

    const [entry] = await testDb
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, event.id));

    expect(entry.action).toBe("create");
    expect(entry.entityType).toBe("event");
  });
});

describe("event membership RBAC", () => {
  test("creates members with different roles", async () => {
    const super_ = await createTestUser({ isSuper: true });
    const writer = await createTestUser();
    const reader = await createTestUser();
    const event = await createTestEvent(super_.id);

    await testDb.insert(schema.eventMembers).values([
      {
        eventId: event.id,
        userId: super_.id,
        role: "super",
        canApprove: true,
      },
      {
        eventId: event.id,
        userId: writer.id,
        role: "write",
        canApprove: false,
      },
      {
        eventId: event.id,
        userId: reader.id,
        role: "readonly",
        canApprove: false,
      },
    ]);

    const members = await testDb
      .select()
      .from(schema.eventMembers)
      .where(eq(schema.eventMembers.eventId, event.id));

    expect(members).toHaveLength(3);
    expect(members.find((m) => m.userId === super_.id)!.role).toBe("super");
    expect(members.find((m) => m.userId === writer.id)!.role).toBe("write");
    expect(members.find((m) => m.userId === reader.id)!.role).toBe("readonly");
  });
});
