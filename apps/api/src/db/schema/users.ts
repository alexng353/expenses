import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { id, softDelete, timestamps } from "../helpers";
import { bytea } from "../types";

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    googleId: text("google_id").unique(),
    avatarSource: text("avatar_source", {
      enum: ["google", "gravatar", "upload"],
    }),
    avatarThumbnail: bytea("avatar_thumbnail"),
    avatarStorageKey: text("avatar_storage_key"),
    isSuper: boolean("is_super").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("users_email_idx").on(t.email)]
);
