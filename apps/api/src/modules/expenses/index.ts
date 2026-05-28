import { Elysia, t } from "elysia";
import { db } from "../../db";
import {
  expenses,
  expenseReceipts,
  users,
} from "../../db/schema";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { requireEventRole } from "../auth/guards";
import {
  logAudit,
  snapshotCreate,
  snapshotDelete,
  diffFields,
} from "../../lib/audit";
import { createStorageBackend } from "../../storage";
import { env } from "../../env";
import { broadcastToEvent } from "../../lib/ws-broadcast";

const storage = createStorageBackend(env);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export const expensesModule = new Elysia({
  prefix: "/events/:eventId/expenses",
})
  .use(requireEventRole("readonly", "write", "edit_others", "super"))

  // List all expenses for event
  .get("/", async ({ params }: any) => {
    const rows = await db
      .select({
        expense: expenses,
        paidByName: users.name,
        paidByEmail: users.email,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.paidById, users.id))
      .where(
        and(
          eq(expenses.eventId, params.eventId),
          isNull(expenses.deletedAt)
        )
      );

    // Attach receipt counts
    const expenseIds = rows.map((r) => r.expense.id);
    const receiptCounts =
      expenseIds.length > 0
        ? await db
            .select({
              expenseId: expenseReceipts.expenseId,
              count: sql<number>`count(*)::int`,
            })
            .from(expenseReceipts)
            .where(
              and(
                inArray(expenseReceipts.expenseId, expenseIds),
                isNull(expenseReceipts.deletedAt)
              )
            )
            .groupBy(expenseReceipts.expenseId)
        : [];

    const countMap = new Map(
      receiptCounts.map((r) => [r.expenseId, r.count])
    );

    return rows.map((r) => ({
      ...r.expense,
      paidBy: r.paidByName
        ? { name: r.paidByName, email: r.paidByEmail }
        : null,
      receiptCount: countMap.get(r.expense.id) ?? 0,
    }));
  })

  // Create expense
  .post(
    "/",
    async ({ body, params, user, membership, set }: any) => {
      if (membership?.role === "readonly") {
        set.status = 403;
        return { error: "Write access required" };
      }

      const [expense] = await db
        .insert(expenses)
        .values({
          eventId: params.eventId,
          name: body.name,
          amountCents: body.amountCents,
          date: body.date,
          placeOfPurchase: body.placeOfPurchase,
          status: body.status ?? "outstanding",
          bucketId: body.bucketId,
          paidById: body.paidById,
          createdById: user!.id,
          notes: body.notes,
          motionNumber: body.motionNumber,
          grantCategoryId: body.grantCategoryId,
          grantSubLabel: body.grantSubLabel,
        })
        .returning();

      await logAudit({
        eventId: params.eventId,
        entityType: "expense",
        entityId: expense.id,
        action: "create",
        changes: snapshotCreate(expense),
        performedById: user!.id,
      });

      broadcastToEvent(params.eventId, {
        type: "expense_created",
        payload: expense,
      });

      return expense;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        amountCents: t.Number({ minimum: 0 }),
        date: t.Optional(t.String()),
        placeOfPurchase: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal("awaiting_approval"),
            t.Literal("approved"),
            t.Literal("outstanding"),
            t.Literal("paid"),
            t.Literal("reimbursed"),
          ])
        ),
        bucketId: t.Optional(t.String()),
        paidById: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        motionNumber: t.Optional(t.Number()),
        grantCategoryId: t.Optional(t.String()),
        grantSubLabel: t.Optional(t.String()),
      }),
    }
  )

  // Update expense
  .patch(
    "/:expenseId",
    async ({ body, params, user, membership, set }: any) => {
      const [old] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, params.expenseId),
            eq(expenses.eventId, params.eventId),
            isNull(expenses.deletedAt)
          )
        );

      if (!old) {
        set.status = 404;
        return { error: "Expense not found" };
      }

      // Ownership check for "write" role
      if (
        membership?.role === "write" &&
        old.createdById !== user!.id
      ) {
        set.status = 403;
        return { error: "You can only edit your own expenses" };
      }

      if (membership?.role === "readonly") {
        set.status = 403;
        return { error: "Write access required" };
      }

      const [updated] = await db
        .update(expenses)
        .set(body)
        .where(eq(expenses.id, params.expenseId))
        .returning();

      const changes = diffFields(old, body);
      if (changes) {
        await logAudit({
          eventId: params.eventId,
          entityType: "expense",
          entityId: updated.id,
          action: "update",
          changes,
          performedById: user!.id,
        });
      }

      broadcastToEvent(params.eventId, {
        type: "expense_updated",
        payload: updated,
      });

      return updated;
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        amountCents: t.Optional(t.Number({ minimum: 0 })),
        date: t.Optional(t.Nullable(t.String())),
        placeOfPurchase: t.Optional(t.Nullable(t.String())),
        status: t.Optional(
          t.Union([
            t.Literal("awaiting_approval"),
            t.Literal("approved"),
            t.Literal("outstanding"),
            t.Literal("paid"),
            t.Literal("reimbursed"),
          ])
        ),
        bucketId: t.Optional(t.Nullable(t.String())),
        paidById: t.Optional(t.Nullable(t.String())),
        notes: t.Optional(t.Nullable(t.String())),
        motionNumber: t.Optional(t.Nullable(t.Number())),
        grantCategoryId: t.Optional(t.Nullable(t.String())),
        grantSubLabel: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  // Delete expense (soft)
  .delete(
    "/:expenseId",
    async ({ params, user, membership, set }: any) => {
      const [old] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, params.expenseId),
            eq(expenses.eventId, params.eventId),
            isNull(expenses.deletedAt)
          )
        );

      if (!old) {
        set.status = 404;
        return { error: "Expense not found" };
      }

      if (
        membership?.role === "write" &&
        old.createdById !== user!.id &&
        !user!.isSuper
      ) {
        set.status = 403;
        return { error: "You can only delete your own expenses" };
      }

      if (membership?.role === "readonly") {
        set.status = 403;
        return { error: "Write access required" };
      }

      const [deleted] = await db
        .update(expenses)
        .set({ deletedAt: new Date() })
        .where(eq(expenses.id, params.expenseId))
        .returning();

      await logAudit({
        eventId: params.eventId,
        entityType: "expense",
        entityId: deleted.id,
        action: "delete",
        changes: snapshotDelete(old),
        performedById: user!.id,
      });

      broadcastToEvent(params.eventId, {
        type: "expense_deleted",
        payload: { id: params.expenseId },
      });

      return { ok: true };
    }
  )

  // Approve expense
  .post(
    "/:expenseId/approve",
    async ({ params, user, membership, set }: any) => {
      // Check approver permission
      if (
        !user!.isSuper &&
        membership?.role !== "super" &&
        !membership?.canApprove
      ) {
        set.status = 403;
        return { error: "Approval permission required" };
      }

      const [old] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, params.expenseId),
            eq(expenses.eventId, params.eventId),
            isNull(expenses.deletedAt)
          )
        );

      if (!old) {
        set.status = 404;
        return { error: "Expense not found" };
      }

      if (old.status !== "awaiting_approval") {
        set.status = 400;
        return { error: "Expense is not awaiting approval" };
      }

      const [updated] = await db
        .update(expenses)
        .set({ status: "approved" })
        .where(eq(expenses.id, params.expenseId))
        .returning();

      await logAudit({
        eventId: params.eventId,
        entityType: "expense",
        entityId: updated.id,
        action: "update",
        changes: { status: { old: "awaiting_approval", new: "approved" } },
        performedById: user!.id,
      });

      broadcastToEvent(params.eventId, {
        type: "expense_updated",
        payload: updated,
      });

      return updated;
    }
  )

  // === Receipts ===

  // List receipts for an expense
  .get("/:expenseId/receipts", async ({ params }: any) => {
    return db
      .select()
      .from(expenseReceipts)
      .where(
        and(
          eq(expenseReceipts.expenseId, params.expenseId),
          isNull(expenseReceipts.deletedAt)
        )
      );
  })

  // Upload receipt
  .post(
    "/:expenseId/receipts",
    async ({ params, body, user, membership, set }: any) => {
      if (membership?.role === "readonly") {
        set.status = 403;
        return { error: "Write access required" };
      }

      const file = body.file;
      if (file.size > MAX_FILE_SIZE) {
        set.status = 400;
        return { error: "File too large (max 25MB)" };
      }

      const key = `receipts/${params.eventId}/${params.expenseId}/${crypto.randomUUID()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await storage.put(key, buffer, file.type);

      const [receipt] = await db
        .insert(expenseReceipts)
        .values({
          expenseId: params.expenseId,
          storageKey: key,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          tag: body.tag ?? null,
          uploadedById: user!.id,
        })
        .returning();

      await logAudit({
        eventId: params.eventId,
        entityType: "expense_receipt",
        entityId: receipt.id,
        action: "create",
        changes: snapshotCreate(receipt),
        performedById: user!.id,
      });

      return receipt;
    },
    {
      body: t.Object({
        file: t.File(),
        tag: t.Optional(t.String()),
      }),
    }
  )

  // Get receipt signed URL
  .get(
    "/:expenseId/receipts/:receiptId/url",
    async ({ params, set }: any) => {
      const [receipt] = await db
        .select()
        .from(expenseReceipts)
        .where(
          and(
            eq(expenseReceipts.id, params.receiptId),
            eq(expenseReceipts.expenseId, params.expenseId),
            isNull(expenseReceipts.deletedAt)
          )
        );

      if (!receipt) {
        set.status = 404;
        return { error: "Receipt not found" };
      }

      const url = await storage.getSignedUrl(receipt.storageKey, 3600);
      return { url, fileName: receipt.fileName, mimeType: receipt.mimeType };
    }
  )

  // Delete receipt (soft)
  .delete(
    "/:expenseId/receipts/:receiptId",
    async ({ params, user, membership, set }: any) => {
      if (membership?.role === "readonly") {
        set.status = 403;
        return { error: "Write access required" };
      }

      const [receipt] = await db
        .update(expenseReceipts)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(expenseReceipts.id, params.receiptId),
            eq(expenseReceipts.expenseId, params.expenseId),
            isNull(expenseReceipts.deletedAt)
          )
        )
        .returning();

      if (!receipt) {
        set.status = 404;
        return { error: "Receipt not found" };
      }

      await logAudit({
        eventId: params.eventId,
        entityType: "expense_receipt",
        entityId: receipt.id,
        action: "delete",
        changes: snapshotDelete(receipt),
        performedById: user!.id,
      });

      return { ok: true };
    }
  );
