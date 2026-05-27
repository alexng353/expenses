# Plan 5: Real-time & Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WebSocket-based real-time table sync, XLSX export of full event data, and Grant Mode cross-reference table export.

**Architecture:** Elysia WebSocket server broadcasts expense mutations to all connected clients for the same event. Clients receive push events and update TanStack Query cache directly. XLSX export generated server-side using ExcelJS. Grant Mode export generates the formal cross-reference table (Image 4 format).

**Tech Stack:** Elysia WebSocket, ExcelJS, TanStack Query cache manipulation

**Depends on:** Plans 1-4

---

## File Map

```
apps/api/src/
├── index.ts                                # MODIFY: mount ws + export modules
├── modules/
│   ├── ws/
│   │   └── index.ts                        # WebSocket server
│   └── export/
│       └── index.ts                        # XLSX export endpoints
├── lib/
│   └── ws-broadcast.ts                     # Event broadcast helper

apps/web/src/
├── hooks/
│   ├── use-websocket.ts                    # WebSocket client hook
│   └── use-expenses.ts                     # MODIFY: replace polling with ws push
├── components/
│   └── exports/
│       └── export-button.tsx               # Export dropdown (XLSX, Grant Form)
```

---

## Task 1: WebSocket Server

**Files:**
- Create: `apps/api/src/lib/ws-broadcast.ts`
- Create: `apps/api/src/modules/ws/index.ts`
- Modify: `apps/api/src/index.ts`

### Steps

- [ ] **Step 1: Create `apps/api/src/lib/ws-broadcast.ts`**

```typescript
import type { ServerWebSocket } from "bun";

interface WsData {
  eventId: string;
  userId: string;
}

const connections = new Map<string, Set<ServerWebSocket<WsData>>>();

export function addConnection(eventId: string, ws: ServerWebSocket<WsData>) {
  let set = connections.get(eventId);
  if (!set) {
    set = new Set();
    connections.set(eventId, set);
  }
  set.add(ws);
}

export function removeConnection(eventId: string, ws: ServerWebSocket<WsData>) {
  const set = connections.get(eventId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) connections.delete(eventId);
  }
}

export function broadcastToEvent(
  eventId: string,
  message: {
    type: "expense_created" | "expense_updated" | "expense_deleted" | "refresh";
    payload?: unknown;
  }
) {
  const set = connections.get(eventId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const ws of set) {
    try {
      ws.send(data);
    } catch {
      set.delete(ws);
    }
  }
}
```

- [ ] **Step 2: Create `apps/api/src/modules/ws/index.ts`**

```typescript
import { Elysia } from "elysia";
import { validateSession } from "../auth/session";
import { db } from "../../db";
import { eventMembers } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { addConnection, removeConnection } from "../../lib/ws-broadcast";

export const wsModule = new Elysia()
  .ws("/api/ws", {
    async open(ws) {
      // Auth via query param (WebSocket can't send cookies in handshake easily)
      const url = new URL(ws.data.request.url);
      const token = url.searchParams.get("token");
      const eventId = url.searchParams.get("eventId");

      if (!token || !eventId) {
        ws.close(4001, "Missing token or eventId");
        return;
      }

      const result = await validateSession(token);
      if (!result || result.user.archived) {
        ws.close(4001, "Invalid session");
        return;
      }

      // Verify event membership
      if (!result.user.isSuper) {
        const [member] = await db
          .select()
          .from(eventMembers)
          .where(
            and(
              eq(eventMembers.eventId, eventId),
              eq(eventMembers.userId, result.user.id),
              isNull(eventMembers.deletedAt)
            )
          );
        if (!member) {
          ws.close(4003, "Not a member of this event");
          return;
        }
      }

      (ws as any)._eventId = eventId;
      (ws as any)._userId = result.user.id;
      addConnection(eventId, ws.raw as any);
    },

    close(ws) {
      const eventId = (ws as any)._eventId;
      if (eventId) {
        removeConnection(eventId, ws.raw as any);
      }
    },

    message(_ws, _message) {
      // Client doesn't send messages — this is push-only
    },
  });
```

- [ ] **Step 3: Wire broadcasts into expense mutations**

Add to the expense module (`apps/api/src/modules/expenses/index.ts`) — import and call `broadcastToEvent` after each mutation:

```typescript
import { broadcastToEvent } from "../../lib/ws-broadcast";

// After create:
broadcastToEvent(params.eventId, { type: "expense_created", payload: expense });

// After update:
broadcastToEvent(params.eventId, { type: "expense_updated", payload: updated });

// After delete:
broadcastToEvent(params.eventId, { type: "expense_deleted", payload: { id: params.expenseId } });

// After approve:
broadcastToEvent(params.eventId, { type: "expense_updated", payload: updated });
```

- [ ] **Step 4: Mount WS module in `apps/api/src/index.ts`**

