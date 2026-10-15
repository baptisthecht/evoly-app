import { CoreError, customFormat, hasFeature, paginate, PALETTE, placementOrder, SHEET_PRESETS, type LabelSeat, type SheetFormat } from "@evoly/core";
import { MESSAGES, toLocale } from "@evoly/i18n";
import { createTranslator } from "next-intl";
import { db } from "@/lib/db";
import type { OrgContext } from "./context";
import { emailBrandFor, logoBytes } from "./email/brand";
import { findEvent } from "./events";
import { buildGuidePdf, buildLabelsPdf, buildTestPagePdf, type KitBrand, type LabelModel, type LabelWords } from "./seatLabelsPdf";

/** Kit d'installation de salle (section 9.33) : options choisies, plan de l'événement dans l'ordre de pose, PDF. */
export const LABEL_MODELS: LabelModel[] = ["classique", "contraste", "zone", "econome"];
export type KitOptions = {
  format: SheetFormat;
  formatId: string;
  model: LabelModel;
  showEvent: boolean;
  blockId: string | null;
  rowId: string | null;
  zoneShape: "rond" | "rectangle";
};

const num = (q: URLSearchParams, k: string, d: number) => {
  const v = Number((q.get(k) ?? "").replace(",", "."));
  return Number.isFinite(v) && q.get(k) !== "" && q.get(k) !== null ? v : d;
};
/** Options lues dans l'adresse ; une grille personnalisée impossible lève LABEL_GRID_INVALID (RG-ETIQ-02). */
export function parseKitOptions(q: URLSearchParams): KitOptions {
  const formatId = q.get("format") ?? "a4-24";
  const format =
    SHEET_PRESETS[formatId] ??
    customFormat({
      columns: num(q, "colonnes", 3),
      rows: num(q, "lignes", 8),
      marginTop: num(q, "margeHaut", 10),
      marginLeft: num(q, "margeGauche", 10),
      gapX: num(q, "espaceX", 0),
      gapY: num(q, "espaceY", 0),
      cutMarks: q.get("traits") === "1",
    });
  const model = LABEL_MODELS.find((m) => m === q.get("modele")) ?? "classique";
  return {
    format,
    formatId: SHEET_PRESETS[formatId] ? formatId : "personnalise",
    model,
    showEvent: q.get("evenement") === "1",
    blockId: q.get("bloc") || null,
    rowId: q.get("rang") || null,
    zoneShape: q.get("zones") === "rectangle" ? "rectangle" : "rond",
  };
}

/** Plan de l'événement, prêt pour les étiquettes : places dans l'ordre de pose (RG-ETIQ-01 et 05). */
export async function loadKit(ctx: OrgContext, eventId: string, opts: Pick<KitOptions, "blockId" | "rowId">) {
  if (!hasFeature(ctx.features, "SEATING_MAPS")) throw new CoreError("FEATURE_UNAVAILABLE");
  const event = await findEvent(ctx, eventId);
  const map = await db.seatingMap.findUnique({
    where: { eventId },
    include: { blocks: { orderBy: { sortOrder: "asc" } }, rows: { include: { seats: true, category: true, block: true } } },
  });
  const rows = (map?.rows ?? []).filter((r) => r.block?.kind !== "STANDING" && r.block?.kind !== "SHAPE");
  const seats: LabelSeat[] = rows.flatMap((r) =>
    r.seats.map((s) => ({
      id: s.id,
      block: { name: r.block?.name ?? "", sortOrder: r.block?.sortOrder ?? 0 },
      row: { name: r.name, sortOrder: r.sortOrder, table: r.block?.kind === "TABLE_ROUND" || r.block?.kind === "TABLE_RECT" },
      label: s.label,
      sortOrder: s.sortOrder,
      x: s.x,
      y: s.y,
      category: { name: r.category.name, color: r.category.color },
      accessible: s.accessible,
      blocked: s.status === "BLOCKED",
    })),
  );
  const focus = map?.focusX != null && map.focusY != null ? { x: map.focusX, y: map.focusY } : null;
  const wanted = seats.filter((s) => {
    const row = rows.find((r) => r.seats.some((x) => x.id === s.id))!;
    return (!opts.blockId || row.blockId === opts.blockId) && (!opts.rowId || row.id === opts.rowId);
  });
  const zones = (map?.blocks ?? [])
    .filter((b) => b.kind !== "SHAPE" && (!opts.blockId || b.id === opts.blockId))
    .map((b) => ({ name: b.name, color: rows.find((r) => r.blockId === b.id)?.category.color ?? PALETTE.charbon }));
  const choices = (map?.blocks ?? [])
    .filter((b) => b.kind !== "STANDING" && b.kind !== "SHAPE")
    .map((b) => ({
      id: b.id,
      name: b.name,
      rows: rows
        .filter((r) => r.blockId === b.id)
        .sort((a, c) => a.sortOrder - c.sortOrder)
        .map((r) => ({ id: r.id, name: r.name })),
    }));
  return { event, seats: placementOrder(wanted, focus), focus, zones, choices };
}

