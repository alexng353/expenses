import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { expenses } from "./expenses";
import { users } from "./users";
import { id, timestamps, softDelete } from "../helpers";

export const expenseReceipts = pgTable(
  "expense_receipts",
  {
    id: id(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    tag: text("tag"),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("expense_receipts_expense_idx").on(t.expenseId)]
);
