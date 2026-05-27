import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env } from "./env";
import { authModule } from "./modules/auth";
import { usersModule } from "./modules/users";
import { eventsModule } from "./modules/events";
import { expensesModule } from "./modules/expenses";
import { auditModule } from "./modules/audit";
import { autocompleteModule } from "./modules/autocomplete";
import { storageModule } from "./modules/storage";
import { wsModule } from "./modules/ws";
import { exportModule } from "./modules/export";

const app = new Elysia()
  .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  .use(wsModule)
  .get("/api/health", () => ({ status: "ok" }))
  .group("/api", (app) =>
    app
      .use(authModule)
      .use(usersModule)
      .use(eventsModule)
      .use(expensesModule)
      .use(auditModule)
      .use(autocompleteModule)
      .use(storageModule)
      .use(exportModule)
  )
  .listen(env.PORT);

console.log(`API running at http://localhost:${env.PORT}`);

export type App = typeof app;
