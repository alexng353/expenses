import { Elysia } from "elysia";
import { validateSession } from "./session";
import { db } from "../../db";
import { eventMembers } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";

export const authPlugin = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ cookie }) => {
    const token = cookie.session?.value as string | undefined;
    if (!token) return { user: null };

    const result = await validateSession(token);
    if (!result) return { user: null };
    if (result.user.archived) return { user: null };

    return { user: result.user };
  }
);

export const requireAuth = new Elysia({ name: "require-auth" })
  .use(authPlugin)
  .onBeforeHandle({ as: "scoped" }, (ctx: any) => {
    if (!ctx.user) {
      ctx.set.status = 401;
      return { error: "Authentication required" };
    }
  });

export const requireSuper = new Elysia({ name: "require-super" })
  .use(requireAuth)
  .onBeforeHandle({ as: "scoped" }, (ctx: any) => {
    if (!ctx.user?.isSuper) {
      ctx.set.status = 403;
      return { error: "Platform admin access required" };
    }
  });

export function requireEventRole(
  ...roles: ("readonly" | "write" | "edit_others" | "super")[]
) {
  return new Elysia({ name: `require-event-role-${roles.join("-")}` })
    .use(requireAuth)
    .derive({ as: "scoped" }, async (ctx: any) => {
      const eventId = ctx.params?.eventId;
      if (!eventId) {
        ctx.set.status = 400;
        return { error: "Missing eventId", membership: null };
      }

      if (ctx.user!.isSuper) {
        return {
          membership: {
            role: "super" as const,
            canApprove: true,
            eventId,
            userId: ctx.user!.id,
          },
        };
      }

      const [member] = await db
        .select()
        .from(eventMembers)
        .where(
          and(
            eq(eventMembers.eventId, eventId),
            eq(eventMembers.userId, ctx.user!.id),
            isNull(eventMembers.deletedAt)
          )
        );

      if (!member || !roles.includes(member.role as any)) {
        ctx.set.status = 403;
        return { error: "Insufficient permissions for this event", membership: null };
      }

      return { membership: member };
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
