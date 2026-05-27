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

export function removeConnection(
  eventId: string,
  ws: ServerWebSocket<WsData>
) {
  const set = connections.get(eventId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) connections.delete(eventId);
  }
}

export function broadcastToEvent(
  eventId: string,
  message: {
    type:
      | "expense_created"
      | "expense_updated"
      | "expense_deleted"
      | "refresh";
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
