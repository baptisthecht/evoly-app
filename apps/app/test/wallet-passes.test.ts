import { createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletTicket } from "@/server/wallet/ticket";

const conf = vi.hoisted(() => ({
  extra: {} as Record<string, string | undefined>,
}));
vi.mock("@/lib/env", async (original) => {
  const real = (await original()) as { env: () => Record<string, unknown> };
  return { env: () => ({ ...real.env(), ...conf.extra }) };
});
const { appleCredentials, applePassToken, passJson } =
  await import("@/server/wallet/apple");
const { googleCredentials, googleSaveUrl, googleWalletClaims } =
  await import("@/server/wallet/google");

const b64 = (s: string) => Buffer.from(s).toString("base64");
const ticket = (over: Partial<WalletTicket> = {}): WalletTicket => ({
  ticketId: "t1",
  code: "CODE-QR",
  shortCode: "AB12CD",
  typeName: "Table VIP",
  holder: "Léa Martin",
  seat: "Rang C · 12",
  reference: "EVO-ABC",
  eventId: "e1",
  title: "Gala",
  startsAt: new Date("2026-11-20T19:00:00Z"),
  endsAt: new Date("2026-11-21T01:00:00Z"),
  when: "20 nov. 2026, 20:00",
  place: "Salle des fêtes",
  address: {
    line: "Rue Haute 1",
    postalCode: "1000",
    city: "Bruxelles",
    country: "BE",
  },
  organizationName: "Club",
  locale: "fr",
  background: "#1B4D8C",
  foreground: "#FFFFFF",
  ...over,
});
const dayAfter = (d: Date) =>
  new Date(d.getTime() + 24 * 3_600_000).toISOString();
const keys = (fields: Array<{ key: string }>) => fields.map((f) => f.key);
const creds = {
  passTypeIdentifier: "pass.me.evoly.ticket",
  teamIdentifier: "TEAM123",
};
beforeEach(() => {
  conf.extra = {
    APPLE_PASS_TYPE_ID: undefined,
    APPLE_TEAM_ID: undefined,
    APPLE_PASS_CERT_PEM: undefined,
    APPLE_PASS_KEY_PEM: undefined,
    APPLE_WWDR_PEM: undefined,
    GOOGLE_WALLET_ISSUER_ID: undefined,
    GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: undefined,
    GOOGLE_WALLET_PRIVATE_KEY: undefined,
  };
});

describe("certificats des portefeuilles", () => {
  it("Apple : sans tous les certificats, pas de carte ; présents, ils sont décodés", () => {
    expect(appleCredentials()).toBeNull();
    Object.assign(conf.extra, {
      APPLE_PASS_TYPE_ID: "pass.me.evoly",
      APPLE_TEAM_ID: "TEAM",
      APPLE_PASS_CERT_PEM: b64("CERT"),
      APPLE_PASS_KEY_PEM: b64("KEY"),
      APPLE_PASS_KEY_PASSPHRASE: "secret",
    });
    expect(appleCredentials()).toBeNull(); // il manque le certificat intermédiaire
    conf.extra.APPLE_WWDR_PEM = b64("WWDR");
    expect(appleCredentials()).toEqual({
      passTypeIdentifier: "pass.me.evoly",
      teamIdentifier: "TEAM",
      certPem: "CERT",
      keyPem: "KEY",
      passphrase: "secret",
      wwdrPem: "WWDR",
    });
  });

  it("Google : sans compte de service, pas de carte ; présent, la clé est décodée", () => {
    expect(googleCredentials()).toBeNull();
    Object.assign(conf.extra, {
      GOOGLE_WALLET_ISSUER_ID: "3388",
      GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "wallet@evoly.iam",
      GOOGLE_WALLET_PRIVATE_KEY: b64("CLE"),
    });
    expect(googleCredentials()).toEqual({
      issuerId: "3388",
      serviceAccountEmail: "wallet@evoly.iam",
      privateKeyPem: "CLE",
    });
  });
});

