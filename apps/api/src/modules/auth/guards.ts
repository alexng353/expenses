import { Elysia } from "elysia";
import { validateSession } from "./session";
import { db } from "../../db";
import { eventMembers } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";

async function resolveUser(cookie: any) {
  const token = cookie.session?.value as string | undefined;
  if (!token) return null;
  const result = await validateSession(token);
  if (!result) return null;
  if (result.user.archived) return null;
  return result.user;
}

export const authPlugin = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ cookie }) => {
    return { user: await resolveUser(cookie) };
  }
);

export const requireAuth = new Elysia({ name: "require-auth" }).derive(
  { as: "scoped" },
  async ({ cookie, set }) => {
    const user = await resolveUser(cookie);
    if (!user) {
      set.status = 401;
      return { user: null, _authFailed: true as const };
    }
    return { user, _authFailed: false as const };
  }
).onBeforeHandle({ as: "scoped" }, (ctx: any) => {
  if (ctx._authFailed) {
    return { error: "Authentication required" };
  }
});

export const requireSuper = new Elysia({ name: "require-super" }).derive(
  { as: "scoped" },
  async ({ cookie, set }) => {
    const user = await resolveUser(cookie);
    if (!user) {
      set.status = 401;
      return { user: null };
    }
    if (!user.isSuper) {
      set.status = 403;
      return { user };
    }
    return { user };
  }
).onBeforeHandle({ as: "scoped" }, (ctx: any) => {
  if (!ctx.user) return { error: "Authentication required" };
  if (!ctx.user.isSuper) return { error: "Platform admin access required" };
});

export function requireEventRole(
  ...roles: ("readonly" | "write" | "edit_others" | "super")[]
) {
  return new Elysia({ name: `require-event-role-${roles.join("-")}` })
    .derive({ as: "scoped" }, async ({ cookie, set, params }: any) => {
      const user = await resolveUser(cookie);
      if (!user) {
        set.status = 401;
        return { user: null, membership: null, _authFailed: true as const };
      }

      const eventId = params?.eventId;
      if (!eventId) {
        set.status = 400;
        return { user, membership: null, _authFailed: true as const };
      }

      if (user.isSuper) {
        return {
          user,
          membership: {
            role: "super" as const,
            canApprove: true,
            eventId,
            userId: user.id,
          },
          _authFailed: false as const,
        };
      }

      const [member] = await db
        .select()
        .from(eventMembers)
        .where(
          and(
            eq(eventMembers.eventId, eventId),
            eq(eventMembers.userId, user.id),
            isNull(eventMembers.deletedAt)
          )
        );

      if (!member || !roles.includes(member.role as any)) {
        set.status = 403;
        return { user, membership: null, _authFailed: true as const };
      }

      return { user, membership: member, _authFailed: false as const };
    })
    .onBeforeHandle({ as: "scoped" }, (ctx: any) => {
      if (ctx._authFailed) {
        if (!ctx.user) return { error: "Authentication required" };
        if (!ctx.membership) return { error: "Insufficient permissions for this event" };
      }
    });
}

export const requireApprover = new Elysia({ name: "require-approver" })
  .use(requireEventRole("write", "edit_others", "super"))
  .onBeforeHandle({ as: "scoped" }, (ctx: any) => {
    if (!ctx.user?.isSuper && ctx.membership && !ctx.membership.canApprove) {
      ctx.set.status = 403;
      return { error: "Approval permission required" };
    }
  });
