import { describe, test, expect, beforeEach } from "bun:test";
import {
  testDb,
  cleanDatabase,
  createTestUser,
  createTestEvent,
} from "./helpers";
import * as schema from "../src/db/schema";
import { eq, and, isNull } from "drizzle-orm";

beforeEach(async () => {
  await cleanDatabase();
});

// closeDatabase() intentionally omitted — bun runs test files concurrently
// in the same process, so closing the shared client in afterAll would break
// other test files still running. The connection closes on process exit.

describe("expense CRUD", () => {
  test("creates an expense and soft-deletes it", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Test Expense",
        amountCents: 5000,
        createdById: user.id,
      })
      .returning();

    expect(expense.deletedAt).toBeNull();

    // Soft delete
    await testDb
      .update(schema.expenses)
      .set({ deletedAt: new Date() })
      .where(eq(schema.expenses.id, expense.id));

    // Should not appear in non-deleted query
    const active = await testDb
      .select()
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.eventId, event.id),
          isNull(schema.expenses.deletedAt)
        )
      );
    expect(active).toHaveLength(0);

    // But still exists in unfiltered query
    const all = await testDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.eventId, event.id));
    expect(all).toHaveLength(1);
    expect(all[0].deletedAt).not.toBeNull();
  });

  test("updates expense fields", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Original",
        amountCents: 1000,
        status: "outstanding",
        createdById: user.id,
      })
      .returning();

    const [updated] = await testDb
      .update(schema.expenses)
      .set({ name: "Updated", amountCents: 2000, status: "paid" })
      .where(eq(schema.expenses.id, expense.id))
      .returning();

    expect(updated.name).toBe("Updated");
    expect(updated.amountCents).toBe(2000);
    expect(updated.status).toBe("paid");
  });
});

describe("expense summary", () => {
  test("calculates totals by bucket", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    const [bucket1] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event.id, name: "bbq" })
      .returning();
    const [bucket2] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event.id, name: "hike" })
      .returning();

    await testDb.insert(schema.expenses).values([
      {
        eventId: event.id,
        name: "E1",
        amountCents: 1000,
        bucketId: bucket1.id,
        createdById: user.id,
      },
      {
        eventId: event.id,
        name: "E2",
        amountCents: 2000,
        bucketId: bucket1.id,
        createdById: user.id,
      },
      {
        eventId: event.id,
        name: "E3",
        amountCents: 3000,
        bucketId: bucket2.id,
        createdById: user.id,
      },
    ]);

    // Calculate manually (mirrors what the summary endpoint does)
    const allExpenses = await testDb
      .select()
      .from(schema.expenses)
      .where(
        and(
          eq(schema.expenses.eventId, event.id),
          isNull(schema.expenses.deletedAt)
        )
      );

    const bbqTotal = allExpenses
      .filter((e) => e.bucketId === bucket1.id)
      .reduce((sum, e) => sum + e.amountCents, 0);
    const hikeTotal = allExpenses
      .filter((e) => e.bucketId === bucket2.id)
      .reduce((sum, e) => sum + e.amountCents, 0);

    expect(bbqTotal).toBe(3000);
    expect(hikeTotal).toBe(3000);
    expect(allExpenses.reduce((s, e) => s + e.amountCents, 0)).toBe(6000);
  });
});
