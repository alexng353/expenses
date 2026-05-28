import { Elysia, t } from "elysia";
import { db } from "../../db";
import {
  events,
  eventBuckets,
  eventMembers,
  grantCategories,
  expenses,
  users,
} from "../../db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import {
  requireAuth,
  requireSuper,
  requireEventRole,
  authPlugin,
} from "../auth/guards";
import {
  logAudit,
  snapshotCreate,
  snapshotDelete,
  diffFields,
} from "../../lib/audit";

export const eventsModule = new Elysia({ prefix: "/events" })
  // List events (user sees only their events, super sees all)
  .use(authPlugin)
  .get("/", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Authentication required" };
    }

    if (user.isSuper) {
      return db
        .select()
        .from(events)
        .where(isNull(events.deletedAt));
    }

    const memberships = await db
      .select({ eventId: eventMembers.eventId })
      .from(eventMembers)
      .where(
        and(
          eq(eventMembers.userId, user.id),
          isNull(eventMembers.deletedAt)
        )
      );

    if (memberships.length === 0) return [];

    return db
      .select()
      .from(events)
      .where(
        and(
          inArray(
            events.id,
            memberships.map((m) => m.eventId)
          ),
          isNull(events.deletedAt)
        )
      );
  })

  // Create event (super only)
  .use(requireSuper)
  .post(
    "/",
    async ({ user, body }) => {
      const [event] = await db
        .insert(events)
        .values({
          name: body.name,
          description: body.description,
          grantMode: body.grantMode ?? false,
          createdById: (user as any)!.id,
        })
        .returning();

      // Auto-add creator as super member
      await db.insert(eventMembers).values({
        eventId: event.id,
        userId: (user as any)!.id,
        role: "super",
        canApprove: true,
      });

      // Auto-add "general" bucket
      await db.insert(eventBuckets).values({
        eventId: event.id,
        name: "general",
        sortOrder: 0,
      });

      await logAudit({
        eventId: event.id,
        entityType: "event",
        entityId: event.id,
        action: "create",
        changes: snapshotCreate(event),
        performedById: (user as any)!.id,
      });

      return event;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        grantMode: t.Optional(t.Boolean()),
      }),
    }
  )

  // Get single event
  .group("/:eventId", (app) =>
    app
      .use(requireEventRole("readonly", "write", "edit_others", "super"))

      .get("/", async ({ params }) => {
        const [event] = await db
          .select()
          .from(events)
          .where(
            and(
              eq(events.id, (params as any).eventId),
              isNull(events.deletedAt)
            )
          );
        return event ?? null;
      })

      // Update event (event super only)
      .patch(
        "/",
        async ({ body, params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [old] = await db
            .select()
            .from(events)
            .where(eq(events.id, params.eventId));

          const [updated] = await db
            .update(events)
            .set(body)
            .where(eq(events.id, params.eventId))
            .returning();

          const changes = diffFields(old, body);
          if (changes) {
            await logAudit({
              eventId: params.eventId,
              entityType: "event",
              entityId: params.eventId,
              action: "update",
              changes,
              performedById: user!.id,
            });
          }

          return updated;
        },
        {
          body: t.Object({
            name: t.Optional(t.String({ minLength: 1 })),
            description: t.Optional(t.String()),
            grantMode: t.Optional(t.Boolean()),
            currency: t.Optional(t.String()),
          }),
        }
      )

      // === Buckets ===
      .get("/buckets", async ({ params }: any) => {
        return db
          .select()
          .from(eventBuckets)
          .where(
            and(
              eq(eventBuckets.eventId, params.eventId),
              isNull(eventBuckets.deletedAt)
            )
          )
          .orderBy(eventBuckets.sortOrder);
      })

      .post(
        "/buckets",
        async ({ body, params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [bucket] = await db
            .insert(eventBuckets)
            .values({
              eventId: params.eventId,
              name: body.name,
              sortOrder: body.sortOrder ?? 0,
            })
            .returning();

          await logAudit({
            eventId: params.eventId,
            entityType: "event_bucket",
            entityId: bucket.id,
            action: "create",
            changes: snapshotCreate(bucket),
            performedById: user!.id,
          });

          return bucket;
        },
        {
          body: t.Object({
            name: t.String({ minLength: 1 }),
            sortOrder: t.Optional(t.Number()),
          }),
        }
      )

      .patch(
        "/buckets/:bucketId",
        async ({ body, params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [old] = await db
            .select()
            .from(eventBuckets)
            .where(eq(eventBuckets.id, params.bucketId));

          const [updated] = await db
            .update(eventBuckets)
            .set(body)
            .where(
              and(
                eq(eventBuckets.id, params.bucketId),
                eq(eventBuckets.eventId, params.eventId),
                isNull(eventBuckets.deletedAt)
              )
            )
            .returning();

          if (!updated) {
            set.status = 404;
            return { error: "Bucket not found" };
          }

          const changes = diffFields(old, body);
          if (changes) {
            await logAudit({
              eventId: params.eventId,
              entityType: "event_bucket",
              entityId: updated.id,
              action: "update",
              changes,
              performedById: user!.id,
            });
          }

          return updated;
        },
        {
          body: t.Object({
            name: t.Optional(t.String({ minLength: 1 })),
            sortOrder: t.Optional(t.Number()),
          }),
        }
      )

      .delete(
        "/buckets/:bucketId",
        async ({ params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [bucket] = await db
            .update(eventBuckets)
            .set({ deletedAt: new Date() })
            .where(
              and(
                eq(eventBuckets.id, params.bucketId),
                eq(eventBuckets.eventId, params.eventId),
                isNull(eventBuckets.deletedAt)
              )
            )
            .returning();

          if (!bucket) {
            set.status = 404;
            return { error: "Bucket not found" };
          }

          await logAudit({
            eventId: params.eventId,
            entityType: "event_bucket",
            entityId: bucket.id,
            action: "delete",
            changes: snapshotDelete(bucket),
            performedById: user!.id,
          });

          return { ok: true };
        }
      )

      // === Members ===
      .get("/members", async ({ params }: any) => {
        const members = await db
          .select({
            id: eventMembers.id,
            userId: eventMembers.userId,
            role: eventMembers.role,
            canApprove: eventMembers.canApprove,
            userName: users.name,
            userEmail: users.email,
            userAvatarSource: users.avatarSource,
          })
          .from(eventMembers)
          .innerJoin(users, eq(eventMembers.userId, users.id))
          .where(
            and(
              eq(eventMembers.eventId, params.eventId),
              isNull(eventMembers.deletedAt)
            )
          );
        return members;
      })

      .post(
        "/members",
        async ({ body, params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [member] = await db
            .insert(eventMembers)
            .values({
              eventId: params.eventId,
              userId: body.userId,
              role: body.role,
              canApprove: body.canApprove ?? false,
            })
            .returning();

          await logAudit({
            eventId: params.eventId,
            entityType: "event_member",
            entityId: member.id,
            action: "create",
            changes: snapshotCreate(member),
            performedById: user!.id,
          });

          return member;
        },
        {
          body: t.Object({
            userId: t.String(),
            role: t.Union([
              t.Literal("readonly"),
              t.Literal("write"),
              t.Literal("edit_others"),
              t.Literal("super"),
            ]),
            canApprove: t.Optional(t.Boolean()),
          }),
        }
      )

      .patch(
        "/members/:memberId",
        async ({ body, params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [old] = await db
            .select()
            .from(eventMembers)
            .where(eq(eventMembers.id, params.memberId));

          const [updated] = await db
            .update(eventMembers)
            .set(body)
            .where(
              and(
                eq(eventMembers.id, params.memberId),
                eq(eventMembers.eventId, params.eventId)
              )
            )
            .returning();

          if (!updated) {
            set.status = 404;
            return { error: "Member not found" };
          }

          const changes = diffFields(old, body);
          if (changes) {
            await logAudit({
              eventId: params.eventId,
              entityType: "event_member",
              entityId: updated.id,
              action: "update",
              changes,
              performedById: user!.id,
            });
          }

          return updated;
        },
        {
          body: t.Object({
            role: t.Optional(
              t.Union([
                t.Literal("readonly"),
                t.Literal("write"),
                t.Literal("edit_others"),
                t.Literal("super"),
              ])
            ),
            canApprove: t.Optional(t.Boolean()),
          }),
        }
      )

      .delete(
        "/members/:memberId",
        async ({ params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [member] = await db
            .update(eventMembers)
            .set({ deletedAt: new Date() })
            .where(
              and(
                eq(eventMembers.id, params.memberId),
                eq(eventMembers.eventId, params.eventId),
                isNull(eventMembers.deletedAt)
              )
            )
            .returning();

          if (!member) {
            set.status = 404;
            return { error: "Member not found" };
          }

          await logAudit({
            eventId: params.eventId,
            entityType: "event_member",
            entityId: member.id,
            action: "delete",
            changes: snapshotDelete(member),
            performedById: user!.id,
          });

          return { ok: true };
        }
      )

      // === Grant Categories ===
      .get("/grant-categories", async ({ params }: any) => {
        return db
          .select()
          .from(grantCategories)
          .where(
            and(
              eq(grantCategories.eventId, params.eventId),
              isNull(grantCategories.deletedAt)
            )
          )
          .orderBy(grantCategories.sortOrder);
      })

      .post(
        "/grant-categories",
        async ({ body, params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [cat] = await db
            .insert(grantCategories)
            .values({
              eventId: params.eventId,
              name: body.name,
              sortOrder: body.sortOrder ?? 0,
            })
            .returning();

          await logAudit({
            eventId: params.eventId,
            entityType: "grant_category",
            entityId: cat.id,
            action: "create",
            changes: snapshotCreate(cat),
            performedById: user!.id,
          });

          return cat;
        },
        {
          body: t.Object({
            name: t.String({ minLength: 1 }),
            sortOrder: t.Optional(t.Number()),
          }),
        }
      )

      .patch(
        "/grant-categories/:categoryId",
        async ({ body, params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [old] = await db
            .select()
            .from(grantCategories)
            .where(eq(grantCategories.id, params.categoryId));

          const [updated] = await db
            .update(grantCategories)
            .set(body)
            .where(
              and(
                eq(grantCategories.id, params.categoryId),
                eq(grantCategories.eventId, params.eventId),
                isNull(grantCategories.deletedAt)
              )
            )
            .returning();

          if (!updated) {
            set.status = 404;
            return { error: "Category not found" };
          }

          const changes = diffFields(old, body);
          if (changes) {
            await logAudit({
              eventId: params.eventId,
              entityType: "grant_category",
              entityId: updated.id,
              action: "update",
              changes,
              performedById: user!.id,
            });
          }

          return updated;
        },
        {
          body: t.Object({
            name: t.Optional(t.String({ minLength: 1 })),
            sortOrder: t.Optional(t.Number()),
          }),
        }
      )

      .delete(
        "/grant-categories/:categoryId",
        async ({ params, user, membership, set }: any) => {
          if (membership!.role !== "super" && !user!.isSuper) {
            set.status = 403;
            return { error: "Event admin access required" };
          }

          const [cat] = await db
            .update(grantCategories)
            .set({ deletedAt: new Date() })
            .where(
              and(
                eq(grantCategories.id, params.categoryId),
                eq(grantCategories.eventId, params.eventId),
                isNull(grantCategories.deletedAt)
              )
            )
            .returning();

          if (!cat) {
            set.status = 404;
            return { error: "Category not found" };
          }

          await logAudit({
            eventId: params.eventId,
            entityType: "grant_category",
            entityId: cat.id,
            action: "delete",
            changes: snapshotDelete(cat),
            performedById: user!.id,
          });

          return { ok: true };
        }
      )

      // === Summary ===
      .get("/summary", async ({ params }: any) => {
        // Get all non-deleted expenses for this event
        const allExpenses = await db
          .select({
            amountCents: expenses.amountCents,
            bucketId: expenses.bucketId,
            status: expenses.status,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.eventId, params.eventId),
              isNull(expenses.deletedAt)
            )
          );

        // Get buckets for this event
        const buckets = await db
          .select()
          .from(eventBuckets)
          .where(
            and(
              eq(eventBuckets.eventId, params.eventId),
              isNull(eventBuckets.deletedAt)
            )
          )
          .orderBy(eventBuckets.sortOrder);

        // Totals by bucket
        const byBucket = buckets.map((bucket) => {
          const bucketExpenses = allExpenses.filter(
            (e) => e.bucketId === bucket.id
          );
          return {
            bucketId: bucket.id,
            bucketName: bucket.name,
            totalCents: bucketExpenses.reduce(
              (sum, e) => sum + e.amountCents,
              0
            ),
            count: bucketExpenses.length,
          };
        });

        // Uncategorized
        const uncategorized = allExpenses.filter((e) => !e.bucketId);
        byBucket.push({
          bucketId: null as any,
          bucketName: "uncategorized",
          totalCents: uncategorized.reduce(
            (sum, e) => sum + e.amountCents,
            0
          ),
          count: uncategorized.length,
        });

        // Totals by status
        const byStatus: Record<string, { totalCents: number; count: number }> =
          {};
        for (const e of allExpenses) {
          if (!byStatus[e.status]) {
            byStatus[e.status] = { totalCents: 0, count: 0 };
          }
          byStatus[e.status].totalCents += e.amountCents;
          byStatus[e.status].count++;
        }

        return {
          totalCents: allExpenses.reduce(
            (sum, e) => sum + e.amountCents,
            0
          ),
          totalCount: allExpenses.length,
          byBucket,
          byStatus,
        };
      })
  );
