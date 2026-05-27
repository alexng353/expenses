import { Resend } from "resend";
import { env } from "../../env";
import { randomInt } from "crypto";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

export function generateVerificationCode(): string {
  return String(randomInt(100000, 999999));
}

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  await getResend().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Verify your email — Expense Tracker",
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Email Verification</h2>
        <p>Your verification code is:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 16px; background: #f4f4f5; border-radius: 8px; text-align: center;">${code}</p>
        <p style="color: #71717a; font-size: 14px;">This code expires in 15 minutes.</p>
      </div>
    `,
  });
}

export async function sendAccountSetupEmail(
  to: string,
  setupUrl: string
): Promise<void> {
  await getResend().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Complete your account — Expense Tracker",
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Account Created</h2>
        <p>An account has been created for you on the Expense Tracker.</p>
        <p><a href="${setupUrl}" style="display: inline-block; padding: 12px 24px; background: #18181b; color: white; text-decoration: none; border-radius: 6px;">Set Up Your Account</a></p>
        <p style="color: #71717a; font-size: 14px;">If you didn't expect this email, you can ignore it.</p>
      </div>
    `,
  });
}
