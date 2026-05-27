import { randomBytes } from "crypto";

const WS_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface WsTokenEntry {
  userId: string;
  expiresAt: number;
}

/** In-memory store for short-lived WebSocket auth tokens */
const wsTokens = new Map<string, WsTokenEntry>();

export function createWsToken(userId: string): string {
  const token = randomBytes(32).toString("hex");
  wsTokens.set(token, {
    userId,
    expiresAt: Date.now() + WS_TOKEN_TTL_MS,
  });
  return token;
}

/**
 * Validates and consumes a WS token. Returns the userId if valid, null
 * otherwise. Each token is single-use.
 */
export function consumeWsToken(token: string): string | null {
  const entry = wsTokens.get(token);
  if (!entry) return null;
  wsTokens.delete(token);
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
}

/** Periodic cleanup of expired tokens (run every 60s) */
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of wsTokens) {
    if (now > entry.expiresAt) wsTokens.delete(token);
  }
}, 60_000);
