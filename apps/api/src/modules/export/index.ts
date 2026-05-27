import { Elysia } from "elysia";
import ExcelJS from "exceljs";
import { db } from "../../db";
import {
  expenses,
  eventBuckets,
  events,
  grantCategories,
  users,
} from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireEventRole } from "../auth/guards";

export const exportModule = new Elysia({
  prefix: "/events/:eventId/export",
})
  .use(requireEventRole("readonly", "write", "edit_others", "super"))

  // Full event XLSX export
  .get("/xlsx", async ({ params }: any) => {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, params.eventId));

    if (!event) {
      return new Response("Event not found", { status: 404 });
    }

    const allExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.eventId, params.eventId),
          isNull(expenses.deletedAt)
        )
      )
      .orderBy(expenses.date);

    const allBuckets = await db
      .select()
      .from(eventBuckets)
      .where(
        and(
          eq(eventBuckets.eventId, params.eventId),
          isNull(eventBuckets.deletedAt)
        )
      );

    const allUsers = await db
      .select()
      .from(users)
      .where(isNull(users.deletedAt));
    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
    const bucketMap = new Map(allBuckets.map((b) => [b.id, b.name]));

    const wb = new ExcelJS.Workbook();

    // Sheet 1: Expenses
    const ws = wb.addWorksheet(event.name);
    ws.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Expense", key: "name", width: 30 },
      { header: "Total Cost", key: "amount", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "Paid By", key: "paidBy", width: 18 },
      { header: "Bucket", key: "bucket", width: 16 },
      { header: "Notes", key: "notes", width: 40 },
      { header: "Place of Purchase", key: "place", width: 25 },
    ];

    ws.getRow(1).font = { bold: true };

    for (const exp of allExpenses) {
      ws.addRow({
        date: exp.date,
        name: exp.name,
        amount: exp.amountCents / 100,
        status: exp.status,
        paidBy: exp.paidById ? (userMap.get(exp.paidById) ?? "") : "",
        bucket: exp.bucketId ? (bucketMap.get(exp.bucketId) ?? "") : "",
        notes: exp.notes ?? "",
        place: exp.placeOfPurchase ?? "",
      });
    }

    ws.getColumn("amount").numFmt = "$#,##0.00";

    // Sheet 2: Summary
    const summary = wb.addWorksheet("Summary");
    summary.columns = [
      { header: "Bucket", key: "bucket", width: 20 },
      { header: "Total", key: "total", width: 14 },
    ];
    summary.getRow(1).font = { bold: true };

    for (const bucket of allBuckets) {
      const total = allExpenses
        .filter((e) => e.bucketId === bucket.id)
        .reduce((sum, e) => sum + e.amountCents, 0);
      summary.addRow({
        bucket: bucket.name,
        total: total / 100,
      });
    }

    const grandTotal = allExpenses.reduce(
      (s, e) => s + e.amountCents,
      0
    );
    summary.addRow({ bucket: "TOTAL", total: grandTotal / 100 });
    summary.lastRow!.font = { bold: true };
    summary.getColumn("total").numFmt = "$#,##0.00";

    // Sheet 3: Grant Form (if Grant Mode)
    if (event.grantMode) {
      const allCategories = await db
        .select()
        .from(grantCategories)
        .where(
          and(
            eq(grantCategories.eventId, params.eventId),
            isNull(grantCategories.deletedAt)
          )
        );
      const catMap = new Map(allCategories.map((c) => [c.id, c.name]));

      const grantWs = wb.addWorksheet("Grant Form");
      grantWs.columns = [
        { header: "Date DD/MM/YY", key: "date", width: 14 },
        { header: "Place of Purchase", key: "place", width: 30 },
        { header: "Item Description", key: "description", width: 55 },
        {
          header: "Associated Item Category (See Grant)",
          key: "category",
          width: 40,
        },
        { header: "Amount ($)", key: "amount", width: 14 },
      ];
      grantWs.getRow(1).font = { bold: true };

      for (const exp of allExpenses) {
        const bucketName = exp.bucketId
          ? (bucketMap.get(exp.bucketId)?.toUpperCase() ?? "")
          : "";
        const motionStr = exp.motionNumber
          ? `(motion #${exp.motionNumber})`
          : "(motion #MISSING)";
        const description =
          `${event.name.toUpperCase()} ${bucketName} ${exp.name.toUpperCase()} ${motionStr}`.trim();

        const catName = exp.grantCategoryId
          ? (catMap.get(exp.grantCategoryId) ?? "")
          : "";
        const subLabel = exp.grantSubLabel;
        const category = subLabel ? `${catName} (${subLabel})` : catName;

        grantWs.addRow({
          date: exp.date,
          place: (exp.placeOfPurchase ?? "").toUpperCase(),
          description,
          category,
          amount: exp.amountCents / 100,
        });
      }

      grantWs.getColumn("amount").numFmt = "$#,##0.00";
    }

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = event.name.replace(/[^a-zA-Z0-9]/g, "_");
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}_export.xlsx"`,
      },
    });
  });
