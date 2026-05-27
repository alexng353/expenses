import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, softDelete, timestamps } from "../helpers";
import { users } from "./users";

export const inviteLinks = pgTable("invite_links", {
  id: id(),
  token: text("token").notNull().unique(),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  defaultRole: text("default_role", {
    enum: ["readonly", "write", "edit_others", "super"],
  })
    .notNull()
    .default("write"),
  allowedEmailDomains: text("allowed_email_domains").array(),
  ...timestamps(),
  ...softDelete(),
});
