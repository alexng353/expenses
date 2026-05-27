import { randomBytes } from "crypto";
import { db } from "../../db";
import { sessions, users } from "../../db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import type { Cookie } from "elysia";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ sessionToken: token, userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSession(token: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.sessionToken, token), gt(sessions.expiresAt, new Date()))
    );
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), isNull(users.deletedAt)));
  if (!user) return null;

  return { session, user };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.sessionToken, token));
}

export function setSessionCookie(
  cookie: Record<string, Cookie<any>>,
  token: string,
  expiresAt: Date
) {
  cookie.session!.set({
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(
  cookie: Record<string, Cookie<any>>
) {
  cookie.session!.remove();
}
