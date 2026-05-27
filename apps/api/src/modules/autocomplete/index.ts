import { Elysia } from "elysia";
import { db } from "../../db";
import { expenses, expenseReceipts } from "../../db/schema";
import { isNull, sql } from "drizzle-orm";
import { requireAuth } from "../auth/guards";

export const autocompleteModule = new Elysia({ prefix: "/autocomplete" })
  .use(requireAuth)

  // Global place of purchase suggestions
  .get("/places", async () => {
    const rows = await db
      .selectDistinct({ value: expenses.placeOfPurchase })
      .from(expenses)
      .where(
        sql`${expenses.placeOfPurchase} IS NOT NULL AND ${isNull(expenses.deletedAt)}`
      )
      .orderBy(expenses.placeOfPurchase);
    return rows.map((r) => r.value).filter(Boolean);
  })

  // Global receipt tag suggestions
  .get("/receipt-tags", async () => {
    const rows = await db
      .selectDistinct({ value: expenseReceipts.tag })
      .from(expenseReceipts)
      .where(
        sql`${expenseReceipts.tag} IS NOT NULL AND ${isNull(expenseReceipts.deletedAt)}`
      )
      .orderBy(expenseReceipts.tag);
    return rows.map((r) => r.value).filter(Boolean);
  });
