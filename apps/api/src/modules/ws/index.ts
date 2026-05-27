import { Elysia } from "elysia";
import { db } from "../../db";
import { eventMembers, users } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { addConnection, removeConnection } from "../../lib/ws-broadcast";
import { consumeWsToken } from "../../lib/ws-tokens";

export const wsModule = new Elysia().ws("/api/ws", {
  async open(ws) {
    const url = new URL(ws.data.request.url);
    const token = url.searchParams.get("token");
    const eventId = url.searchParams.get("eventId");

    if (!token || !eventId) {
      ws.close(4001, "Missing token or eventId");
      return;
    }

    // Validate the short-lived WS token
    const userId = consumeWsToken(token);
    if (!userId) {
      ws.close(4001, "Invalid or expired token");
      return;
    }

    // Verify the user still exists and is not archived
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    if (!user || user.archived) {
      ws.close(4001, "Invalid user");
      return;
    }

    // Verify event membership (super users bypass)
    if (!user.isSuper) {
      const [member] = await db
        .select()
        .from(eventMembers)
        .where(
          and(
            eq(eventMembers.eventId, eventId),
            eq(eventMembers.userId, userId),
            isNull(eventMembers.deletedAt)
          )
        );
      if (!member) {
        ws.close(4003, "Not a member of this event");
        return;
      }
    }

    // Store metadata on the WS instance for cleanup
    (ws as any)._eventId = eventId;
    (ws as any)._userId = userId;
    addConnection(eventId, ws.raw as any);
  },

  close(ws) {
    const eventId = (ws as any)._eventId;
    if (eventId) {
      removeConnection(eventId, ws.raw as any);
    }
  },

  message(_ws, _message) {
    // Client doesn't send messages - this is push-only
  },
});
