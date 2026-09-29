import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { buildPkpass } from "@/server/wallet/apple";
import { googleSaveUrl } from "@/server/wallet/google";
import { walletTicket } from "@/server/wallet/ticket";

const rid = () => Math.random().toString(36).slice(2, 10);
const dir = mkdtempSync(join(tmpdir(), "wallet-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=Pass Type ID: pass.me.evoly.test"], { stdio: "ignore" });
const apple = { passTypeIdentifier: "pass.me.evoly.test", teamIdentifier: "TEAM123456", certPem: readFileSync(join(dir, "cert.pem"), "utf8"), keyPem: readFileSync(join(dir, "key.pem"), "utf8"), wwdrPem: readFileSync(join(dir, "cert.pem"), "utf8") };

async function purchase() {
  const id = rid();
  const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
  const event = await db.event.create({ data: { organizationId: org.id, slug: `bal-${id}`, publicCode: id.toUpperCase().slice(0, 8), title: `Bal ${id}`, locationName: "Salle communale", city: "Jette", currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 4 * 86_400_000), status: "PUBLISHED", ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 20 } } }, include: { ticketTypes: true } });
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 2 }], locale: "fr" });
  await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });
  const tickets = await db.ticket.findMany({ where: { orderId: r.orderId }, orderBy: { createdAt: "asc" } });
  return { token: r.token, tickets, event };
}

describe("Apple Wallet et Google Wallet (US-POST-03)", () => {
  it("pass Apple : fichiers, manifeste d'empreintes, signature PKCS#7 vérifiée par OpenSSL", async () => {
    const p = await purchase();
    const t = (await walletTicket(p.token, p.tickets[0]!.id))!;
    const files = unzipSync(buildPkpass(t, apple));
    expect(Object.keys(files).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "manifest.json", "pass.json", "signature"]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as Record<string, string>;
    for (const [name, hash] of Object.entries(manifest)) expect(createHash("sha1").update(files[name]!).digest("hex")).toBe(hash);
    const pass = JSON.parse(strFromU8(files["pass.json"]!));
    expect(pass).toMatchObject({ formatVersion: 1, passTypeIdentifier: "pass.me.evoly.test", teamIdentifier: "TEAM123456", serialNumber: p.tickets[0]!.id, barcodes: [{ format: "PKBarcodeFormatQR", message: p.tickets[0]!.code }] });
    expect(pass.eventTicket.primaryFields[0].value).toBe(p.event.title);
    writeFileSync(join(dir, "manifest.json"), files["manifest.json"]!);
    writeFileSync(join(dir, "signature"), files.signature!);
    const ok = spawnSync("openssl", ["smime", "-verify", "-in", join(dir, "signature"), "-inform", "DER", "-content", join(dir, "manifest.json"), "-noverify", "-out", "/dev/null"]);
    expect(ok.status).toBe(0);
    writeFileSync(join(dir, "manifest.json"), '{"pass.json":"falsifié"}');
    expect(spawnSync("openssl", ["smime", "-verify", "-in", join(dir, "signature"), "-inform", "DER", "-content", join(dir, "manifest.json"), "-noverify", "-out", "/dev/null"]).status).not.toBe(0);
  });

  it("lien Google Wallet : jeton RS256 vérifiable, billet et QR code ; aucun pass pour un billet revendu ou un mauvais lien", async () => {
    const p = await purchase();
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const t = (await walletTicket(p.token, p.tickets[1]!.id))!;
    const url = googleSaveUrl(t, { issuerId: "3388000000012345678", serviceAccountEmail: "wallet@evoly.iam.gserviceaccount.com", privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }, "https://club.evoly.me");
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const [head, body, sig] = url.slice("https://pay.google.com/gp/v/save/".length).split(".");
    expect(createVerify("RSA-SHA256").update(`${head}.${body}`).verify(publicKey, Buffer.from(sig!, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString());
    expect(claims).toMatchObject({ aud: "google", typ: "savetowallet", iss: "wallet@evoly.iam.gserviceaccount.com" });
    expect(claims.payload.eventTicketObjects[0]).toMatchObject({ id: `3388000000012345678.evoly_ticket_${p.tickets[1]!.id}`, state: "ACTIVE", barcode: { type: "QR_CODE", value: p.tickets[1]!.code } });
    await db.ticket.update({ where: { id: p.tickets[1]!.id }, data: { status: "VOID", voidReason: "RESOLD" } });
    expect(await walletTicket(p.token, p.tickets[1]!.id)).toBeNull();
    expect(await walletTicket("jeton-inconnu", p.tickets[0]!.id)).toBeNull();
  });
});
