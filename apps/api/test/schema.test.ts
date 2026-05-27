import { describe, test, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase, createTestUser, createTestEvent } from "./helpers";
import * as schema from "../src/db/schema";

beforeEach(async () => {
  await cleanDatabase();
});

// closeDatabase() intentionally omitted — bun runs test files concurrently
// in the same process, so closing the shared client in afterAll would break
// other test files still running. The connection closes on process exit.

describe("users", () => {
  test("creates a user with required fields", async () => {
    const user = await createTestUser({ email: "alex@sfu.ca", name: "Alex Ng" });
    expect(user.email).toBe("alex@sfu.ca");
    expect(user.name).toBe("Alex Ng");
    expect(user.isSuper).toBe(false);
    expect(user.archived).toBe(false);
    expect(user.emailVerified).toBe(true);
    expect(user.deletedAt).toBeNull();
  });

  test("enforces unique email", async () => {
    await createTestUser({ email: "dupe@sfu.ca" });
    await expect(
      createTestUser({ email: "dupe@sfu.ca" })
    ).rejects.toThrow();
  });

  test("enforces unique google_id", async () => {
    await createTestUser({ googleId: "g-123" });
    await expect(
      createTestUser({ googleId: "g-123" })
    ).rejects.toThrow();
  });

  test("allows null password_hash for google-only users", async () => {
    const user = await createTestUser({ passwordHash: null, googleId: "g-456" });
    expect(user.passwordHash).toBeNull();
    expect(user.googleId).toBe("g-456");
  });
});

describe("events + members", () => {
  test("creates an event with a member", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    const [member] = await testDb
      .insert(schema.eventMembers)
      .values({
        eventId: event.id,
        userId: user.id,
        role: "super",
        canApprove: true,
      })
      .returning();

    expect(member.role).toBe("super");
    expect(member.canApprove).toBe(true);
  });

  test("enforces unique event+user membership", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    await testDb.insert(schema.eventMembers).values({
      eventId: event.id,
      userId: user.id,
      role: "write",
    });

    await expect(
      testDb.insert(schema.eventMembers).values({
        eventId: event.id,
        userId: user.id,
        role: "readonly",
      }).execute()
    ).rejects.toThrow();
  });

  test("creates event buckets with unique name per event", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    await testDb.insert(schema.eventBuckets).values({
      eventId: event.id,
      name: "bbq",
    });

    await expect(
      testDb.insert(schema.eventBuckets).values({
        eventId: event.id,
        name: "bbq",
      }).execute()
    ).rejects.toThrow();
  });

  test("allows same bucket name across different events", async () => {
    const user = await createTestUser();
    const event1 = await createTestEvent(user.id, { name: "Event 1" });
    const event2 = await createTestEvent(user.id, { name: "Event 2" });

    const [b1] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event1.id, name: "bbq" })
      .returning();
    const [b2] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event2.id, name: "bbq" })
      .returning();

    expect(b1.name).toBe("bbq");
    expect(b2.name).toBe("bbq");
    expect(b1.eventId).not.toBe(b2.eventId);
  });
});

describe("expenses", () => {
  test("creates an expense with all fields", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id, { grantMode: true });
    const [bucket] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event.id, name: "bbq" })
      .returning();
    const [category] = await testDb
      .insert(schema.grantCategories)
      .values({ eventId: event.id, name: "EVENT SPECIFIC SUPPLIES" })
      .returning();

    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Walmart Tools",
        amountCents: 10733,
        date: "2025-07-15",
        placeOfPurchase: "WALMART",
        status: "paid",
        bucketId: bucket.id,
        paidById: user.id,
        createdById: user.id,
        notes: "Brush, Spray, degreaser, thermometer, dawn detergent",
        motionNumber: 25,
        grantCategoryId: category.id,
        grantSubLabel: "BBQ",
      })
      .returning();

    expect(expense.amountCents).toBe(10733);
    expect(expense.motionNumber).toBe(25);
    expect(expense.grantSubLabel).toBe("BBQ");
  });

  test("creates expense with only required fields", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Pens",
        amountCents: 805,
        createdById: user.id,
      })
      .returning();

    expect(expense.status).toBe("outstanding");
    expect(expense.notes).toBeNull();
    expect(expense.bucketId).toBeNull();
    expect(expense.motionNumber).toBeNull();
  });

  test("attaches receipts to an expense", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);
    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Pizza Hike",
        amountCents: 26000,
        createdById: user.id,
      })
      .returning();

    const [receipt] = await testDb
      .insert(schema.expenseReceipts)
      .values({
        expenseId: expense.id,
        storageKey: "receipts/abc123.pdf",
        fileName: "dominos-receipt.pdf",
        fileSize: 54321,
        mimeType: "application/pdf",
        tag: "receipt",
        uploadedById: user.id,
      })
      .returning();

    expect(receipt.tag).toBe("receipt");
    expect(receipt.storageKey).toBe("receipts/abc123.pdf");
  });
});

describe("audit log", () => {
  test("logs an expense creation", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);
    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Test Expense",
        amountCents: 1000,
        createdById: user.id,
      })
      .returning();

    const [log] = await testDb
      .insert(schema.auditLog)
      .values({
        eventId: event.id,
        entityType: "expense",
        entityId: expense.id,
        action: "create",
        changes: {
          name: { old: null, new: "Test Expense" },
          amountCents: { old: null, new: 1000 },
        },
        performedById: user.id,
      })
      .returning();

    expect(log.action).toBe("create");
    expect(log.entityType).toBe("expense");
    expect((log.changes as any).name.new).toBe("Test Expense");
  });
});

describe("invite links", () => {
  test("creates invite link with domain restrictions", async () => {
    const user = await createTestUser({ isSuper: true });

    const [link] = await testDb
      .insert(schema.inviteLinks)
      .values({
        token: crypto.randomUUID(),
        createdById: user.id,
        maxUses: 50,
        defaultRole: "write",
        allowedEmailDomains: ["sfu.ca", "cs.sfu.ca"],
      })
      .returning();

    expect(link.allowedEmailDomains).toEqual(["sfu.ca", "cs.sfu.ca"]);
    expect(link.defaultRole).toBe("write");
    expect(link.currentUses).toBe(0);
  });
});
