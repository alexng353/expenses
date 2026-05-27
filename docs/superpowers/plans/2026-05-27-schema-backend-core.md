# Plan 1: Schema & Backend Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the API server with full database schema, storage abstraction, test infrastructure, and seed data — no auth or API routes yet.

**Architecture:** Turborepo monorepo — add `apps/api` (Elysia + Bun) alongside existing `apps/web` (Vite React). Drizzle ORM with postgres-js driver for the data layer. Storage abstraction (interface + disk backend for dev, S3 backend for prod) for receipts and full-quality profile pics. Low-quality avatar thumbnails stored as bytea in Postgres. All tables use soft delete (`deleted_at`), timestamps (`created_at`, `updated_at`), and UUID primary keys.

**Tech Stack:** Elysia, Drizzle ORM, postgres-js, Bun, Zod, @aws-sdk/client-s3, Docker Compose (Postgres)

**Reference repo:** `/home/alex/code/csss/mod-applications` — follow its Drizzle conventions (per-table schema files, postgres-js driver, `.references()` for FKs, text columns with `{ enum: [...] }` for enums).

---

## File Map

```
apps/api/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── src/
│   ├── index.ts                      # Elysia entry point (health check only)
│   ├── env.ts                        # Zod-validated environment config
│   ├── db/
│   │   ├── index.ts                  # Drizzle client singleton
│   │   ├── types.ts                  # Custom column types (bytea)
│   │   ├── helpers.ts                # Shared column helpers (timestamps, soft delete)
│   │   ├── seed.ts                   # Seed script (bun run db:seed)
│   │   └── schema/
│   │       ├── index.ts              # Re-exports all tables
│   │       ├── users.ts
│   │       ├── sessions.ts
│   │       ├── email-codes.ts
│   │       ├── invite-links.ts
│   │       ├── events.ts
│   │       ├── event-buckets.ts
│   │       ├── event-members.ts
│   │       ├── grant-categories.ts
│   │       ├── expenses.ts
│   │       ├── expense-receipts.ts
│   │       └── audit-log.ts
│   └── storage/
│       ├── interface.ts              # StorageBackend type
│       ├── disk.ts                   # DiskStorageBackend (dev)
│       ├── s3.ts                     # S3StorageBackend (prod)
│       └── index.ts                  # createStorageBackend factory
├── test/
│   ├── helpers.ts                    # Test DB connection, cleanup
│   ├── schema.test.ts               # Schema integration tests
│   └── storage.test.ts              # Storage unit tests
└── drizzle/                          # Generated migrations (committed)

docker-compose.yml                    # Root-level: Postgres for dev
```

---

## Design Decisions

**Enums as text columns:** Use `text("col", { enum: [...] })` instead of `pgEnum`. Avoids `ALTER TYPE` migrations when adding values. TypeScript enforces the enum at compile time.

**Soft delete everywhere:** Every table gets `deleted_at`. Queries must filter `WHERE deleted_at IS NULL` by default. The audit log does NOT get soft delete — audit entries are permanent.

**Integer cents:** All monetary amounts stored as integer cents (e.g., `$1,198.57` → `119857`). No floating point.

