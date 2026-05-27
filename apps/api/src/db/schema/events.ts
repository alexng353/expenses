import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { id, timestamps, softDelete } from "../helpers";

export const events = pgTable("events", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  currency: text("currency").notNull().default("CAD"),
  grantMode: boolean("grant_mode").notNull().default(false),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  ...timestamps(),
  ...softDelete(),
});
