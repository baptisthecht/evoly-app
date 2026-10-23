import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  kitPreview,
  parseKitOptions,
  seatGuidePdf,
  seatLabelsPdf,
  seatTestPagePdf,
} from "@/server/seatLabels";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
const pages = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPageCount();
const opts = (q = "") => parseKitOptions(new URLSearchParams(q));

/** Plan : scène en haut ; Parterre (rangs A et B de 5 places numérotées 5 → 1), une zone debout, une table ronde de 4 places. */
async function setup(pro = true) {
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
      name: `Théâtre ${id}`,
      slug: `theatre-${id}`,
      subdomain: `theatre-${id}`,
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
  if (pro)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      },
    });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
    },
  });
  const map = await db.seatingMap.create({
    data: { eventId: event.id, focusX: 100, focusY: 0 },
  });
  const cat = await db.seatingCategory.create({
    data: { seatingMapId: map.id, name: "Orchestre", color: "#FFB8E8" },
  });
  const parterre = await db.seatingBlock.create({
    data: {
      seatingMapId: map.id,
      kind: "ROWS",
      name: "Parterre",
      params: {},
      sortOrder: 0,
    },
  });
  await db.seatingBlock.create({
    data: {
      seatingMapId: map.id,
      kind: "STANDING",
      name: "Fosse",
      params: {},
      sortOrder: 1,
    },
  });
  const tables = await db.seatingBlock.create({
    data: {
      seatingMapId: map.id,
      kind: "TABLE_ROUND",
      name: "Tables",
      params: {},
      sortOrder: 2,
    },
  });
  for (const [ri, name] of ["A", "B"].entries()) {
    const row = await db.seatingRow.create({
      data: {
        seatingMapId: map.id,
        categoryId: cat.id,
        blockId: parterre.id,
        name,
        sortOrder: ri,
      },
    });
    for (let i = 0; i < 5; i++)
      await db.seat.create({
        data: {
          rowId: row.id,
          categoryId: cat.id,
          label: String(5 - i),
          sortOrder: 4 - i,
          x: 50 + i * 20,
          y: 100 + ri * 20,
          accessible: ri === 0 && i === 0,
          status: ri === 1 && i === 4 ? "BLOCKED" : "AVAILABLE",
        },
      });
  }
  const table = await db.seatingRow.create({
    data: {
      seatingMapId: map.id,
      categoryId: cat.id,
      blockId: tables.id,
      name: "12",
      sortOrder: 0,
    },
  });
  for (let i = 0; i < 4; i++)
    await db.seat.create({
      data: {
        rowId: table.id,
        categoryId: cat.id,
        label: String(i + 1),
        sortOrder: i,
      },
    });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  return { ctx, event, parterre, table };
}

describe("kit d'installation de salle (section 9.33)", () => {
  it("plan de l'événement dans l'ordre de pose réel, face à la scène ; zone debout ignorée ; tables ; sélection d'un bloc ou d'une table (RG-ETIQ-01, RG-ETIQ-05)", async () => {
    const s = await setup();
    const kit = await kitPreview(s.ctx, s.event.id, opts("format=a4-8"));
    expect(kit.seats).toHaveLength(14);
    // rang A de gauche à droite face à la scène, alors que la numérotation va de 5 à 1 dans l'ordre du plan
    expect(kit.seats.slice(0, 5).map((x) => `${x.row.name}${x.label}`)).toEqual(
      ["A5", "A4", "A3", "A2", "A1"],
    );
    expect(kit.seats[0]!.accessible).toBe(true);
    expect(
      kit.seats.find((x) => x.row.name === "B" && x.label === "1")!.blocked,
    ).toBe(true);
    expect(
      kit.seats
        .slice(10)
        .every((x) => x.row.table && x.block.name === "Tables"),
    ).toBe(true);
    expect(kit.sheets).toBe(2); // 14 étiquettes, 8 par feuille
    expect(kit.choices.map((b) => [b.name, b.rows.map((r) => r.name)])).toEqual(
      [
        ["Parterre", ["A", "B"]],
        ["Tables", ["12"]],
      ],
    );
    expect(
      (await kitPreview(s.ctx, s.event.id, opts(`bloc=${s.parterre.id}`)))
        .seats,
    ).toHaveLength(10);
    expect(
      (
        await kitPreview(s.ctx, s.event.id, opts(`rang=${s.table.id}`))
      ).seats.map((x) => x.label),
    ).toEqual(["1", "2", "3", "4"]);
  });

  it("PDF : étiquettes sur le bon nombre de feuilles, guide de pose complet, page test (RG-ETIQ-02 à 07)", async () => {
    const s = await setup();
    expect(
      await pages(
        await seatLabelsPdf(
          s.ctx,
          s.event.id,
          opts("format=a4-24&modele=contraste"),
        ),
      ),
    ).toBe(1);
    expect(
      await pages(
        await seatLabelsPdf(
          s.ctx,
          s.event.id,
          opts("format=a4-8&modele=zone&evenement=1"),
        ),
      ),
    ).toBe(2);
    expect(
      await pages(
        await seatLabelsPdf(
          s.ctx,
          s.event.id,
          opts(
            "format=personnalise&colonnes=2&lignes=3&margeHaut=12&margeGauche=10&traits=1",
          ),
        ),
      ),
    ).toBe(3);
    // démarrage, plan de pose et chaises, feuille de route, panneaux de rang (3 rangs, 2 par feuille), panneaux de zone (Parterre, Fosse, Tables)
    expect(
      await pages(
        await seatGuidePdf(s.ctx, s.event.id, opts("zones=rectangle")),
      ),
    ).toBe(1 + 1 + 1 + 2 + 3);
    expect(
      await pages(
        await seatTestPagePdf(s.ctx, s.event.id, opts("format=a4-21")),
      ),
    ).toBe(1);
  });

  it("options lues dans l'adresse ; grille impossible refusée ; réservé au Pro (RG-ETIQ-01, RG-ETIQ-02, RG-ETIQ-03)", async () => {
    const o = opts(
      "format=personnalise&colonnes=2&lignes=4&margeHaut=10&margeGauche=10&espaceX=4&espaceY=2&modele=inconnu&evenement=1&zones=rectangle",
    );
    expect([
      o.formatId,
      o.format.columns,
      o.model,
      o.showEvent,
      o.zoneShape,
      o.blockId,
    ]).toEqual(["personnalise", 2, "classique", true, "rectangle", null]);
    expect([opts().formatId, opts().showEvent, opts().zoneShape]).toEqual([
      "a4-24",
      false,
      "rond",
    ]); // réutilisables par défaut
    expect(() => opts("format=personnalise&colonnes=9")).toThrow(
      "LABEL_GRID_INVALID",
    );
    const free = await setup(false);
    for (const f of [kitPreview, seatLabelsPdf, seatGuidePdf, seatTestPagePdf])
      await expect(f(free.ctx, free.event.id, opts())).rejects.toMatchObject({
        code: "FEATURE_UNAVAILABLE",
      });
  });
});
