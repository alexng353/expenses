import { Elysia, t } from "elysia";
import { db } from "../../db";
import { auditLog, users } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireEventRole } from "../auth/guards";

export const auditModule = new Elysia({
  prefix: "/events/:eventId/audit",
})
  .use(requireEventRole("super"))

  // List audit log for event
  .get(
    "/",
    async ({ params, query }: any) => {
      const limit = query.limit ?? 100;
      const offset = query.offset ?? 0;

      const entries = await db
        .select({
          id: auditLog.id,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          action: auditLog.action,
          changes: auditLog.changes,
          createdAt: auditLog.createdAt,
          performedByName: users.name,
          performedByEmail: users.email,
        })
        .from(auditLog)
        .innerJoin(users, eq(auditLog.performedById, users.id))
        .where(eq(auditLog.eventId, params.eventId))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      return entries;
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 500 })),
        offset: t.Optional(t.Number({ minimum: 0 })),
        entityType: t.Optional(t.String()),
        entityId: t.Optional(t.String()),
      }),
    }
  )

  // Get audit log for specific entity
  .get(
    "/entity/:entityType/:entityId",
    async ({ params }: any) => {
      const entries = await db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          changes: auditLog.changes,
          createdAt: auditLog.createdAt,
          performedByName: users.name,
        })
        .from(auditLog)
        .innerJoin(users, eq(auditLog.performedById, users.id))
        .where(
          and(
            eq(auditLog.entityType, params.entityType),
            eq(auditLog.entityId, params.entityId)
          )
        )
        .orderBy(desc(auditLog.createdAt));

      return entries;
    }
  );
