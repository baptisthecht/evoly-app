import { describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));

const { db } = await import("@/lib/db");
const { decryptSecret, disableTwoFactor, enableTwoFactor, regenerateRecoveryCodes, setupSecret, totpFor, twoFactorSatisfied, verifyTwoFactor } =
  await import("@/server/twoFactor");

const rid = () => Math.random().toString(36).slice(2, 10);

describe("double authentification (US-AUTH-06, back-office)", () => {
  it("activation, codes de secours à usage unique, régénération, session validée", async () => {
    jar.clear();
    const id = rid();
    const u = await db.user.create({ data: { name: "Camille", email: `cam.${id}@exemple.be`, emailVerified: true } });
    const who = { id: u.id, email: u.email };
    const setup = (await setupSecret(u.id, u.email))!;
    expect(decryptSecret((await db.user.findUniqueOrThrow({ where: { id: u.id } })).twoFactorSecret!)).toBe(setup.secret);
    expect(await enableTwoFactor(who, "s1", "000000")).toBeNull();
    const codes = (await enableTwoFactor(who, "s1", totpFor(setup.secret, u.email).generate()))!;
    expect(codes).toHaveLength(8);
    expect(codes.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c))).toBe(true);
    expect(await setupSecret(u.id, u.email)).toBeNull(); // secret jamais remontré une fois actif
    const enabled = { id: u.id, twoFactorEnabled: true };
    expect(await twoFactorSatisfied(enabled, "s1")).toBe(true);
    expect(await twoFactorSatisfied(enabled, "autre-session")).toBe(false);
    jar.clear();
    expect(await verifyTwoFactor(who, "s2", codes[0]!.toLowerCase())).toBe(true);
    expect(await twoFactorSatisfied(enabled, "s2")).toBe(true);
    expect(await verifyTwoFactor(who, "s3", codes[0]!)).toBe(false); // usage unique
    const fresh = await regenerateRecoveryCodes(who, totpFor(setup.secret, u.email).generate());
    expect(await verifyTwoFactor(who, "s4", codes[1]!)).toBe(false); // anciens codes invalidés
    expect(await verifyTwoFactor(who, "s4", fresh[0]!)).toBe(true);
    await disableTwoFactor(who, totpFor(setup.secret, u.email).generate());
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).twoFactorEnabled).toBe(false);
  });

  it("obligatoire pour l'équipe Evoly : pas de désactivation", async () => {
    jar.clear();
    const id = rid();
    const u = await db.user.create({ data: { name: "Support", email: `sup.${id}@exemple.be`, emailVerified: true, platformRole: "SUPPORT" } });
    const setup = (await setupSecret(u.id, u.email))!;
    await enableTwoFactor({ id: u.id, email: u.email }, "s", totpFor(setup.secret, u.email).generate());
    await expect(disableTwoFactor({ id: u.id, email: u.email }, totpFor(setup.secret, u.email).generate())).rejects.toThrow("TWO_FACTOR_REQUIRED_FOR_STAFF");
  });
});
