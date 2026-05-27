import { boolean, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";
import { users } from "./users";
import { id, timestamps, softDelete } from "../helpers";

export const eventMembers = pgTable(
  "event_members",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", {
      enum: ["readonly", "write", "edit_others", "super"],
    }).notNull(),
    canApprove: boolean("can_approve").notNull().default(false),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [unique("event_members_event_user").on(t.eventId, t.userId)]
);
