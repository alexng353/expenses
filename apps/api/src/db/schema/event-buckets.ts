import { integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";
import { id, timestamps, softDelete } from "../helpers";

export const eventBuckets = pgTable(
  "event_buckets",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [unique("event_buckets_event_name").on(t.eventId, t.name)]
);
