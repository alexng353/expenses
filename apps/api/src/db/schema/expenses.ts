import { date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";
import { eventBuckets } from "./event-buckets";
import { grantCategories } from "./grant-categories";
import { users } from "./users";
import { id, timestamps, softDelete } from "../helpers";

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    date: date("date", { mode: "string" }),
    placeOfPurchase: text("place_of_purchase"),
    status: text("status", {
      enum: [
        "awaiting_approval",
        "approved",
        "outstanding",
        "paid",
        "reimbursed",
      ],
    })
      .notNull()
      .default("outstanding"),
    bucketId: uuid("bucket_id").references(() => eventBuckets.id),
    paidById: uuid("paid_by_id").references(() => users.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),

    // Grant Mode fields (nullable — only used when event.grantMode is true)
    motionNumber: integer("motion_number"),
    grantCategoryId: uuid("grant_category_id").references(
      () => grantCategories.id
    ),
    grantSubLabel: text("grant_sub_label"),

    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index("expenses_event_idx").on(t.eventId),
    index("expenses_paid_by_idx").on(t.paidById),
    index("expenses_bucket_idx").on(t.bucketId),
    index("expenses_status_idx").on(t.status),
  ]
);
