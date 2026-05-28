import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEvent } from "./use-event";
import { api } from "../lib/api";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8888";

export function useExpenseWebSocket() {
  const { currentEvent } = useEvent();
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(async () => {
    if (!currentEvent?.id) return;

    // Fetch a short-lived WS token from the server (uses httpOnly session cookie)
    let token: string;
    try {
      const res = await api<{ token: string }>("/auth/ws-token", {
        method: "POST",
      });
      token = res.token;
    } catch {
      // Not authenticated or network error; retry later
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
      return;
    }

    const ws = new WebSocket(
      `${WS_BASE}/api/ws?token=${encodeURIComponent(token)}&eventId=${encodeURIComponent(currentEvent.id)}`
    );

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
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
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };

    wsRef.current = ws;
  }, [currentEvent?.id, qc]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
