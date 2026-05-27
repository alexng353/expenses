import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";
import { users } from "./users";
import { id } from "../helpers";

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    eventId: uuid("event_id").references(() => events.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action", {
      enum: ["create", "update", "delete", "restore"],
    }).notNull(),
    changes: jsonb("changes"),
    performedById: uuid("performed_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_event_idx").on(t.eventId),
    index("audit_log_performed_by_idx").on(t.performedById),
  ]
);
