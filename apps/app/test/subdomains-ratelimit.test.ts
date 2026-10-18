import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hit, isLimited, peek, reset } from "@/server/rateLimit";
import { subdomainAvailability } from "@/server/subdomains";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("disponibilité d'un sous-domaine (RG-SDM-01 à 03)", () => {
  it("format et longueur vérifiés avant toute recherche", async () => {
    expect(await subdomainAvailability("a")).toMatchObject({ ok: false });
    expect(await subdomainAvailability("pas_valide!")).toMatchObject({ ok: false });
  });

  it("libre : la valeur normalisée est rendue", async () => {
    const v = `libre-${rid()}`;
    expect(await subdomainAvailability(v)).toEqual({ ok: true, value: v });
  });

  it("déjà pris par une organisation ; mais une organisation garde le sien", async () => {
    const sub = `club-${rid()}`;
    const org = await db.organization.create({ data: { name: "Club", slug: sub, subdomain: sub, country: "BE", currency: "EUR" } });
    expect(await subdomainAvailability(sub)).toEqual({ ok: false, reason: "TAKEN" });
    expect(await subdomainAvailability(sub, org.id)).toEqual({ ok: true, value: sub });
  });

  it("déjà pris par un événement", async () => {
    const id = rid();
    const org = await db.organization.create({ data: { name: "Club", slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR" } });
    await db.event.create({
      data: {
        organizationId: org.id,
        slug: `gala-${id}`,
        publicCode: id.toUpperCase().slice(0, 8),
        title: "Gala",
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 86_400_000),
        subdomain: `gala-${id}`,
      },
    });
    expect(await subdomainAvailability(`gala-${id}`)).toEqual({ ok: false, reason: "TAKEN" });
  });

  it("un nom réservé n'est jamais disponible", async () => {
    expect(await subdomainAvailability("www")).toMatchObject({ ok: false });
  });
});

describe("limitation des tentatives répétées", () => {
  it("compte dans la fenêtre, bloque au maximum, et se remet à zéro", async () => {
    const key = `essai:${rid()}`;
    expect(await peek(key, 60)).toBe(0);
    expect([await hit(key, 60), await hit(key, 60), await hit(key, 60)]).toEqual([1, 2, 3]);
    expect(await peek(key, 60)).toBe(3);
    expect(await isLimited(key, 60, 3)).toBe(true);
    expect(await isLimited(key, 60, 4)).toBe(false);
    await reset(key);
    expect(await peek(key, 60)).toBe(0);
  });

  it("la fenêtre repart de la dernière tentative : après une pause assez longue, le compte recommence à 1", async () => {
    const key = `essai:${rid()}`;
    await hit(key, 60);
    await hit(key, 60);
    await db.rateLimit.update({ where: { key }, data: { lastRequest: BigInt(Date.now() - 120_000) } });
    expect(await peek(key, 60)).toBe(0);
    expect(await hit(key, 60)).toBe(1);
  });
});
