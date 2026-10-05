import "server-only";
import { toLocale } from "@evoly/i18n";
import type { Locale } from "@evoly/i18n";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { env } from "./env";
import { hashPassword, verifyPassword } from "./password";
import { sendEmail } from "@/server/email/send";
import { resetPasswordEmail, verifyEmailEmail } from "@/server/email/templates";

const e = env();

const socialProviders = {
  ...(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET ? { google: { clientId: e.AUTH_GOOGLE_ID, clientSecret: e.AUTH_GOOGLE_SECRET } } : {}),
  ...(e.AUTH_APPLE_ID && e.AUTH_APPLE_SECRET ? { apple: { clientId: e.AUTH_APPLE_ID, clientSecret: e.AUTH_APPLE_SECRET } } : {}),
};

const localeOf = (user: unknown): Locale => toLocale((user as { locale?: string }).locale);

export const auth = betterAuth({
  baseURL: e.BETTER_AUTH_URL,
  secret: e.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  advanced: { database: { generateId: false }, cookiePrefix: "evoly" },
  // RG-AUTH-03 : identifiants des jetons stockés hachés
  verification: { storeIdentifier: "hashed" },
  user: {
    additionalFields: { locale: { type: "string", required: false, defaultValue: "fr", input: true } },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    additionalFields: { activeOrganizationId: { type: "string", required: false, input: false } },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 heure
    revokeSessionsOnPasswordReset: true,
    password: { hash: hashPassword, verify: verifyPassword },
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        ...resetPasswordEmail({ url, locale: localeOf(user) }),
        template: "account.reset_password",
        category: "TRANSACTIONAL",
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 heures
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...verifyEmailEmail({ url, locale: localeOf(user) }), template: "account.verify_email", category: "TRANSACTIONAL" });
    },
  },
  socialProviders,
  account: { accountLinking: { enabled: true, trustedProviders: ["google", "apple"] } },
  // RG-AUTH-05 : limitation des tentatives, stockée en base (plusieurs instances)
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 10 },
      "/request-password-reset": { window: 60 * 60, max: 3 },
      "/send-verification-email": { window: 60 * 60, max: 3 },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