Add `import { wsModule } from "./modules/ws"` and `.use(wsModule)` before the `.group("/api", ...)`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ws-broadcast.ts apps/api/src/modules/ws/ apps/api/src/modules/expenses/index.ts apps/api/src/index.ts
git commit -m "feat(api): add websocket server for real-time expense sync"
```

---

## Task 2: WebSocket Client Hook

**Files:**
- Create: `apps/web/src/hooks/use-websocket.ts`
- Modify: `apps/web/src/hooks/use-expenses.ts`

### Steps

- [ ] **Step 1: Create `apps/web/src/hooks/use-websocket.ts`**

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEvent } from "./use-event";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8888";

export function useExpenseWebSocket() {
  const { currentEvent } = useEvent();
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!currentEvent?.id) return;

    // Get session token from cookie (read it via /api/auth/me or store it)
    // For simplicity, we pass it as a query param by fetching a short-lived ws token
    // Actually, we'll use the session cookie approach — extract from document.cookie
    const sessionMatch = document.cookie.match(/session=([^;]+)/);
    const token = sessionMatch?.[1];
    if (!token) return;

    const ws = new WebSocket(
      `${WS_BASE}/api/ws?token=${token}&eventId=${currentEvent.id}`
    );

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // Invalidate queries to refetch
      if (
        msg.type === "expense_created" ||
        msg.type === "expense_updated" ||
        msg.type === "expense_deleted"
      ) {
        qc.invalidateQueries({
          queryKey: ["events", currentEvent.id, "expenses"],
        });
        qc.invalidateQueries({
          queryKey: ["events", currentEvent.id, "summary"],
        });
      } else if (msg.type === "refresh") {
        qc.invalidateQueries({
          queryKey: ["events", currentEvent.id],
        });
      }
    };

    ws.onclose = () => {
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    wsRef.current = ws;
  }, [currentEvent?.id, qc]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
```

- [ ] **Step 2: Update `apps/web/src/hooks/use-expenses.ts`**

Remove the `refetchInterval: 10_000` from `useExpenses` and `useExpenseSummary` queries. The WebSocket push now handles real-time updates via query invalidation.

```typescript
// In useExpenses():
// REMOVE: refetchInterval: 10_000,

// In useExpenseSummary():
// REMOVE: refetchInterval: 10_000,
```

- [ ] **Step 3: Use the hook in the dashboard**

Add `useExpenseWebSocket()` call in `apps/web/src/pages/dashboard.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/ apps/web/src/pages/dashboard.tsx
git commit -m "feat(web): add websocket client hook, replace polling with push updates"
```

---

## Task 3: XLSX Export

**Files:**
- Create: `apps/api/src/modules/export/index.ts`
- Modify: `apps/api/src/index.ts`

### Steps

- [ ] **Step 1: Install ExcelJS**

```bash
cd apps/api && bun add exceljs
```

- [ ] **Step 2: Create `apps/api/src/modules/export/index.ts`**

