import { describe, expect, it, vi } from "vitest";

// cookies simulés : un navigateur qui garde ce que le serveur y dépose
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined), set: (n: string, v: string) => void jar.set(n, v) }),
  headers: async () => new Headers(),
}));

const { db } = await import("@/lib/db");
const { accessCodeHash, hasEventAccess, unlockEvent } = await import("@/server/questions");
const { normalizeAccessCode } = await import("@evoly/core");

const rid = () => Math.random().toString(36).slice(2, 10);

describe("événement privé : code d'accès (RG-PUB-06)", () => {
  it("public ouvert ; privé fermé sans code ; code accepté quelles que soient la casse et les espaces ; accès mémorisé ; mauvais code et cookie falsifié refusés", async () => {
    const id = rid();
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    const base = {
      organizationId: org.id,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * 86_400_000),
      status: "PUBLISHED" as const,
    };
    const ouvert = await db.event.create({
      data: { ...base, slug: `ouvert-${id}`, publicCode: `O${id}`.toUpperCase().slice(0, 8), title: "Ouvert", visibility: "PUBLIC" },
    });
    expect(await hasEventAccess(ouvert)).toBe(true);
    const prive = await db.event.create({
      data: { ...base, slug: `prive-${id}`, publicCode: `P${id}`.toUpperCase().slice(0, 8), title: "Privé", visibility: "PRIVATE" },
    });
    expect(await hasEventAccess(prive)).toBe(false); // privé sans code : personne n'entre
    const code = normalizeAccessCode("Gala-2027")!;
    const hash = accessCodeHash(prive.id, code);
    const ferme = await db.event.update({ where: { id: prive.id }, data: { accessCodeHash: hash } });
    expect(await hasEventAccess(ferme)).toBe(false);
    expect(await unlockEvent(prive.id, "mauvais-code")).toBe(false);
    expect(await hasEventAccess(ferme)).toBe(false);
    expect(await unlockEvent(prive.id, "  gala-2027 ")).toBe(true);
    expect(await hasEventAccess(ferme)).toBe(true); // accès mémorisé sur ce navigateur
    for (const k of jar.keys()) jar.set(k, "0".repeat(jar.get(k)!.length)); // cookie falsifié, même longueur
    expect(await hasEventAccess(ferme)).toBe(false);
    expect(await unlockEvent(ouvert.id, "gala-2027")).toBe(false); // pas de code sur un événement public
  });
});
