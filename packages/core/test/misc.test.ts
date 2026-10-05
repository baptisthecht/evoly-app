import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  checkSubdomain,
  CoreError,
  EVENT_TRANSITIONS,
  eventPublicCode,
  HUMAN_ALPHABET,
  humanCode,
  normalizeDomain,
  ORDER_TRANSITIONS,
  orderReference,
  resaleLinkCode,
  RESALE_TRANSITIONS,
  secretToken,
  sha256Hex,
  slugify,
  TICKET_TRANSITIONS,
  ticketShortCode,
} from "../src";

describe("sous-domaines et domaines (RG-SDM-01, RG-DOM-02)", () => {
  it("valides", () => {
    expect(checkSubdomain("Mon-Asso")).toEqual({ ok: true, value: "mon-asso" });
    expect(checkSubdomain("nuit2026")).toEqual({ ok: true, value: "nuit2026" });
  });
  it("refusés", () => {
    expect(checkSubdomain("ab")).toEqual({ ok: false, reason: "LENGTH" });
    expect(checkSubdomain("a".repeat(51))).toEqual({ ok: false, reason: "LENGTH" });
    expect(checkSubdomain("-asso")).toEqual({ ok: false, reason: "FORMAT" });
    expect(checkSubdomain("mon--asso")).toEqual({ ok: false, reason: "FORMAT" });
    expect(checkSubdomain("mon_asso")).toEqual({ ok: false, reason: "FORMAT" });
    expect(checkSubdomain("scanner")).toEqual({ ok: false, reason: "RESERVED" });
  });
  it("slugify", () => {
    expect(slugify("Les Soirées Lumière")).toBe("les-soirees-lumiere");
    expect(slugify("  Rock & Roll !! ")).toBe("rock-et-roll");
    expect(slugify("Été", 2)).toBe("et");
  });
  it("normalisation d'un domaine personnalisé", () => {
    expect(normalizeDomain("https://Tickets.MonSite.com/billets")).toBe("tickets.monsite.com");
    expect(normalizeDomain("tickets.monsite.com.")).toBe("tickets.monsite.com");
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("-bad.com")).toBeNull();
    expect(normalizeDomain("site.c0m")).toBeNull();
  });
});

describe("codes aléatoires", () => {
  it("formats", () => {
    expect(ticketShortCode()).toMatch(new RegExp(`^[${HUMAN_ALPHABET}]{8}$`));
    expect(eventPublicCode()).toHaveLength(6);
    expect(orderReference()).toMatch(/^EVO-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect(resaleLinkCode("nuit-electrique")).toMatch(/^nuit-[2-9A-Z]{4}$/);
    expect(resaleLinkCode("")).toMatch(/^billet-/);
    expect(humanCode(20, "AB")).toMatch(/^[AB]{20}$/);
  });
  it("jetons secrets de 128 bits en base64url, uniques", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => secretToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
  it("hachage SHA-256", async () => {
    expect(await sha256Hex("evoly")).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("cycles de vie (section 8.4)", () => {
  it("transitions autorisées et interdites", () => {
    expect(canTransition(EVENT_TRANSITIONS, "DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransition(EVENT_TRANSITIONS, "CANCELLED", "PUBLISHED")).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, "EXPIRED", "PAID")).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, "REFUNDED", "PAID")).toBe(false);
    expect(canTransition(TICKET_TRANSITIONS, "VOID", "VALID")).toBe(false);
    expect(canTransition(RESALE_TRANSITIONS, "RESERVED", "ACTIVE")).toBe(true);
  });
  it("assertTransition lève une erreur métier", () => {
    expect(() => assertTransition(TICKET_TRANSITIONS, "REFUNDED", "VALID", "billet")).toThrow(CoreError);
    expect(() => assertTransition(TICKET_TRANSITIONS, "VALID", "CHECKED_IN")).not.toThrow();
  });
});
