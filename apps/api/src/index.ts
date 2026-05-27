import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env } from "./env";
import { authModule } from "./modules/auth";
import { usersModule } from "./modules/users";

const app = new Elysia()
  .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  .get("/api/health", () => ({ status: "ok" }))
  .group("/api", (app) => app.use(authModule).use(usersModule))
  .listen(env.PORT);

console.log(`API running at http://localhost:${env.PORT}`);

export type App = typeof app;
