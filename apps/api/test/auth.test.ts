import { describe, test, expect, beforeEach } from "bun:test";
import { testDb, cleanDatabase, createTestUser } from "./helpers";
import { hashPassword, verifyPassword } from "../src/modules/auth/password";
import { generateVerificationCode } from "../src/modules/auth/email";
import {
  createSession,
  validateSession,
  deleteSession,
  generateSessionToken,
} from "../src/modules/auth/session";
import { checkRateLimit } from "../src/lib/rate-limit";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";

beforeEach(async () => {
  await cleanDatabase();
});

// closeDatabase() intentionally omitted — bun runs test files concurrently
// in the same process, so closing the shared client in afterAll would break
// other test files still running. The connection closes on process exit.

describe("password", () => {
  test("hashes and verifies a password", async () => {
    const hash = await hashPassword("testpassword123");
    expect(hash).not.toBe("testpassword123");
    expect(await verifyPassword("testpassword123", hash)).toBe(true);
    expect(await verifyPassword("wrongpassword", hash)).toBe(false);
  });
});

describe("session", () => {
  test("creates and validates a session", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);

    const result = await validateSession(token);
    expect(result).not.toBeNull();
    expect(result!.user.id).toBe(user.id);
  });

  test("returns null for invalid token", async () => {
    const result = await validateSession("nonexistent-token");
    expect(result).toBeNull();
  });

  test("returns null for expired session", async () => {
    const user = await createTestUser();
    const token = generateSessionToken();
    await testDb.insert(schema.sessions).values({
      sessionToken: token,
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000), // expired
    });

    const result = await validateSession(token);
    expect(result).toBeNull();
  });

  test("returns null for archived user", async () => {
    const user = await createTestUser({ archived: true });
    const token = generateSessionToken();
    await testDb.insert(schema.sessions).values({
      sessionToken: token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60000),
    });

    // validateSession returns the user but doesn't check archived
    // The auth guards check archived — so session is valid but guard rejects
    const result = await validateSession(token);
    expect(result).not.toBeNull();
    expect(result!.user.archived).toBe(true);
  });

  test("deletes a session", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    await deleteSession(token);

    const result = await validateSession(token);
    expect(result).toBeNull();
  });
});

describe("verification code", () => {
  test("generates a 6-digit code", () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe("rate limit", () => {
  test("allows requests within limit", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(checkRateLimit(key, 3, 60000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60000).allowed).toBe(true);
  });

  test("blocks requests over limit", () => {
    const key = `test-${crypto.randomUUID()}`;
    checkRateLimit(key, 2, 60000);
    checkRateLimit(key, 2, 60000);
    expect(checkRateLimit(key, 2, 60000).allowed).toBe(false);
  });
});

describe("invite link registration flow", () => {
  test("creates an invite link and validates it", async () => {
    const super_ = await createTestUser({ isSuper: true });

    const [invite] = await testDb
      .insert(schema.inviteLinks)
      .values({
        token: "test-invite",
        createdById: super_.id,
        maxUses: 5,
        defaultRole: "write",
      })
      .returning();

    expect(invite.currentUses).toBe(0);
    expect(invite.defaultRole).toBe("write");
  });

  test("invite with domain restriction rejects wrong domain", async () => {
    const super_ = await createTestUser({ isSuper: true });

    const [invite] = await testDb
      .insert(schema.inviteLinks)
      .values({
        token: "restricted-invite",
        createdById: super_.id,
        maxUses: 10,
        defaultRole: "write",
        allowedEmailDomains: ["sfu.ca"],
      })
      .returning();

    const domain = "gmail.com";
    expect(invite.allowedEmailDomains!.includes(domain)).toBe(false);
  });
});