**Bytea for avatars:** Custom Drizzle column type for `bytea`. Thumbnails are sub-200KB (sharp'd server-side). Full-quality images go to the storage backend.

**Storage abstraction:** Interface with `put`, `get`, `getSignedUrl`, `delete`, `exists`. Disk backend returns URLs like `http://localhost:PORT/api/storage/FILENAME?token=HMAC&expires=TS`. S3 backend uses presigned URLs.

**RBAC model:**
- `users.is_super` — platform-level admin (access all events, create events, manage users)
- `event_members.role` — event-level: `readonly` < `write` < `edit_others` < `super`
- `event_members.can_approve` — orthogonal flag for approval workflow
- A platform super implicitly has `super` access to all events

**Expense status state machine:**
```
awaiting_approval → approved → outstanding → paid → reimbursed
```
- `awaiting_approval`: proposed purchase, pending approval
- `approved`: approved to purchase, not yet bought
- `outstanding`: purchased, person fronted cash, club hasn't paid them back
- `paid`: club paid the person back
- `reimbursed`: grant body reimbursed the club (Grant Mode)

**Grant Mode:** Per-event boolean flag. When on, expenses gain: `motion_number`, `grant_category_id`, `grant_sub_label`. These columns exist on all expenses but are only shown/required when the event has Grant Mode enabled.

---

## Task 1: Scaffold `apps/api` + Docker Compose

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/index.ts`
- Create: `docker-compose.yml`

### Steps

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@expense-tracker/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "bun run src/db/seed.ts",
    "test": "bun test"
  },
  "dependencies": {
    "drizzle-orm": "^0.44.0",
    "elysia": "^1.3.0",
    "@elysiajs/cors": "^1.3.0",
    "postgres": "^3.4.0",
    "zod": "^4.4.0",
    "@aws-sdk/client-s3": "^3.800.0",
    "@aws-sdk/s3-request-presigner": "^3.800.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "@types/bun": "latest",
    "typescript": "~6"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["bun"]
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist", "drizzle"]
}
```

- [ ] **Step 3: Create `apps/api/src/env.ts`**

```typescript
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8888),
  DATABASE_URL: z.string(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  STORAGE_BACKEND: z.enum(["disk", "s3"]).default("disk"),
  STORAGE_DISK_PATH: z.string().default("./uploads"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SIGNED_URL_SECRET: z.string().default("dev-secret-change-in-prod"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
```

- [ ] **Step 4: Create `apps/api/src/index.ts`**

```typescript
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env } from "./env";

const app = new Elysia()
  .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  .get("/api/health", () => ({ status: "ok" }))
  .listen(env.PORT);

console.log(`API running at http://localhost:${env.PORT}`);

export type App = typeof app;
```

- [ ] **Step 5: Create `docker-compose.yml` at repo root**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: expense
      POSTGRES_PASSWORD: expense
      POSTGRES_DB: expense_tracker
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 6: Create `apps/api/.env` (gitignored)**

```
DATABASE_URL=postgres://expense:expense@localhost:5432/expense_tracker
STORAGE_BACKEND=disk
STORAGE_DISK_PATH=./uploads
SIGNED_URL_SECRET=dev-secret
```

- [ ] **Step 7: Add `.env` to `.gitignore`**

Append to the root `.gitignore`:

```
# Environment
.env
.env.*
!.env.example

# Uploads (dev storage)
apps/api/uploads/
```

- [ ] **Step 8: Install deps and verify**

```bash
cd apps/api && bun install
docker compose up -d
bun run dev
# Verify: curl http://localhost:8888/api/health → {"status":"ok"}
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/src/env.ts apps/api/src/index.ts docker-compose.yml .gitignore
git commit -m "feat(api): scaffold elysia api server with docker compose postgres"
```

---

## Task 2: Drizzle Setup + Custom Column Types

**Files:**
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/index.ts`
- Create: `apps/api/src/db/types.ts`
- Create: `apps/api/src/db/helpers.ts`

### Steps

- [ ] **Step 1: Create `apps/api/drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 2: Create `apps/api/src/db/index.ts`**

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });
export type Database = typeof db;
```

- [ ] **Step 3: Create `apps/api/src/db/types.ts`**

```typescript
import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; dpiData: string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): string {
    return `\\x${value.toString("hex")}`;
  },
  fromDriver(value: unknown): Buffer {
    if (value instanceof Buffer) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string") {
      const hex = value.startsWith("\\x") ? value.slice(2) : value;
      return Buffer.from(hex, "hex");
    }
    throw new Error(`Unexpected bytea value type: ${typeof value}`);
  },
});
```

- [ ] **Step 4: Create `apps/api/src/db/helpers.ts`**

Shared column definitions reused across all tables:

```typescript
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const softDelete = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
```

- [ ] **Step 5: Create empty `apps/api/src/db/schema/index.ts`**

```typescript
// Tables will be added in subsequent tasks
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/drizzle.config.ts apps/api/src/db/
git commit -m "feat(api): add drizzle config, db connection, custom column types"
```

---

## Task 3: Auth Schema (users, sessions, email codes, invite links)

**Files:**
- Create: `apps/api/src/db/schema/users.ts`
- Create: `apps/api/src/db/schema/sessions.ts`
- Create: `apps/api/src/db/schema/email-codes.ts`
- Create: `apps/api/src/db/schema/invite-links.ts`
- Modify: `apps/api/src/db/schema/index.ts`

### Steps

- [ ] **Step 1: Create `apps/api/src/db/schema/users.ts`**

```typescript
import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { bytea } from "../types";
import { id, timestamps, softDelete } from "../helpers";

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
```

- [ ] **Step 2: Create `apps/api/src/db/schema/sessions.ts`**

```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { id } from "../helpers";

export const sessions = pgTable("sessions", {
  id: id(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 3: Create `apps/api/src/db/schema/email-codes.ts`**

```typescript
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
```

- [ ] **Step 4: Create `apps/api/src/db/schema/invite-links.ts`**

```typescript
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { id, timestamps, softDelete } from "../helpers";

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
```

- [ ] **Step 5: Update `apps/api/src/db/schema/index.ts`**

```typescript
export { users } from "./users";
export { sessions } from "./sessions";
export { emailCodes } from "./email-codes";
export { inviteLinks } from "./invite-links";
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema/
git commit -m "feat(api): add auth schema — users, sessions, email codes, invite links"
```

---

## Task 4: Event Schema (events, buckets, members, grant categories)

**Files:**
- Create: `apps/api/src/db/schema/events.ts`
- Create: `apps/api/src/db/schema/event-buckets.ts`
- Create: `apps/api/src/db/schema/event-members.ts`
- Create: `apps/api/src/db/schema/grant-categories.ts`
- Modify: `apps/api/src/db/schema/index.ts`

### Steps

- [ ] **Step 1: Create `apps/api/src/db/schema/events.ts`**

```typescript
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
```

- [ ] **Step 2: Create `apps/api/src/db/schema/event-buckets.ts`**

```typescript
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
```

- [ ] **Step 3: Create `apps/api/src/db/schema/event-members.ts`**

```typescript
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
```

- [ ] **Step 4: Create `apps/api/src/db/schema/grant-categories.ts`**

```typescript
import { integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { events } from "./events";
import { id, timestamps, softDelete } from "../helpers";

export const grantCategories = pgTable(
  "grant_categories",
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
  (t) => [unique("grant_categories_event_name").on(t.eventId, t.name)]
);
```

- [ ] **Step 5: Update `apps/api/src/db/schema/index.ts`**

Add to existing exports:

```typescript
export { users } from "./users";
export { sessions } from "./sessions";
export { emailCodes } from "./email-codes";
export { inviteLinks } from "./invite-links";
export { events } from "./events";
export { eventBuckets } from "./event-buckets";
export { eventMembers } from "./event-members";
export { grantCategories } from "./grant-categories";
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema/
git commit -m "feat(api): add event schema — events, buckets, members, grant categories"
```

---

## Task 5: Expense Schema (expenses, receipts)

**Files:**
- Create: `apps/api/src/db/schema/expenses.ts`
- Create: `apps/api/src/db/schema/expense-receipts.ts`
- Modify: `apps/api/src/db/schema/index.ts`

### Steps

- [ ] **Step 1: Create `apps/api/src/db/schema/expenses.ts`**

```typescript
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
```

- [ ] **Step 2: Create `apps/api/src/db/schema/expense-receipts.ts`**

```typescript
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
```

- [ ] **Step 3: Update `apps/api/src/db/schema/index.ts`**

Full file:

```typescript
export { users } from "./users";
export { sessions } from "./sessions";
export { emailCodes } from "./email-codes";
export { inviteLinks } from "./invite-links";
export { events } from "./events";
export { eventBuckets } from "./event-buckets";
export { eventMembers } from "./event-members";
export { grantCategories } from "./grant-categories";
export { expenses } from "./expenses";
export { expenseReceipts } from "./expense-receipts";
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema/
git commit -m "feat(api): add expense schema — expenses, receipts with grant mode fields"
```

---

## Task 6: Audit Log Schema

**Files:**
- Create: `apps/api/src/db/schema/audit-log.ts`
- Modify: `apps/api/src/db/schema/index.ts`

### Steps

- [ ] **Step 1: Create `apps/api/src/db/schema/audit-log.ts`**

No soft delete on audit log — entries are permanent.

```typescript
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
```

**Entity types:** `expense`, `expense_receipt`, `event`, `event_bucket`, `event_member`, `grant_category`, `user`, `invite_link`

**Changes format for `update` actions:**
```json
{
  "name": { "old": "Pizza", "new": "Pizza Hike" },
  "amountCents": { "old": 26000, "new": 28000 }
}
```

**Changes format for `create` actions:** Full entity snapshot as `{ field: { old: null, new: value } }`.

**Changes format for `delete` actions:** Full entity snapshot as `{ field: { old: value, new: null } }`.

- [ ] **Step 2: Update `apps/api/src/db/schema/index.ts`**

Add:

```typescript
export { auditLog } from "./audit-log";
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/schema/
git commit -m "feat(api): add audit log schema"
```

---

## Task 7: Generate & Run Migration

**Files:**
- Create: `apps/api/drizzle/` (generated)

### Steps

- [ ] **Step 1: Ensure Postgres is running**

```bash
docker compose up -d
```

- [ ] **Step 2: Generate the migration**

```bash
cd apps/api && bun run db:generate
```

Verify: a new SQL file appears in `apps/api/drizzle/` containing `CREATE TABLE` statements for all 11 tables.

- [ ] **Step 3: Run the migration**

```bash
cd apps/api && bun run db:migrate
```

Verify: no errors. All tables exist:

```bash
docker compose exec postgres psql -U expense -d expense_tracker -c "\dt"
```

Expected output: 11 tables listed (users, sessions, email_codes, invite_links, events, event_buckets, event_members, grant_categories, expenses, expense_receipts, audit_log).

- [ ] **Step 4: Commit**

```bash
git add apps/api/drizzle/
git commit -m "feat(api): generate initial migration — all 11 tables"
```

---

## Task 8: Test Infrastructure + Schema Integration Tests

**Files:**
- Create: `apps/api/test/helpers.ts`
- Create: `apps/api/test/schema.test.ts`

### Steps

- [ ] **Step 1: Create `apps/api/test/helpers.ts`**

Uses a separate test database. Provides per-test cleanup.

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://expense:expense@localhost:5432/expense_tracker_test";

const client = postgres(TEST_DATABASE_URL);
export const testDb = drizzle(client, { schema });

export async function cleanDatabase() {
  await testDb.execute(sql`
    TRUNCATE TABLE audit_log, expense_receipts, expenses,
      grant_categories, event_members, event_buckets, events,
      invite_links, email_codes, sessions, users
    CASCADE
  `);
}

export async function closeDatabase() {
  await client.end();
}

export async function createTestUser(
  overrides: Partial<typeof schema.users.$inferInsert> = {}
) {
  const [user] = await testDb
    .insert(schema.users)
    .values({
      email: `test-${crypto.randomUUID()}@test.com`,
      name: "Test User",
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return user;
}

export async function createTestEvent(
  createdById: string,
  overrides: Partial<typeof schema.events.$inferInsert> = {}
) {
  const [event] = await testDb
    .insert(schema.events)
    .values({
      name: "Test Event",
      createdById,
      ...overrides,
    })
    .returning();
  return event;
}
```

- [ ] **Step 2: Create the test database**

```bash
docker compose exec postgres psql -U expense -d expense_tracker -c "CREATE DATABASE expense_tracker_test;"
cd apps/api && TEST_DATABASE_URL=postgres://expense:expense@localhost:5432/expense_tracker_test bun run db:migrate
```

- [ ] **Step 3: Create `apps/api/test/schema.test.ts`**

```typescript
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase, closeDatabase, createTestUser, createTestEvent } from "./helpers";
import * as schema from "../src/db/schema";

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("users", () => {
  test("creates a user with required fields", async () => {
    const user = await createTestUser({ email: "alex@sfu.ca", name: "Alex Ng" });
    expect(user.email).toBe("alex@sfu.ca");
    expect(user.name).toBe("Alex Ng");
    expect(user.isSuper).toBe(false);
    expect(user.archived).toBe(false);
    expect(user.emailVerified).toBe(true);
    expect(user.deletedAt).toBeNull();
  });

  test("enforces unique email", async () => {
    await createTestUser({ email: "dupe@sfu.ca" });
    expect(
      createTestUser({ email: "dupe@sfu.ca" })
    ).rejects.toThrow();
  });

  test("enforces unique google_id", async () => {
    await createTestUser({ googleId: "g-123" });
    expect(
      createTestUser({ googleId: "g-123" })
    ).rejects.toThrow();
  });

  test("allows null password_hash for google-only users", async () => {
    const user = await createTestUser({ passwordHash: null, googleId: "g-456" });
    expect(user.passwordHash).toBeNull();
    expect(user.googleId).toBe("g-456");
  });
});

describe("events + members", () => {
  test("creates an event with a member", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    const [member] = await testDb
      .insert(schema.eventMembers)
      .values({
        eventId: event.id,
        userId: user.id,
        role: "super",
        canApprove: true,
      })
      .returning();

    expect(member.role).toBe("super");
    expect(member.canApprove).toBe(true);
  });

  test("enforces unique event+user membership", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    await testDb.insert(schema.eventMembers).values({
      eventId: event.id,
      userId: user.id,
      role: "write",
    });

    expect(
      testDb.insert(schema.eventMembers).values({
        eventId: event.id,
        userId: user.id,
        role: "readonly",
      })
    ).rejects.toThrow();
  });

  test("creates event buckets with unique name per event", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    await testDb.insert(schema.eventBuckets).values({
      eventId: event.id,
      name: "bbq",
    });

    expect(
      testDb.insert(schema.eventBuckets).values({
        eventId: event.id,
        name: "bbq",
      })
    ).rejects.toThrow();
  });

  test("allows same bucket name across different events", async () => {
    const user = await createTestUser();
    const event1 = await createTestEvent(user.id, { name: "Event 1" });
    const event2 = await createTestEvent(user.id, { name: "Event 2" });

    const [b1] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event1.id, name: "bbq" })
      .returning();
    const [b2] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event2.id, name: "bbq" })
      .returning();

    expect(b1.name).toBe("bbq");
    expect(b2.name).toBe("bbq");
    expect(b1.eventId).not.toBe(b2.eventId);
  });
});

describe("expenses", () => {
  test("creates an expense with all fields", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id, { grantMode: true });
    const [bucket] = await testDb
      .insert(schema.eventBuckets)
      .values({ eventId: event.id, name: "bbq" })
      .returning();
    const [category] = await testDb
      .insert(schema.grantCategories)
      .values({ eventId: event.id, name: "EVENT SPECIFIC SUPPLIES" })
      .returning();

    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Walmart Tools",
        amountCents: 10733,
        date: "2025-07-15",
        placeOfPurchase: "WALMART",
        status: "paid",
        bucketId: bucket.id,
        paidById: user.id,
        createdById: user.id,
        notes: "Brush, Spray, degreaser, thermometer, dawn detergent",
        motionNumber: 25,
        grantCategoryId: category.id,
        grantSubLabel: "BBQ",
      })
      .returning();

    expect(expense.amountCents).toBe(10733);
    expect(expense.motionNumber).toBe(25);
    expect(expense.grantSubLabel).toBe("BBQ");
  });

  test("creates expense with only required fields", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);

    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Pens",
        amountCents: 805,
        createdById: user.id,
      })
      .returning();

    expect(expense.status).toBe("outstanding");
    expect(expense.notes).toBeNull();
    expect(expense.bucketId).toBeNull();
    expect(expense.motionNumber).toBeNull();
  });

  test("attaches receipts to an expense", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);
    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Pizza Hike",
        amountCents: 26000,
        createdById: user.id,
      })
      .returning();

    const [receipt] = await testDb
      .insert(schema.expenseReceipts)
      .values({
        expenseId: expense.id,
        storageKey: "receipts/abc123.pdf",
        fileName: "dominos-receipt.pdf",
        fileSize: 54321,
        mimeType: "application/pdf",
        tag: "receipt",
        uploadedById: user.id,
      })
      .returning();

    expect(receipt.tag).toBe("receipt");
    expect(receipt.storageKey).toBe("receipts/abc123.pdf");
  });
});

describe("audit log", () => {
  test("logs an expense creation", async () => {
    const user = await createTestUser();
    const event = await createTestEvent(user.id);
    const [expense] = await testDb
      .insert(schema.expenses)
      .values({
        eventId: event.id,
        name: "Test Expense",
        amountCents: 1000,
        createdById: user.id,
      })
      .returning();

    const [log] = await testDb
      .insert(schema.auditLog)
      .values({
        eventId: event.id,
        entityType: "expense",
        entityId: expense.id,
        action: "create",
        changes: {
          name: { old: null, new: "Test Expense" },
          amountCents: { old: null, new: 1000 },
        },
        performedById: user.id,
      })
      .returning();

    expect(log.action).toBe("create");
    expect(log.entityType).toBe("expense");
    expect((log.changes as any).name.new).toBe("Test Expense");
  });
});

describe("invite links", () => {
  test("creates invite link with domain restrictions", async () => {
    const user = await createTestUser({ isSuper: true });

    const [link] = await testDb
      .insert(schema.inviteLinks)
      .values({
        token: crypto.randomUUID(),
        createdById: user.id,
        maxUses: 50,
        defaultRole: "write",
        allowedEmailDomains: ["sfu.ca", "cs.sfu.ca"],
      })
      .returning();

    expect(link.allowedEmailDomains).toEqual(["sfu.ca", "cs.sfu.ca"]);
    expect(link.defaultRole).toBe("write");
    expect(link.currentUses).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bun test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/
git commit -m "test(api): add schema integration tests — users, events, expenses, audit log"
```

---

## Task 9: Storage Abstraction

**Files:**
- Create: `apps/api/src/storage/interface.ts`
- Create: `apps/api/src/storage/disk.ts`
- Create: `apps/api/src/storage/s3.ts`
- Create: `apps/api/src/storage/index.ts`

### Steps

- [ ] **Step 1: Create `apps/api/src/storage/interface.ts`**

```typescript
export interface StorageBackend {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

- [ ] **Step 2: Create `apps/api/src/storage/disk.ts`**

```typescript
import { createHmac } from "crypto";
import { mkdir, readFile, unlink, writeFile, stat } from "fs/promises";
import { dirname, join } from "path";
import type { StorageBackend } from "./interface";

export class DiskStorageBackend implements StorageBackend {
  constructor(
    private basePath: string,
    private baseUrl: string,
    private secret: string
  ) {}

  private filePath(key: string): string {
    return join(this.basePath, key);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const path = this.filePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(
    key: string
  ): Promise<{ data: Buffer; contentType: string } | null> {
    try {
      const data = await readFile(this.filePath(key));
      const ext = key.split(".").pop() ?? "";
      const contentType = MIME_MAP[ext] ?? "application/octet-stream";
      return { data: Buffer.from(data), contentType };
    } catch {
      return null;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = createHmac("sha256", this.secret)
      .update(`${key}:${expires}`)
      .digest("hex");
    return `${this.baseUrl}/api/storage/${encodeURIComponent(key)}?token=${token}&expires=${expires}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch {
      // File already gone
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.filePath(key));
      return true;
    } catch {
      return false;
    }
  }

  verifyToken(key: string, token: string, expires: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (now > Number(expires)) return false;
    const expected = createHmac("sha256", this.secret)
      .update(`${key}:${expires}`)
      .digest("hex");
    return token === expected;
  }
}

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
```

- [ ] **Step 3: Create `apps/api/src/storage/s3.ts`**

```typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageBackend } from "./interface";

export class S3StorageBackend implements StorageBackend {
  private client: S3Client;

  constructor(
    private bucket: string,
    config: {
      region: string;
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: !!config.endpoint,
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
  }

  async get(
    key: string
  ): Promise<{ data: Buffer; contentType: string } | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      const stream = res.Body;
      if (!stream) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return {
        data: Buffer.concat(chunks),
        contentType: res.ContentType ?? "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds }
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Create `apps/api/src/storage/index.ts`**

```typescript
import type { Env } from "../env";
import { DiskStorageBackend } from "./disk";
import { S3StorageBackend } from "./s3";
import type { StorageBackend } from "./interface";

export type { StorageBackend } from "./interface";

export function createStorageBackend(env: Env): StorageBackend {
  if (env.STORAGE_BACKEND === "s3") {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error(
        "S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
      );
    }
    return new S3StorageBackend(env.S3_BUCKET, {
      region: env.S3_REGION ?? "us-east-1",
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
  }

  return new DiskStorageBackend(
    env.STORAGE_DISK_PATH,
    `http://localhost:${env.PORT}`,
    env.SIGNED_URL_SECRET
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storage/
git commit -m "feat(api): add storage abstraction — disk backend for dev, s3 for prod"
```

---

## Task 10: Storage Tests

**Files:**
- Create: `apps/api/test/storage.test.ts`

### Steps

- [ ] **Step 1: Create `apps/api/test/storage.test.ts`**

Tests the disk backend (unit tests, no external deps). S3 backend tested manually or in integration.

```typescript
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { existsSync, rmSync } from "fs";
import { DiskStorageBackend } from "../src/storage/disk";

const TEST_DIR = "/tmp/expense-tracker-test-uploads";
const backend = new DiskStorageBackend(
  TEST_DIR,
  "http://localhost:8888",
  "test-secret"
);

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("DiskStorageBackend", () => {
  test("put and get a file", async () => {
    const data = Buffer.from("hello world");
    await backend.put("test/file.txt", data, "text/plain");

    const result = await backend.get("test/file.txt");
    expect(result).not.toBeNull();
    expect(result!.data.toString()).toBe("hello world");
  });

  test("get returns null for missing file", async () => {
    const result = await backend.get("nonexistent.txt");
    expect(result).toBeNull();
  });

  test("exists returns true for existing file", async () => {
    await backend.put("exists.txt", Buffer.from("x"), "text/plain");
    expect(await backend.exists("exists.txt")).toBe(true);
  });

  test("exists returns false for missing file", async () => {
    expect(await backend.exists("nope.txt")).toBe(false);
  });

  test("delete removes a file", async () => {
    await backend.put("del.txt", Buffer.from("x"), "text/plain");
    await backend.delete("del.txt");
    expect(await backend.exists("del.txt")).toBe(false);
  });

  test("delete does not throw for missing file", async () => {
    await backend.delete("nope.txt"); // should not throw
  });

  test("getSignedUrl returns a URL with token and expiry", async () => {
    const url = await backend.getSignedUrl("test/file.pdf", 3600);
    expect(url).toContain("http://localhost:8888/api/storage/");
    expect(url).toContain("token=");
    expect(url).toContain("expires=");
  });

  test("verifyToken validates a signed URL token", async () => {
    const url = await backend.getSignedUrl("test/file.pdf", 3600);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    const expires = parsed.searchParams.get("expires")!;

    expect(backend.verifyToken("test/file.pdf", token, expires)).toBe(true);
    expect(backend.verifyToken("wrong/key.pdf", token, expires)).toBe(false);
  });

  test("verifyToken rejects expired token", async () => {
    const url = await backend.getSignedUrl("test/file.pdf", -1);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    const expires = parsed.searchParams.get("expires")!;

    expect(backend.verifyToken("test/file.pdf", token, expires)).toBe(false);
  });

  test("creates nested directories on put", async () => {
    await backend.put("deep/nested/dir/file.txt", Buffer.from("deep"), "text/plain");
    expect(await backend.exists("deep/nested/dir/file.txt")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && bun test
```

Expected: all tests pass (both schema and storage suites).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/storage.test.ts
git commit -m "test(api): add disk storage backend tests"
```

---

## Task 11: Seed Data

**Files:**
- Create: `apps/api/src/db/seed.ts`

Seeds a realistic development dataset mirroring the Frosh Budget spreadsheet.

### Steps

- [ ] **Step 1: Create `apps/api/src/db/seed.ts`**

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://expense:expense@localhost:5432/expense_tracker";
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

async function seed() {
  console.log("Seeding database...");

  // Clean existing data
  await db.execute(sql`
    TRUNCATE TABLE audit_log, expense_receipts, expenses,
      grant_categories, event_members, event_buckets, events,
      invite_links, email_codes, sessions, users
    CASCADE
  `);

  // Users
  const [alex] = await db
    .insert(schema.users)
    .values({
      email: "alex@sfu.ca",
      name: "Alexander Ng",
      emailVerified: true,
      isSuper: true,
      passwordHash: "placeholder-will-be-hashed-in-auth-plan",
    })
    .returning();

  const [michael] = await db
    .insert(schema.users)
    .values({
      email: "michael@sfu.ca",
      name: "Michael Ho",
      emailVerified: true,
    })
    .returning();

  const [dina] = await db
    .insert(schema.users)
    .values({
      email: "dina@sfu.ca",
      name: "Dina Zeng",
      emailVerified: true,
    })
    .returning();

  // Event: Ducky Frosh 2025
  const [frosh] = await db
    .insert(schema.events)
    .values({
      name: "Ducky Frosh 2025",
      description: "CSSS Frosh Week 2025",
      grantMode: true,
      createdById: alex.id,
    })
    .returning();

  // Members
  await db.insert(schema.eventMembers).values([
    { eventId: frosh.id, userId: alex.id, role: "super", canApprove: true },
    { eventId: frosh.id, userId: michael.id, role: "write", canApprove: false },
    { eventId: frosh.id, userId: dina.id, role: "write", canApprove: false },
  ]);

  // Buckets
  const bucketNames = [
    "general",
    "ice cream",
    "hike",
    "info sesh",
    "bbq",
    "mountain madness",
  ];
  const buckets: Record<string, string> = {};
  for (let i = 0; i < bucketNames.length; i++) {
    const [b] = await db
      .insert(schema.eventBuckets)
      .values({ eventId: frosh.id, name: bucketNames[i]!, sortOrder: i })
      .returning();
    buckets[bucketNames[i]!] = b.id;
  }

  // Grant Categories
  const categoryNames = [
    "FOOD EXPENSES",
    "EVENT SPECIFIC SUPPLIES",
    "GENERAL SUPPLIES",
    "BANNERS, FLYERS, BOOKLETS",
    "FROSH TSHIRT/HOODIE",
    "FROSH GENERAL / ART & DESIGN",
  ];
  const categories: Record<string, string> = {};
  for (let i = 0; i < categoryNames.length; i++) {
    const [c] = await db
      .insert(schema.grantCategories)
      .values({ eventId: frosh.id, name: categoryNames[i]!, sortOrder: i })
      .returning();
    categories[categoryNames[i]!] = c.id;
  }

  // Expenses (subset of the Frosh Budget spreadsheet)
  const expenseData = [
    {
      name: "Graphic Designer",
      amountCents: 35000,
      date: "2025-04-13",
      place: "ARTIST GRAPHIC DESIGN COMMISSION",
      status: "paid" as const,
      paidBy: dina,
      bucket: "general",
      category: "FROSH GENERAL / ART & DESIGN",
      subLabel: null,
      motion: 22,
      notes: "For Frosh Artwork: Banner & T-shirt",
    },
    {
      name: "T-Shirts",
      amountCents: 119857,
      date: "2025-07-12",
      place: "COWICHAN SOUVENIR CO.",
      status: "paid" as const,
      paidBy: dina,
      bucket: "general",
      category: "FROSH TSHIRT/HOODIE",
      subLabel: null,
      motion: 23,
      notes: "Alex paid with credit card; Dina E-Transferred Alex. Dina will receive grant money.",
    },
    {
      name: "Pizza Hike",
      amountCents: 26000,
      date: "2025-07-13",
      place: "DOMINO'S PIZZA",
      status: "paid" as const,
      paidBy: alex,
      bucket: "hike",
      category: "FOOD EXPENSES",
      subLabel: null,
      motion: 24,
      notes: "Domino's bulk deal @$13 per extra large pizza",
    },
    {
      name: "Walmart tools for BBQ",
      amountCents: 10733,
      date: "2025-07-15",
      place: "WALMART",
      status: "paid" as const,
      paidBy: michael,
      bucket: "bbq",
      category: "EVENT SPECIFIC SUPPLIES",
      subLabel: "BBQ",
      motion: 25,
      notes: "Brush, Spray, degreaser, thermometer, dawn detergent",
    },
    {
      name: "Banner",
      amountCents: 6216,
      date: "2025-07-22",
      place: "ODDBALL WORKSHOP CLOTHING",
      status: "paid" as const,
      paidBy: dina,
      bucket: "general",
      category: "BANNERS, FLYERS, BOOKLETS",
      subLabel: null,
      motion: 26,
      notes: "Notes",
    },
    {
      name: "Pens",
      amountCents: 805,
      date: "2025-08-11",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: michael,
      bucket: "general",
      category: "GENERAL SUPPLIES",
      subLabel: "Pens",
      motion: 27,
      notes: "Pens for signing waivers",
    },
    {
      name: "Birdies",
      amountCents: 2754,
      date: "2025-08-19",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: alex,
      bucket: "general",
      category: "EVENT SPECIFIC SUPPLIES",
      subLabel: "badminton",
      motion: 28,
      notes: "Badminton Birdies",
    },
    {
      name: "Lays Chips",
      amountCents: 12595,
      date: "2025-08-20",
      place: "COSTCO",
      status: "paid" as const,
      paidBy: michael,
      bucket: "bbq",
      category: "FOOD EXPENSES",
      subLabel: "BBQ",
      motion: 29,
      notes: "Lays chips from Costco",
    },
    {
      name: "Amazon Cooler",
      amountCents: 16799,
      date: "2025-08-21",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: michael,
      bucket: "general",
      category: "GENERAL SUPPLIES",
      subLabel: "Cooler",
      motion: 30,
      notes: "Cooler",
    },
    {
      name: "Karaoke Machine",
      amountCents: 48273,
      date: "2025-09-12",
      place: "AMAZON",
      status: "paid" as const,
      paidBy: michael,
      bucket: "mountain madness",
      category: "EVENT SPECIFIC SUPPLIES",
      subLabel: "MIDNIGHT MADNESS",
      motion: 52,
      notes: null,
    },
  ];

  for (const e of expenseData) {
    await db.insert(schema.expenses).values({
      eventId: frosh.id,
      name: e.name,
      amountCents: e.amountCents,
      date: e.date,
      placeOfPurchase: e.place,
      status: e.status,
      paidById: e.paidBy.id,
      createdById: alex.id,
      bucketId: buckets[e.bucket],
      notes: e.notes,
      motionNumber: e.motion,
      grantCategoryId: categories[e.category],
      grantSubLabel: e.subLabel,
    });
  }

  // Invite link
  await db.insert(schema.inviteLinks).values({
    token: "dev-invite-token",
    createdById: alex.id,
    defaultRole: "write",
    maxUses: 100,
  });

  console.log("Seed complete.");
  console.log(`  Users: 3`);
  console.log(`  Events: 1 (Ducky Frosh 2025, Grant Mode)`);
  console.log(`  Buckets: ${bucketNames.length}`);
  console.log(`  Grant Categories: ${categoryNames.length}`);
  console.log(`  Expenses: ${expenseData.length}`);
  console.log(`  Invite link token: dev-invite-token`);

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed**

```bash
cd apps/api && bun run db:seed
```

Verify: output shows counts, no errors.

- [ ] **Step 3: Verify data in Postgres**

```bash
docker compose exec postgres psql -U expense -d expense_tracker -c "SELECT name, amount_cents, status FROM expenses ORDER BY date;"
```

Expected: 10 expense rows matching the seed data.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/seed.ts
git commit -m "feat(api): add seed data — frosh budget with 10 expenses, 3 users, grant categories"
```

---

## Future Plan References

This plan establishes the data layer. Subsequent plans build on it:

- **Plan 2 (Auth):** Adds auth module using `users`, `sessions`, `emailCodes`, `inviteLinks` tables. Implements Google OAuth, email/password with Resend verification, session cookie management, account linking, user archival. Will hash passwords (the seed uses a placeholder).

- **Plan 3 (API & RBAC):** Adds Elysia route modules for all CRUD operations. Implements RBAC guards using `eventMembers.role` + `eventMembers.canApprove` + `users.isSuper`. Audit log middleware writes to `auditLog` on every mutation. Storage backend used for receipt uploads. Adds the `/api/storage/:key` endpoint for disk backend signed URL serving.

- **Plan 4 (Frontend):** Consumes the API. Data table with TanStack Table, inline editing, modal form, kanban grouping, right-click context menu, summary view, "needs more info" filter panel (computed from missing receipt/notes/motion#/category). Event switcher dropdown. Profile pic management.

- **Plan 5 (Real-time & Export):** WebSocket connection for live table sync. XLSX export of full event data. Grant Mode export form (generates the cross-reference table from Image 4). Item description auto-generation: `<EVENT> <BUCKET> <NAME> (motion #N)`. Grant category rendering: `<CATEGORY> (<sub_label>)`.

### Deferred features (documented for later):
- **Audit log UI:** Super right-click → "Show Changes" generates a view of the audit trail for that entity. Tracked in `audit_log` table. Build as a modal/drawer showing a timeline of changes.
- **Receipt tag autocomplete:** Query `SELECT DISTINCT tag FROM expense_receipts WHERE tag IS NOT NULL` for freeform tag suggestions.
- **Place of Purchase autocomplete:** Query `SELECT DISTINCT place_of_purchase FROM expenses WHERE place_of_purchase IS NOT NULL` globally across events.
