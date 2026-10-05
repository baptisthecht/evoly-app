import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { uploadImage } from "@/server/brand";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { checkCertificates } from "@/server/domains";
import { ticketsCsv } from "@/server/finances";
import { pdfCacheStats, ticketsPdfFor } from "@/server/orders";
import { saveQuestion } from "@/server/questions";
import { readLocalFile } from "@/server/storage";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  await db.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, roleId: (await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } })).id },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `bal-${id}`,
      publicCode: `B${id}`.toUpperCase().slice(0, 8),
      title: `Bal ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 5 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 20 } },
    },
    include: { ticketTypes: true },
  });
  const ctx = { organization: { id: org.id, timezone: "Europe/Brussels" }, user: { id: user.id } } as unknown as OrgContext;
  return { id, org, event, ctx };
}

describe("les cinq points partiels du cahier des charges", () => {
  it("RG-STAT-04 : export des participants avec les réponses (par commande et par billet)", async () => {
    const s = await setup();
    const q1 = await saveQuestion(s.ctx, s.event.id, null, { label: "Comment nous avez-vous connus ?", type: "TEXT", required: true, scope: "ORDER" });
    const q2 = await saveQuestion(s.ctx, s.event.id, null, { label: "Régime", type: "SELECT", options: "Aucun\nVégétarien", required: true, scope: "TICKET" });
    const r = await reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.event.ticketTypes[0]!.id, quantity: 2 }], locale: "fr" });
    const item = (await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } })).id;
    await submitBuyer(r.token, {
      firstName: "Léa",
      lastName: "Martin",
      email: `lea.${s.id}@exemple.be`,
      marketingOptIn: false,
      answers: { order: { [q1.id]: "Un ami" }, tickets: { [item]: [{ [q2.id]: "Aucun" }, { [q2.id]: "Végétarien" }] } },
    });
    const csv = await ticketsCsv(s.ctx, { period: "ALL", eventId: s.event.id, withAnswers: true });
    const [head, ...rows] = csv
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    expect(head!.split(";").slice(-2)).toEqual(["Comment nous avez-vous connus ?", "Régime"]);
    expect(rows.map((l) => l.split(";").slice(-2).join(" | ")).sort()).toEqual(["Un ami | Aucun", "Un ami | Végétarien"]);
  });

  it("RG-FILE-02 : PDF des billets en cache, régénéré dès qu'un billet change", async () => {
    const s = await setup();
    const r = await reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${s.id}@exemple.be`, marketingOptIn: false });
    const load = () =>
      db.order.findUniqueOrThrow({
        where: { id: r.orderId },
        include: { organization: { select: { name: true } }, event: true, tickets: { include: { ticketType: { select: { name: true } } } } },
      });
    const before = { ...pdfCacheStats };
    const a = await ticketsPdfFor(await load(), "fr");
    const b = await ticketsPdfFor(await load(), "fr");
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
    // déjà généré pour l'e-mail de confirmation : les deux téléchargements viennent du cache
    expect([pdfCacheStats.misses - before.misses, pdfCacheStats.hits - before.hits]).toEqual([0, 2]);
    await db.ticket.updateMany({ where: { orderId: r.orderId }, data: { holderFirstName: "Tom" } });
    const c = await ticketsPdfFor(await load(), "fr");
    expect(pdfCacheStats.misses - before.misses).toBe(1); // titulaire changé : nouveau PDF
    expect(Buffer.from(c).equals(Buffer.from(a))).toBe(false);
  });

  it("RG-FILE-01 : logo SVG converti en PNG ; SVG dangereux refusé", async () => {
    const s = await setup();
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" rx="8" fill="#FFB8E8"/><circle cx="20" cy="20" r="12" fill="#222222"/></svg>',
    );
    const url = await uploadImage(s.ctx, "logo", svg);
    expect(url).toMatch(/\.png$/);
    const key = decodeURIComponent(url.split("/files/")[1] ?? "");
    const file = await readLocalFile(key);
    expect(file?.bytes.subarray(0, 4).toString("hex")).toBe("89504e47"); // signature PNG
    await expect(
      uploadImage(s.ctx, "logo", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    ).rejects.toThrow("UPLOAD_SVG_UNSAFE");
  });

  it("RG-CDM-02 : certificat refusé sur un domaine actif → organisateur prévenu une fois par jour", async () => {
    const s = await setup();
    const dir = mkdtempSync(join(tmpdir(), "cert-"));
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(dir, "k.pem"),
        "-out",
        join(dir, "c.pem"),
        "-days",
        "1",
        "-subj",
        `/CN=billets.club-${s.id}.be`,
      ],
      { stdio: "ignore" },
    );
    const server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (_q, res) => res.end("ok"));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const port = (server.address() as { port: number }).port;
    const domain = `billets.club-${s.id}.be`;
    await db.customDomain.create({ data: { organizationId: s.org.id, domain, status: "ACTIVE", dnsTarget: "domains.evoly.me", verificationToken: rid() } });
    const only = (d: string) => (d === domain ? { host: "127.0.0.1", port } : { host: "127.0.0.1", port: 1 });
    try {
      await checkCertificates(new Date(), only);
      await checkCertificates(new Date(), only);
    } finally {
      server.close();
    }
    const alerts = await db.notification.findMany({
      where: { organizationId: s.org.id, type: "DOMAIN_ERROR", link: `/brand?certificat=${encodeURIComponent(domain)}` },
    });
    expect(alerts).toHaveLength(1); // un seul membre, une seule alerte malgré deux passages
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "domain.certificate" } })).toBe(1);
  });
});
