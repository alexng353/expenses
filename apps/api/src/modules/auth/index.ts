import { Elysia, t } from "elysia";
import { db } from "../../db";
import { users, inviteLinks, emailCodes, sessions } from "../../db/schema";
import { eq, and, gt, isNull, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
} from "./session";
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUserInfo,
} from "./google";
import {
  generateVerificationCode,
  sendVerificationEmail,
  sendAccountSetupEmail,
} from "./email";
import { authPlugin } from "./guards";
import { checkRateLimit } from "../../lib/rate-limit";
import { env } from "../../env";

export const authModule = new Elysia({ prefix: "/auth" })
  // === Registration (invite required) ===

  // Get invite link info
  .get(
    "/invite/:token",
    async ({ params, set }) => {
      const invite = await db.query.inviteLinks.findFirst({
        where: and(
          eq(inviteLinks.token, params.token),
          isNull(inviteLinks.deletedAt)
        ),
      });
      if (!invite) {
        set.status = 404;
        return { error: "Invalid invite link" };
      }
      if (invite.expiresAt && new Date() > invite.expiresAt) {
        set.status = 410;
        return { error: "Invite link has expired" };
      }
      if (invite.maxUses && invite.currentUses >= invite.maxUses) {
        set.status = 410;
        return { error: "Invite link has been fully used" };
      }
      return {
        defaultRole: invite.defaultRole,
        allowedEmailDomains: invite.allowedEmailDomains,
      };
    },
    { params: t.Object({ token: t.String() }) }
  )

  // Register with email + password
  .post(
    "/register",
    async ({ body, set }) => {
      // Validate invite
      const invite = await db.query.inviteLinks.findFirst({
        where: and(
          eq(inviteLinks.token, body.inviteToken),
          isNull(inviteLinks.deletedAt)
        ),
      });
      if (!invite) {
        set.status = 400;
        return { error: "Invalid invite link" };
      }
      if (invite.expiresAt && new Date() > invite.expiresAt) {
        set.status = 410;
        return { error: "Invite link has expired" };
      }
      if (invite.maxUses && invite.currentUses >= invite.maxUses) {
        set.status = 410;
        return { error: "Invite link has been fully used" };
      }

      // Check email domain
      if (invite.allowedEmailDomains && invite.allowedEmailDomains.length > 0) {
        const domain = body.email.split("@")[1];
        if (!invite.allowedEmailDomains.includes(domain!)) {
          set.status = 400;
          return {
            error: `Email must be from: ${invite.allowedEmailDomains.join(", ")}`,
          };
        }
      }

      // Check for existing user
      const existing = await db.query.users.findFirst({
        where: and(eq(users.email, body.email), isNull(users.deletedAt)),
      });
      if (existing && existing.emailVerified) {
        set.status = 409;
        return { error: "Email already registered" };
      }

      // Atomically claim invite use
      const [claimed] = await db
        .update(inviteLinks)
        .set({ currentUses: sql`${inviteLinks.currentUses} + 1` })
        .where(
          and(
            eq(inviteLinks.id, invite.id),
            invite.maxUses
              ? sql`${inviteLinks.currentUses} < ${invite.maxUses}`
              : sql`true`
          )
        )
        .returning();
      if (!claimed) {
        set.status = 410;
        return { error: "Invite link has been fully used" };
      }

      const passwordHash = await hashPassword(body.password);

      try {
        if (existing && !existing.emailVerified) {
          // Update shell account
          await db
            .update(users)
            .set({ name: body.name, passwordHash })
            .where(eq(users.id, existing.id));
        } else {
          // Create new user
          await db.insert(users).values({
            email: body.email,
            name: body.name,
            passwordHash,
            emailVerified: false,
          });
        }
      } catch (err: unknown) {
        // Roll back invite use
        await db
          .update(inviteLinks)
          .set({ currentUses: sql`${inviteLinks.currentUses} - 1` })
          .where(eq(inviteLinks.id, invite.id));
        throw err;
      }

      // Send verification code
      const code = generateVerificationCode();
      await db.insert(emailCodes).values({
        email: body.email,
        code,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      await sendVerificationEmail(body.email, code);

      return { message: "Verification code sent to your email" };
    },
    {
      body: t.Object({
        inviteToken: t.String(),
        email: t.String({ format: "email" }),
        name: t.String({ minLength: 1 }),
        password: t.String({ minLength: 8 }),
      }),
    }
  )

  // Verify email
  .post(
    "/verify-email",
    async ({ body, cookie, set, request }) => {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const rl = checkRateLimit(`verify:${ip}`, 10, 15 * 60 * 1000);
      if (!rl.allowed) {
        set.status = 429;
        return { error: "Too many attempts. Try again later." };
      }

      const codeRecord = await db.query.emailCodes.findFirst({
        where: and(
          eq(emailCodes.email, body.email),
          gt(emailCodes.expiresAt, new Date()),
          isNull(emailCodes.usedAt)
        ),
        orderBy: (c, { desc }) => desc(c.createdAt),
      });

      if (!codeRecord) {
        set.status = 401;
        return { error: "Invalid or expired code" };
      }
      if (codeRecord.attempts >= 5) {
        set.status = 429;
        return { error: "Too many attempts. Request a new code." };
      }
      if (codeRecord.code !== body.code) {
        await db
          .update(emailCodes)
          .set({ attempts: sql`${emailCodes.attempts} + 1` })
          .where(eq(emailCodes.id, codeRecord.id));
        set.status = 401;
        return { error: "Invalid code" };
      }

      // Atomically mark used
      const [marked] = await db
        .update(emailCodes)
        .set({ usedAt: new Date() })
        .where(
          and(eq(emailCodes.id, codeRecord.id), isNull(emailCodes.usedAt))
        )
        .returning();
      if (!marked) {
        set.status = 401;
        return { error: "Code already used" };
      }

      // Mark user verified
      const [user] = await db
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.email, body.email))
        .returning();
      if (!user) {
        set.status = 404;
        return { error: "User not found" };
      }

      // Create session
      const { token, expiresAt } = await createSession(user.id);
      setSessionCookie(cookie, token, expiresAt);

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
        code: t.String({ minLength: 6, maxLength: 6 }),
      }),
    }
  )

  // Resend verification code
  .post(
    "/resend-code",
    async ({ body, set }) => {
      const rl = checkRateLimit(`resend:${body.email}`, 3, 10 * 60 * 1000);
      if (!rl.allowed) {
        set.status = 429;
        return { error: "Too many requests. Wait a few minutes." };
      }

      const user = await db.query.users.findFirst({
        where: and(eq(users.email, body.email), isNull(users.deletedAt)),
      });
      if (!user || user.emailVerified) {
        // Don't leak whether email exists
        return { message: "If the email is registered, a code was sent." };
      }

      const code = generateVerificationCode();
      await db.insert(emailCodes).values({
        email: body.email,
        code,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      await sendVerificationEmail(body.email, code);

      return { message: "If the email is registered, a code was sent." };
    },
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
    }
  )

  // === Login ===

  // Email + password login
  .post(
    "/login",
    async ({ body, cookie, set, request }) => {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const rl = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
      if (!rl.allowed) {
        set.status = 429;
        return { error: "Too many login attempts. Try again later." };
      }

      const user = await db.query.users.findFirst({
        where: and(eq(users.email, body.email), isNull(users.deletedAt)),
      });
      if (!user || !user.passwordHash) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }
      if (user.archived) {
        set.status = 403;
        return {
          error:
            "Your account has been deactivated. Contact an administrator.",
        };
      }
      if (!user.emailVerified) {
        set.status = 403;
        return { error: "Email not verified. Check your inbox." };
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const { token, expiresAt } = await createSession(user.id);
      setSessionCookie(cookie, token, expiresAt);

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
        password: t.String(),
      }),
    }
  )

  // === Google OAuth ===

  // Initiate Google login/register
  .get(
    "/google",
    ({ query, set }) => {
      const state = Buffer.from(
        JSON.stringify({
          inviteToken: query.inviteToken ?? null,
          returnTo: query.returnTo ?? "/",
        })
      ).toString("base64url");

      const url = getGoogleAuthUrl(state);
      set.redirect = url;
    },
    {
      query: t.Object({
        inviteToken: t.Optional(t.String()),
        returnTo: t.Optional(t.String()),
      }),
    }
  )

  // Google OAuth callback
  .get(
    "/google/callback",
    async ({ query, cookie, set }) => {
      if (query.error) {
        set.redirect = `${env.CORS_ORIGIN}/login?error=google_denied`;
        return;
      }

      let state: { inviteToken: string | null; returnTo: string };
      try {
        state = JSON.parse(
          Buffer.from(query.state, "base64url").toString()
        );
      } catch {
        set.redirect = `${env.CORS_ORIGIN}/login?error=invalid_state`;
        return;
      }

      const tokens = await exchangeGoogleCode(query.code);
      const googleUser = await getGoogleUserInfo(tokens.access_token);

      // Check if user exists by googleId
      let user = await db.query.users.findFirst({
        where: and(
          eq(users.googleId, googleUser.id),
          isNull(users.deletedAt)
        ),
      });

      if (user) {
        // Existing Google user — login
        if (user.archived) {
          set.redirect = `${env.CORS_ORIGIN}/login?error=account_deactivated`;
          return;
        }
        const { token, expiresAt } = await createSession(user.id);
        setSessionCookie(cookie, token, expiresAt);
        set.redirect = `${env.CORS_ORIGIN}${state.returnTo}`;
        return;
      }

      // Check if user exists by email (auto-link)
      user = await db.query.users.findFirst({
        where: and(
          eq(users.email, googleUser.email),
          isNull(users.deletedAt)
        ),
      });

      if (user) {
        // Existing email user — link Google account
        if (user.archived) {
          set.redirect = `${env.CORS_ORIGIN}/login?error=account_deactivated`;
          return;
        }
        await db
          .update(users)
          .set({
            googleId: googleUser.id,
            emailVerified: true,
            avatarSource: user.avatarSource ?? "google",
          })
          .where(eq(users.id, user.id));

        const { token, expiresAt } = await createSession(user.id);
        setSessionCookie(cookie, token, expiresAt);
        set.redirect = `${env.CORS_ORIGIN}${state.returnTo}`;
        return;
      }

      // New user — requires invite token
      if (!state.inviteToken) {
        set.redirect = `${env.CORS_ORIGIN}/login?error=no_account`;
        return;
      }

      // Validate and claim invite
      const [invite] = await db
        .update(inviteLinks)
        .set({ currentUses: sql`${inviteLinks.currentUses} + 1` })
        .where(
          and(
            eq(inviteLinks.token, state.inviteToken),
            isNull(inviteLinks.deletedAt),
            sql`${inviteLinks.expiresAt} IS NULL OR ${inviteLinks.expiresAt} > NOW()`,
            sql`${inviteLinks.maxUses} IS NULL OR ${inviteLinks.currentUses} < ${inviteLinks.maxUses}`
          )
        )
        .returning();

      if (!invite) {
        set.redirect = `${env.CORS_ORIGIN}/login?error=invalid_invite`;
        return;
      }

      // Check domain restriction
      if (
        invite.allowedEmailDomains &&
        invite.allowedEmailDomains.length > 0
      ) {
        const domain = googleUser.email.split("@")[1];
        if (!invite.allowedEmailDomains.includes(domain!)) {
          // Roll back invite use
          await db
            .update(inviteLinks)
            .set({ currentUses: sql`${inviteLinks.currentUses} - 1` })
            .where(eq(inviteLinks.id, invite.id));
          set.redirect = `${env.CORS_ORIGIN}/login?error=domain_restricted`;
          return;
        }
      }

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.id,
          emailVerified: true,
          avatarSource: "google",
        })
        .returning();

      const { token, expiresAt } = await createSession(newUser.id);
      setSessionCookie(cookie, token, expiresAt);
      set.redirect = `${env.CORS_ORIGIN}${state.returnTo}`;
    },
    {
      query: t.Object({
        code: t.String(),
        state: t.String(),
        error: t.Optional(t.String()),
      }),
    }
  )

  // === Session management ===

  // Get current user
  .use(authPlugin)
  .get("/me", ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Not authenticated" };
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuper: user.isSuper,
      avatarSource: user.avatarSource,
      avatarThumbnail: user.avatarThumbnail
        ? `data:image/jpeg;base64,${user.avatarThumbnail.toString("base64")}`
        : null,
    };
  })

  // Logout
  .post("/logout", async ({ cookie }) => {
    const token = cookie.session?.value as string | undefined;
    if (token) {
      await deleteSession(token);
      clearSessionCookie(cookie);
    }
    return { ok: true };
  })

  // === Account management ===

  // Link Google account (for logged-in users without Google)
  .post(
    "/link-google",
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Not authenticated" };
      }
      if (user.googleId) {
        set.status = 400;
        return { error: "Google account already linked" };
      }
      // Return the OAuth URL — frontend redirects there
      const state = Buffer.from(
        JSON.stringify({ linkToUserId: user.id })
      ).toString("base64url");
      return { url: getGoogleAuthUrl(state) };
    }
  )

  // Set password (for Google-only users)
  .post(
    "/set-password",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Not authenticated" };
      }
      if (user.passwordHash) {
        set.status = 400;
        return { error: "Password already set. Use change-password instead." };
      }
      const hash = await hashPassword(body.password);
      await db
        .update(users)
        .set({ passwordHash: hash })
        .where(eq(users.id, user.id));
      return { ok: true };
    },
    {
      body: t.Object({
        password: t.String({ minLength: 8 }),
      }),
    }
  )

  // Change password
  .post(
    "/change-password",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Not authenticated" };
      }
      if (!user.passwordHash) {
        set.status = 400;
        return { error: "No password set. Use set-password instead." };
      }
      const valid = await verifyPassword(
        body.currentPassword,
        user.passwordHash
      );
      if (!valid) {
        set.status = 401;
        return { error: "Current password is incorrect" };
      }
      const hash = await hashPassword(body.newPassword);
      await db
        .update(users)
        .set({ passwordHash: hash })
        .where(eq(users.id, user.id));
      return { ok: true };
    },
    {
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 8 }),
      }),
    }
  );
