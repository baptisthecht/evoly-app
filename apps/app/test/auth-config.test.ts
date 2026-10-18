import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

type Mail = (data: { user: Record<string, unknown>; url: string; token: string }) => Promise<void>;
const o = auth.options as unknown as {
  emailAndPassword: {
    enabled: boolean;
    requireEmailVerification: boolean;
    minPasswordLength: number;
    maxPasswordLength: number;
    resetPasswordTokenExpiresIn: number;
    revokeSessionsOnPasswordReset: boolean;
    password: { hash: unknown; verify: unknown };
    sendResetPassword: Mail;
  };
  emailVerification: { sendOnSignUp: boolean; expiresIn: number; sendVerificationEmail: Mail };
  session: { expiresIn: number };
  verification: { storeIdentifier: string };
  advanced: { cookiePrefix: string };
  rateLimit?: { enabled?: boolean };
};
const rid = () => Math.random().toString(36).slice(2, 10);
const lastSubject = async (template: string, to: string) =>
  (await db.emailMessage.findFirstOrThrow({ where: { template, toEmail: to }, orderBy: [{ queuedAt: "desc" }, { id: "desc" }] })).subject;

describe("comptes : réglages de sécurité verrouillés (RG-AUTH-01 à 03)", () => {
  it("mots de passe, vérification de l'adresse, réinitialisation, jetons, sessions et limitation", () => {
    expect(o.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
    });
    expect(o.emailAndPassword.password).toEqual({ hash: hashPassword, verify: verifyPassword }); // Argon2id
    expect(o.emailVerification).toMatchObject({ sendOnSignUp: true, expiresIn: 86_400 });
    expect(o.verification.storeIdentifier).toBe("hashed");
    expect(o.session.expiresIn).toBe(30 * 86_400);
    expect(o.advanced.cookiePrefix).toBe("evoly");
    expect(o.rateLimit?.enabled).not.toBe(false);
  });
});

describe("e-mails du compte", () => {
  it("réinitialisation du mot de passe : à l'adresse du compte, dans sa langue", async () => {
    const fr = `fr.${rid()}@exemple.be`;
    const en = `en.${rid()}@exemple.be`;
    await o.emailAndPassword.sendResetPassword({
      user: { id: "u1", email: fr, name: "Léa", locale: "fr" },
      url: "https://app.evoly.me/reset?token=abc",
      token: "abc",
    });
    await o.emailAndPassword.sendResetPassword({
      user: { id: "u2", email: en, name: "Tom", locale: "en" },
      url: "https://app.evoly.me/reset?token=def",
      token: "def",
    });
    const [sFr, sEn] = [await lastSubject("account.reset_password", fr), await lastSubject("account.reset_password", en)];
    expect(sFr.length).toBeGreaterThan(0);
    expect(sEn).not.toBe(sFr);
  });

  it("vérification de l'adresse : dans la langue du compte, en français si elle est inconnue", async () => {
    const fr = `fr.${rid()}@exemple.be`;
    const en = `en.${rid()}@exemple.be`;
    const unknown = `xx.${rid()}@exemple.be`;
    await o.emailVerification.sendVerificationEmail({
      user: { id: "u1", email: fr, name: "Léa", locale: "fr" },
      url: "https://app.evoly.me/verify?token=a",
      token: "a",
    });
    await o.emailVerification.sendVerificationEmail({
      user: { id: "u2", email: en, name: "Tom", locale: "en" },
      url: "https://app.evoly.me/verify?token=b",
      token: "b",
    });
    await o.emailVerification.sendVerificationEmail({
      user: { id: "u3", email: unknown, name: "Zoé" },
      url: "https://app.evoly.me/verify?token=c",
      token: "c",
    });
    const [sFr, sEn, sUnknown] = [
      await lastSubject("account.verify_email", fr),
      await lastSubject("account.verify_email", en),
      await lastSubject("account.verify_email", unknown),
    ];
    expect(sEn).not.toBe(sFr);
    expect(sUnknown).toBe(sFr);
  });
});
