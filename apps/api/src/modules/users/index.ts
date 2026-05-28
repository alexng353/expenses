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

  // Update user
  .patch(
    "/:userId",
    async ({ body, params, set }) => {
      const updateObject: { name?: string; isSuper?: boolean } = {};
      if (body.name !== undefined) {
        updateObject.name = body.name;
      }
      if (body.isSuper !== undefined) {
        updateObject.isSuper = body.isSuper;
      }

      if (body.name === undefined && body.isSuper === undefined) {
        const user = await db.query.users.findFirst({
          where: and(eq(users.id, params.userId), isNull(users.deletedAt)),
        });
        if (!user) {
          set.status = 404;
          return { error: "User not found" };
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isSuper: user.isSuper,
          archived: user.archived,
          emailVerified: user.emailVerified,
          avatarSource: user.avatarSource,
          createdAt: user.createdAt,
        };
      }

      const [user] = await db
        .update(users)
        .set(updateObject)
        .where(
          and(eq(users.id, params.userId), isNull(users.deletedAt))
        )
        .returning();
      if (!user) {
        set.status = 404;
        return { error: "User not found" };
      }
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuper: user.isSuper,
        archived: user.archived,
        emailVerified: user.emailVerified,
        avatarSource: user.avatarSource,
        createdAt: user.createdAt,
      };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        isSuper: t.Optional(t.Boolean()),
      }),
      params: t.Object({ userId: t.String() }),
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
