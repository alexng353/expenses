import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://expense:expense@localhost:5555/expense_tracker_test";

const client = postgres(TEST_DATABASE_URL);
export const testDb = drizzle(client, { schema });

export async function cleanDatabase() {
  await testDb.execute(sql`
    TRUNCATE TABLE audit_log, expense_receipts, expenses,
      grant_categories, event_members, event_buckets, events,
      invite_links, email_codes, sessions, users
    CASCADE
  `);
}

let closed = false;
export async function closeDatabase() {
  if (closed) return;
  closed = true;
  await client.end();
}

export async function createTestUser(
  overrides: Partial<typeof schema.users.$inferInsert> = {}
) {
  const [user] = await testDb
    .insert(schema.users)
    .values({
      email: `test-${crypto.randomUUID()}@test.com`,
      name: "Test User",
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return user;
}

export async function createTestEvent(
  createdById: string,
  overrides: Partial<typeof schema.events.$inferInsert> = {}
) {
  const [event] = await testDb
    .insert(schema.events)
    .values({
      name: "Test Event",
      createdById,
      ...overrides,
    })
    .returning();
  return event;
}