describe("carte Apple Wallet (US-POST-03, RG-POST-04)", () => {
  it("jeton de mise à jour : propre à chaque billet, toujours le même pour un billet", () => {
    expect(applePassToken("t1")).toMatch(/^[0-9a-f]{64}$/);
    expect(applePassToken("t1")).toBe(applePassToken("t1"));
    expect(applePassToken("t2")).not.toBe(applePassToken("t1"));
  });

  it("billet complet : lieu, place et titulaire affichés, couleurs, dates et QR code justes", () => {
    const p = passJson(ticket(), creds);
    expect(keys(p.eventTicket.secondaryFields)).toEqual(["when", "where"]);
    expect(keys(p.eventTicket.auxiliaryFields)).toEqual([
      "type",
      "seat",
      "holder",
    ]);
    expect(
      p.eventTicket.auxiliaryFields.find((f) => f.key === "seat"),
    ).toMatchObject({ label: "PLACE", value: "Rang C · 12" });
    expect(p).toMatchObject({
      serialNumber: "t1",
      passTypeIdentifier: creds.passTypeIdentifier,
      teamIdentifier: creds.teamIdentifier,
      backgroundColor: "rgb(27, 77, 140)",
      foregroundColor: "rgb(255, 255, 255)",
      relevantDate: "2026-11-20T19:00:00.000Z",
      expirationDate: dayAfter(ticket().endsAt),
      authenticationToken: applePassToken("t1"),
    });
    expect(p.barcodes[0]).toMatchObject({
      message: "CODE-QR",
      altText: "AB12CD",
      format: "PKBarcodeFormatQR",
    });
    expect(p.webServiceURL).toMatch(/\/api\/wallet\/apple$/);
    expect("voided" in p).toBe(false);
  });

  it("billet minimal : sans lieu, place ni titulaire, ces lignes n'apparaissent pas", () => {
    const p = passJson(ticket({ place: "", seat: null, holder: null }), creds);
    expect(keys(p.eventTicket.secondaryFields)).toEqual(["when"]);
    expect(keys(p.eventTicket.auxiliaryFields)).toEqual(["type"]);
  });

  it("billet désactivé : carte annulée", () => {
    expect(passJson(ticket({ valid: false }), creds)).toMatchObject({
      voided: true,
    });
    expect("voided" in passJson(ticket({ valid: true }), creds)).toBe(false);
  });

  it("libellés dans la langue de l'acheteur, et toujours un libellé pour une autre langue", () => {
    expect(
      passJson(ticket({ locale: "en" }), creds).eventTicket.auxiliaryFields[1],
    ).toMatchObject({ label: "SEAT" });
    expect(
      typeof passJson(ticket({ locale: "de" }), creds).eventTicket
        .auxiliaryFields[1]!.label,
    ).toBe("string");
  });
});

describe("carte Google Wallet (US-POST-03)", () => {
  const g = { issuerId: "3388", serviceAccountEmail: "wallet@evoly.iam" };
  const now = new Date("2026-10-18T12:00:00Z");

  it("billet complet : lieu et adresse composée, titulaire, place numérotée, QR code et expiration", () => {
    const c = googleWalletClaims(ticket(), g, "https://club.evoly.me", now);
    const cls = c.payload.eventTicketClasses[0]!;
    const obj = c.payload.eventTicketObjects[0]! as Record<string, unknown> & {
      seatInfo?: { seat: { defaultValue: { value: string } } };
    };
    expect(c).toMatchObject({
      iss: g.serviceAccountEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(now.getTime() / 1000),
      origins: ["https://club.evoly.me"],
    });
    expect(cls).toMatchObject({
      id: "3388.evoly_event_e1",
      issuerName: "Club",
      hexBackgroundColor: "#1B4D8C",
    });
    expect(cls.venue).toMatchObject({
      name: { defaultValue: { value: "Salle des fêtes" } },
      address: { defaultValue: { value: "Rue Haute 1, 1000 Bruxelles, BE" } },
    });
    expect(obj).toMatchObject({
      id: "3388.evoly_ticket_t1",
      classId: "3388.evoly_event_e1",
      state: "ACTIVE",
      ticketHolderName: "Léa Martin",
      barcode: { type: "QR_CODE", value: "CODE-QR", alternateText: "AB12CD" },
      reservationInfo: { confirmationCode: "EVO-ABC" },
      validTimeInterval: { end: { date: dayAfter(ticket().endsAt) } },
    });
    expect(obj.seatInfo!.seat.defaultValue.value).toBe("Rang C · 12"); // comme sur la carte Apple
  });

  it("adresse incomplète : ce qui est connu, sinon le nom du lieu ; sans lieu, pas de lieu", () => {
    const partial = googleWalletClaims(
      ticket({
        address: {
          line: null,
          postalCode: "1000",
          city: "Bruxelles",
          country: null,
        },
      }),
      g,
      "https://x",
      now,
    );
    expect(
      partial.payload.eventTicketClasses[0]!.venue!.address.defaultValue.value,
    ).toBe("1000 Bruxelles");
    const none = googleWalletClaims(
      ticket({
        address: { line: null, postalCode: null, city: null, country: null },
      }),
      g,
      "https://x",
      now,
    );
    expect(
      none.payload.eventTicketClasses[0]!.venue!.address.defaultValue.value,
    ).toBe("Salle des fêtes");
    expect(
      "venue" in
        googleWalletClaims(ticket({ place: "" }), g, "https://x", now).payload
          .eventTicketClasses[0]!,
    ).toBe(false);
  });

  it("sans titulaire ni place : ces champs n'apparaissent pas", () => {
    const obj = googleWalletClaims(
      ticket({ holder: null, seat: null }),
      g,
      "https://x",
      now,
    ).payload.eventTicketObjects[0]!;
    expect("ticketHolderName" in obj).toBe(false);
    expect("seatInfo" in obj).toBe(false);
  });

  it("lien « Enregistrer dans Google Wallet » : jeton RS256 signé par le compte de service, contenu intact", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const full = {
      ...g,
      privateKeyPem: privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
    };
    const url = googleSaveUrl(ticket(), full, "https://club.evoly.me", now);
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const [head, body, sig] = url.split("/save/")[1]!.split(".");
    expect(JSON.parse(Buffer.from(head!, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(
      createVerify("RSA-SHA256")
        .update(`${head}.${body}`)
        .verify(publicKey, Buffer.from(sig!, "base64url")),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(body!, "base64url").toString())).toEqual(
      JSON.parse(
        JSON.stringify(
          googleWalletClaims(ticket(), full, "https://club.evoly.me", now),
        ),
      ),
    );
  });
});
