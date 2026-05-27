import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./env";

const app = new Elysia()
  .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  .get("/api/health", () => ({ status: "ok" }))
  .listen(env.PORT);

console.log(`API running at http://localhost:${env.PORT}`);

export type App = typeof app;