```typescript
import { Elysia, t } from "elysia";
import ExcelJS from "exceljs";
import { db } from "../../db";
import {
  expenses,
  eventBuckets,
  events,
  grantCategories,
  users,
} from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireEventRole } from "../auth/guards";

export const exportModule = new Elysia({ prefix: "/events/:eventId/export" })
  .use(requireEventRole("readonly", "write", "edit_others", "super"))

  // Full event XLSX export
  .get("/xlsx", async ({ params }) => {
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, params.eventId));

    const allExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.eventId, params.eventId),
          isNull(expenses.deletedAt)
        )
      )
      .orderBy(expenses.date);

    const allBuckets = await db
      .select()
      .from(eventBuckets)
      .where(
        and(
          eq(eventBuckets.eventId, params.eventId),
          isNull(eventBuckets.deletedAt)
        )
      );

    const allUsers = await db.select().from(users).where(isNull(users.deletedAt));
    const userMap = new Map(allUsers.map((u) => [u.id, u.name]));
    const bucketMap = new Map(allBuckets.map((b) => [b.id, b.name]));

    const wb = new ExcelJS.Workbook();

    // Sheet 1: Expenses
    const ws = wb.addWorksheet(event.name);
    ws.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "Expense", key: "name", width: 30 },
      { header: "Total Cost", key: "amount", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "Paid By", key: "paidBy", width: 18 },
      { header: "Bucket", key: "bucket", width: 16 },
      { header: "Notes", key: "notes", width: 40 },
      { header: "Place of Purchase", key: "place", width: 25 },
    ];

    // Style header
    ws.getRow(1).font = { bold: true };

    for (const exp of allExpenses) {
      ws.addRow({
        date: exp.date,
        name: exp.name,
        amount: exp.amountCents / 100,
        status: exp.status,
        paidBy: exp.paidById ? userMap.get(exp.paidById) ?? "" : "",
        bucket: exp.bucketId ? bucketMap.get(exp.bucketId) ?? "" : "",
        notes: exp.notes ?? "",
        place: exp.placeOfPurchase ?? "",
      });
    }

    // Format amount column as currency
    ws.getColumn("amount").numFmt = '$#,##0.00';

    // Sheet 2: Summary
    const summary = wb.addWorksheet("Summary");
    summary.columns = [
      { header: "Bucket", key: "bucket", width: 20 },
      { header: "Total", key: "total", width: 14 },
    ];
    summary.getRow(1).font = { bold: true };

    for (const bucket of allBuckets) {
      const total = allExpenses
        .filter((e) => e.bucketId === bucket.id)
        .reduce((sum, e) => sum + e.amountCents, 0);
      summary.addRow({
        bucket: bucket.name,
        total: total / 100,
      });
    }

    const grandTotal = allExpenses.reduce((s, e) => s + e.amountCents, 0);
    summary.addRow({ bucket: "TOTAL", total: grandTotal / 100 });
    summary.lastRow!.font = { bold: true };
    summary.getColumn("total").numFmt = '$#,##0.00';

    // Sheet 3: Grant Form (if Grant Mode)
    if (event.grantMode) {
      const allCategories = await db
        .select()
        .from(grantCategories)
        .where(
          and(
            eq(grantCategories.eventId, params.eventId),
            isNull(grantCategories.deletedAt)
          )
        );
      const catMap = new Map(allCategories.map((c) => [c.id, c.name]));

      const grantWs = wb.addWorksheet("Grant Form");
      grantWs.columns = [
        { header: "Date DD/MM/YY", key: "date", width: 14 },
        { header: "Place of Purchase", key: "place", width: 30 },
        { header: "Item Description", key: "description", width: 55 },
        { header: "Associated Item Category (See Grant)", key: "category", width: 40 },
        { header: "Amount ($)", key: "amount", width: 14 },
      ];
      grantWs.getRow(1).font = { bold: true };

      for (const exp of allExpenses) {
        const bucketName = exp.bucketId
          ? bucketMap.get(exp.bucketId)?.toUpperCase() ?? ""
          : "";
        const motionStr = exp.motionNumber
          ? `(motion #${exp.motionNumber})`
          : "(motion #MISSING)";
        const description = `${event.name.toUpperCase()} ${bucketName} ${exp.name.toUpperCase()} ${motionStr}`.trim();

        const catName = exp.grantCategoryId
          ? catMap.get(exp.grantCategoryId) ?? ""
          : "";
        const subLabel = exp.grantSubLabel;
        const category = subLabel ? `${catName} (${subLabel})` : catName;

        grantWs.addRow({
          date: exp.date,
          place: (exp.placeOfPurchase ?? "").toUpperCase(),
          description,
          category,
          amount: exp.amountCents / 100,
        });
      }

      grantWs.getColumn("amount").numFmt = '$#,##0.00';
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as Buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${event.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.xlsx"`,
      },
    });
  });
```

- [ ] **Step 3: Mount export module**

Add to `apps/api/src/index.ts`:

```typescript
import { exportModule } from "./modules/export";
// Add .use(exportModule) inside the /api group
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/export/ apps/api/src/index.ts apps/api/package.json
git commit -m "feat(api): add xlsx export — full event data + summary + grant form sheets"
```

---

## Task 4: Export Button (Frontend)

**Files:**
- Create: `apps/web/src/components/exports/export-button.tsx`
- Modify: `apps/web/src/pages/dashboard.tsx`

### Steps

- [ ] **Step 1: Create `apps/web/src/components/exports/export-button.tsx`**

```typescript
import { useEvent } from "../../hooks/use-event";
import { Button } from "@workspace/ui/components/button";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8888/api";

export function ExportButton() {
  const { currentEvent } = useEvent();
  if (!currentEvent) return null;

  const handleExport = () => {
    // Direct download via browser fetch with credentials
    window.open(
      `${API_BASE}/events/${currentEvent.id}/export/xlsx`,
      "_blank"
    );
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      Export XLSX
    </Button>
  );
}
```

- [ ] **Step 2: Add ExportButton to dashboard header**

In `apps/web/src/pages/dashboard.tsx`, add the `<ExportButton />` component in the top action bar.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/exports/ apps/web/src/pages/dashboard.tsx
git commit -m "feat(web): add xlsx export button with direct download"
```

---

## Notes for Implementer

**WebSocket auth:** The current approach reads the session token from `document.cookie`. This only works if the cookie is NOT httpOnly. Since our cookies ARE httpOnly (correct for security), we need an alternative. Options:
1. Add a `POST /api/auth/ws-token` endpoint that returns a short-lived token (5 min) for WebSocket auth. The client calls this before connecting.
2. Use the Elysia WebSocket upgrade handler to read the cookie from the HTTP upgrade request headers.

Option 2 is cleaner — Elysia's WS handler has access to the request headers during the upgrade handshake. Update `apps/api/src/modules/ws/index.ts` to read the cookie from `ws.data.request.headers.get("cookie")` instead of a query param.

**XLSX download auth:** The `window.open` approach won't send credentials. Either:
1. Use `fetch` with `credentials: include`, create a blob URL, and trigger download
2. Add a short-lived download token endpoint

Option 1 is simpler:
```typescript
const res = await fetch(url, { credentials: "include" });
const blob = await res.blob();
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = "export.xlsx";
a.click();
URL.revokeObjectURL(a.href);
```
