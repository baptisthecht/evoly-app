import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cashHandOver,
  cashReport,
  cashReportCsv,
  qrSaleStatus,
  sellCash,
  shortDevice,
  startQrSale,
} from "@/server/boxOffice";
import { waitlistCsv } from "@/server/waitlist";
import { finalizeOrder, reservationByToken } from "@/server/checkout";
import { refundTickets } from "@/server/refunds";
import { findOrgContext } from "@/server/context";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  const ownerRole = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: {
        create: {
          name: "Entrée",
          priceMinor: 1000,
          currency: "EUR",
          quantity: 5,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const lien = (data: {
    canSell?: boolean;
    checkOnly?: boolean;
    label?: string;
  }) =>
    db.scannerLink.create({
      data: {
        eventId: event.id,
        tokenHash: `h-${rid()}`,
        label: data.label ?? "Entrée principale",
        expiresAt: new Date(Date.now() + 30 * DAY),
        createdById: owner.id,
        canSell: !!data.canSell,
        checkOnly: !!data.checkOnly,
      },
    });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  return { event, type: event.ticketTypes[0]!, lien, ctx };
}

describe("vente sur place en espèces (section 9.27)", () => {
  it("vente enregistrée sans commission, billets entrés, stock partagé, e-mail facultatif, droits du lien, rapport de caisse (RG-POS-01, RG-POS-02, RG-POS-03, RG-POS-04, RG-POS-05, RG-POS-07)", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true, label: "Caisse 1" });
    const r = await sellCash(caisse, {
      lines: [{ ticketTypeId: s.type.id, quantity: 2 }],
      deviceId: "tel-1",
    });
    expect(r.tickets).toBe(2);
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { tickets: true },
    });
    expect(order).toMatchObject({
      status: "PAID",
      source: "BOX_OFFICE",
      boxOfficeMode: "CASH",
      applicationFeeMinor: 0,
      soldByLinkId: caisse.id,
      totalMinor: 2000,
    });
    expect(order.tickets.every((t) => t.status === "CHECKED_IN")).toBe(true);
    expect(
      await db.checkIn.count({
        where: { scannerLinkId: caisse.id, result: "VALID" },
      }),
    ).toBe(2);
    expect(
      (await db.ticketType.findUniqueOrThrow({ where: { id: s.type.id } }))
        .quantitySold,
    ).toBe(2);
    // avec un e-mail : le client reçoit ses billets
    const email = `client.${rid()}@exemple.be`;
    await sellCash(caisse, {
      lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
      email,
    });
    expect(
      await db.emailMessage.count({ where: { toEmail: email } }),
    ).toBeGreaterThanOrEqual(1);
    // droits du lien : pas de vente sans autorisation, ni avec un lien de vérification seule
    await expect(
      sellCash(await s.lien({}), {
        lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "BOX_OFFICE_FORBIDDEN" });
    await expect(
      sellCash(
        { ...(await s.lien({ canSell: true })), checkOnly: true },
        { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] },
      ),
    ).rejects.toMatchObject({ code: "BOX_OFFICE_FORBIDDEN" });
    // même stock que la vente en ligne : 2 places restent, pas une de plus
    await sellCash(caisse, {
      lines: [{ ticketTypeId: s.type.id, quantity: 2 }],
    });
    await expect(
      sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] }),
    ).rejects.toThrow();
    const rapport = await cashReport(s.ctx, s.event.id);
    expect(rapport.reduce((n, r) => n + r.sales, 0)).toBe(3);
    expect(rapport.reduce((n, r) => n + r.amountMinor, 0)).toBe(5000);
    expect(
      rapport.every((r) => r.label === "Caisse 1" && r.mode === "CASH"),
    ).toBe(true);
    expect(rapport.some((r) => r.device === "TEL1")).toBe(true); // l'appareil de la première vente (RG-POS-07)
  });

  it("paiement par QR code : places réservées, page de paiement par le jeton, suivi réservé au lien, billets entrés une fois payé (RG-POS-03, RG-POS-04)", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true, label: "Caisse QR" });
    const q = await startQrSale(caisse, {
      lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
    });
    expect(q.url).toContain("/payer/");
    expect(q.qrSvg.startsWith("<svg")).toBe(true);
    const order = await db.order.findUniqueOrThrow({
      where: { id: q.orderId },
    });
    expect(order).toMatchObject({
      status: "PENDING",
      source: "BOX_OFFICE",
      boxOfficeMode: "QR",
      soldByLinkId: caisse.id,
      applicationFeeMinor: 49,
    }); // commission habituelle
    const r = await reservationByToken(q.url.split("/payer/")[1]!);
    expect(r).toMatchObject({
      orderId: q.orderId,
      totalMinor: 1000,
      lines: [expect.objectContaining({ name: "Entrée", quantity: 1 })],
    });
    expect(await qrSaleStatus(caisse, q.orderId)).toEqual({
      status: "PENDING",
    });
    await expect(
      qrSaleStatus(await s.lien({ canSell: true }), q.orderId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.order.update({
      where: { id: q.orderId },
      data: {
        buyerEmail: `client.${rid()}@exemple.be`,
        buyerFirstName: "Alex",
        buyerLastName: "Martin",
      },
    });
    expect(await finalizeOrder(q.orderId)).toBe("PAID"); // comme après la confirmation du paiement par Stripe
    expect(await qrSaleStatus(caisse, q.orderId)).toEqual({
      status: "PAID",
      tickets: 1,
    });
    expect(await qrSaleStatus(caisse, q.orderId)).toEqual({
      status: "PAID",
      tickets: 1,
    });
    expect(
      (await db.ticket.findFirstOrThrow({ where: { orderId: q.orderId } }))
        .status,
    ).toBe("CHECKED_IN");
  });

  it("remboursement d'une vente en espèces depuis le tableau de bord, sans Stripe (RG-POS-08)", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true });
    const v = await sellCash(caisse, {
      lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
    });
    const ticket = await db.ticket.findFirstOrThrow({
      where: { orderId: v.orderId },
    });
    await refundTickets(s.ctx, v.orderId, [ticket.id], "OTHER", null);
    const refund = await db.refund.findFirstOrThrow({
      where: { orderId: v.orderId },
    });
    expect(refund.status).toBe("SUCCEEDED");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: v.orderId } })).status,
    ).toBe("REFUNDED");
  });

  it("exports pour Excel : rapport de caisse vente par vente avec son total (RG-POS-07), liste d'attente avec son rang, sans les désinscrits (RG-ATT-06)", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true, label: "Caisse bar" });
    await sellCash(caisse, {
      lines: [{ ticketTypeId: s.type.id, quantity: 2 }],
      email: "client@exemple.be",
    });
    const rapport = await cashReportCsv(s.ctx, s.event.id);
    expect(rapport.startsWith("\uFEFF")).toBe(true); // Excel reconnaît l'UTF-8
    const lignes = rapport.trim().split("\r\n");
    expect(lignes[0]).toContain(
      '"Caisse";"Appareil";"Mode";"Référence";"Billets"',
    );
    expect(lignes[1]).toMatch(/"Caisse bar";"";"Espèces";"EVO-[^"]+";"2"/); // vente sans appareil connu
    expect(lignes.at(-1)).toMatch(/^"Total";"";"";"";"1 vente\(s\)";"2"/);
    expect(rapport).not.toContain("client@exemple.be"); // document comptable : aucune donnée de l'acheteur

    const inscrit = (
      email: string,
      status: "WAITING" | "OFFERED" | "PURCHASED" | "CANCELLED",
    ) =>
      db.waitlistEntry.create({
        data: {
          eventId: s.event.id,
          ticketTypeId: s.type.id,
          email,
          status,
          token: `t-${Math.random().toString(36).slice(2)}`,
        },
      });
    await inscrit("premier@exemple.be", "OFFERED");
    await inscrit("parti@exemple.be", "CANCELLED");
    await inscrit("second@exemple.be", "WAITING");
    await inscrit("acheteur@exemple.be", "PURCHASED");
    const liste = await waitlistCsv(s.ctx, s.event.id);
    expect(liste).toMatch(/"1";"premier@exemple\.be";"1";"Place proposée"/);
    expect(liste).toMatch(/"2";"second@exemple\.be";"1";"En attente"/);
    expect(liste).toMatch(/"";"acheteur@exemple\.be";"1";"Achetée"/);
    expect(liste).not.toContain("parti@exemple.be"); // désinscrit : jamais exporté
  });

  it("rapport de caisse par caisse, par appareil et par mode ; espèces à remettre nettes des remboursements, sans le QR code ; export avec l'appareil (RG-POS-07)", async () => {
    const s = await setup();
    // tarif propre au test, avec assez de places pour ses 7 billets (le stock refuserait sinon le panier)
    const tarif = await db.ticketType.create({
      data: {
        eventId: s.event.id,
        name: "Caisse",
        priceMinor: 1500,
        currency: "EUR",
        quantity: 50,
      },
    });
    const prix = tarif.priceMinor;
    const bar = await s.lien({ canSell: true, label: "Bar" });
    const entree = await s.lien({ canSell: true, label: "Entrée" });
    const vend = (link: typeof bar, quantity: number, deviceId: string) =>
      sellCash(link, {
        lines: [{ ticketTypeId: tarif.id, quantity }],
        deviceId,
      });
    await vend(bar, 1, "aaaa-1111");
    const double = await vend(bar, 2, "aaaa-1111");
    await vend(bar, 1, "bbbb-2222");
    await vend(entree, 1, "cccc-3333");
    const rembourse = await vend(entree, 1, "cccc-3333");
    const qr = await startQrSale(bar, {
      lines: [{ ticketTypeId: tarif.id, quantity: 1 }],
      deviceId: "aaaa-1111",
    });
    expect(await finalizeOrder(qr.orderId)).toBe("PAID"); // comme après la confirmation du paiement par Stripe : billets créés
    // remboursements en espèces (RG-POS-08) : un billet sur deux au bar, toute une vente à l'entrée
    await db.order.update({
      where: { id: double.orderId },
      data: { refundedMinor: prix, status: "PARTIALLY_REFUNDED" },
    });
    await db.order.update({
      where: { id: rembourse.orderId },
      data: { refundedMinor: prix, status: "REFUNDED" },
    });

    const rows = await cashReport(s.ctx, s.event.id);
    expect(rows).toEqual([
      {
        label: "Bar",
        device: "1111",
        mode: "CASH",
        sales: 2,
        amountMinor: 3 * prix - prix,
      },
      { label: "Bar", device: "1111", mode: "QR", sales: 1, amountMinor: prix },
      {
        label: "Bar",
        device: "2222",
        mode: "CASH",
        sales: 1,
        amountMinor: prix,
      },
      {
        label: "Entrée",
        device: "3333",
        mode: "CASH",
        sales: 1,
        amountMinor: prix,
      }, // la vente remboursée en entier n'y figure plus
    ]);
    expect(cashHandOver(rows)).toEqual([
      { label: "Bar", device: "1111", amountMinor: 2 * prix }, // le QR code passe par Stripe : rien à remettre
      { label: "Bar", device: "2222", amountMinor: prix },
      { label: "Entrée", device: "3333", amountMinor: prix },
    ]);

    const lignes = (await cashReportCsv(s.ctx, s.event.id))
      .trim()
      .split("\r\n");
    expect(lignes).toHaveLength(1 + 6 + 1); // en-tête, six ventes (y compris la remboursée), total
    expect(lignes.filter((l) => /"Bar";"1111";"Espèces"/.test(l))).toHaveLength(
      2,
    );
    expect(lignes.filter((l) => /"Bar";"1111";"QR code"/.test(l))).toHaveLength(
      1,
    );
    expect(
      lignes.filter((l) => /"Entrée";"3333";"Espèces"/.test(l)),
    ).toHaveLength(2);
    const total = 7 * prix,
      rendu = 2 * prix;
    expect(lignes.at(-1)).toBe(
      `"Total";"";"";"";"6 vente(s)";"7";"${(total / 100).toFixed(2)}";"${(rendu / 100).toFixed(2)}";"${((total - rendu) / 100).toFixed(2)}";"EUR"`,
    );
  });

  it("appareil lisible et espèces à remettre : cas limites (RG-POS-07)", () => {
    expect([
      shortDevice(null),
      shortDevice(undefined),
      shortDevice(""),
      shortDevice("ab"),
      shortDevice("--"),
      shortDevice("3f2b-9c7a"),
    ]).toEqual([null, null, null, "AB", "?", "9C7A"]);
    expect(cashHandOver([])).toEqual([]);
    expect(
      cashHandOver([
        {
          label: "Bar",
          device: null,
          mode: "CASH",
          sales: 1,
          amountMinor: 500,
        },
        {
          label: "Bar",
          device: null,
          mode: "CASH",
          sales: 2,
          amountMinor: 700,
        },
        {
          label: "Bar",
          device: null,
          mode: "QR",
          sales: 4,
          amountMinor: 9_999,
        },
      ]),
    ).toEqual([{ label: "Bar", device: null, amountMinor: 1200 }]);
  });
});