async function kitWords(locale: string): Promise<LabelWords> {
  // traduction hors du rendu d'une page (PDF) : mêmes fichiers de langue que l'app, langue de l'événement
  const l = toLocale(locale);
  const t = createTranslator({ locale: l, messages: MESSAGES[l], namespace: "seatKit" });
  return {
    row: t("row"),
    seat: t("seat"),
    table: t("table"),
    reserved: t("reserved"),
    sheet: t("sheet"),
    guideTitle: t("guideTitle"),
    stepPrint: t("stepPrint"),
    stepTest: t("stepTest"),
    stepOrder: t("stepOrder"),
    summary: (labels, sheets, chairs) => t("summary", { labels, sheets, chairs }),
    floorAdvice: t("floorAdvice"),
    placementTitle: t("placementTitle"),
    stage: t("stage"),
    checklistTitle: t("checklistTitle"),
    chairs: t("chairs"),
    total: t("total"),
    roadmapTitle: t("roadmapTitle"),
    seatsRange: (from, to) => t("seatsRange", { from, to }),
    testTitle: t("testTitle"),
    testHelp: t("testHelp"),
    zone: t("zone"),
  };
}
async function kitBrand(ctx: OrgContext): Promise<KitBrand> {
  const b = await emailBrandFor(ctx.organization.id);
  return { primary: b.primary, primaryInk: b.primaryInk, logo: await logoBytes(b.logoUrl) };
}

export async function seatLabelsPdf(ctx: OrgContext, eventId: string, opts: KitOptions) {
  const kit = await loadKit(ctx, eventId, opts);
  return buildLabelsPdf({
    seats: kit.seats,
    format: opts.format,
    model: opts.model,
    brand: await kitBrand(ctx),
    words: await kitWords(kit.event.locale),
    eventTitle: opts.showEvent ? kit.event.title : null,
  });
}
export async function seatGuidePdf(ctx: OrgContext, eventId: string, opts: KitOptions) {
  const kit = await loadKit(ctx, eventId, opts);
  return buildGuidePdf({
    seats: kit.seats,
    format: opts.format,
    brand: await kitBrand(ctx),
    words: await kitWords(kit.event.locale),
    title: `${kit.event.title} · ${ctx.organization.name}`,
    focus: kit.focus,
    zones: kit.zones,
    zoneShape: opts.zoneShape,
  });
}
export async function seatTestPagePdf(ctx: OrgContext, eventId: string, opts: KitOptions) {
  if (!hasFeature(ctx.features, "SEATING_MAPS")) throw new CoreError("FEATURE_UNAVAILABLE");
  const event = await findEvent(ctx, eventId);
  return buildTestPagePdf(opts.format, await kitWords(event.locale));
}
/** Récapitulatif pour l'écran : nombre d'étiquettes et de feuilles, première feuille pour l'aperçu. */
export async function kitPreview(ctx: OrgContext, eventId: string, opts: KitOptions) {
  const kit = await loadKit(ctx, eventId, opts);
  const sheets = paginate(kit.seats, opts.format);
  return { ...kit, sheets: sheets.length, first: sheets[0] ?? null };
}
