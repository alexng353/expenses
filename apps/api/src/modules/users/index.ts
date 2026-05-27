import { Elysia, t } from "elysia";
import { db } from "../../db";
import { users } from "../../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireSuper } from "../auth/guards";
import { sendAccountSetupEmail } from "../auth/email";
import { env } from "../../env";

export const usersModule = new Elysia({ prefix: "/users" })
  .use(requireSuper)

  // Create user manually (shell account)
  .post(
    "/",
    async ({ body, set }) => {
      const existing = await db.query.users.findFirst({
        where: and(eq(users.email, body.email), isNull(users.deletedAt)),
      });
      if (existing) {
        set.status = 409;
        return { error: "Email already registered" };
      }

      const [user] = await db
        .insert(users)
        .values({
          email: body.email,
          name: body.name,
          emailVerified: false,
          isSuper: body.isSuper ?? false,
        })
        .returning();

      // Send account setup email
      const setupUrl = `${env.CORS_ORIGIN}/setup?email=${encodeURIComponent(user.email)}`;
      try {
        await sendAccountSetupEmail(user.email, setupUrl);
      } catch {
        // Email sending is best-effort for manual creation
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuper: user.isSuper,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        name: t.String({ minLength: 1 }),
        isSuper: t.Optional(t.Boolean()),
      }),
    }
  )

  // Archive user
  .post(
    "/:userId/archive",
    async ({ params, set }) => {
      const [user] = await db
        .update(users)
        .set({ archived: true })
        .where(
          and(eq(users.id, params.userId), isNull(users.deletedAt))
        )
        .returning();
      if (!user) {
        set.status = 404;
        return { error: "User not found" };
      }
      return { ok: true };
    },
    { params: t.Object({ userId: t.String() }) }
  )

  // Unarchive user
  .post(
    "/:userId/unarchive",
    async ({ params, set }) => {
      const [user] = await db
        .update(users)
        .set({ archived: false })
        .where(
          and(eq(users.id, params.userId), isNull(users.deletedAt))
        )
        .returning();
      if (!user) {
        set.status = 404;
        return { error: "User not found" };
      }
      return { ok: true };
    },
    { params: t.Object({ userId: t.String() }) }
  )

  // List all users
  .get("/", async () => {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isSuper: users.isSuper,
        archived: users.archived,
        emailVerified: users.emailVerified,
        avatarSource: users.avatarSource,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(isNull(users.deletedAt));
    return allUsers;
  });
