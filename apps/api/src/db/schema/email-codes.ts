import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "../helpers";

export const emailCodes = pgTable("email_codes", {
  id: id(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
