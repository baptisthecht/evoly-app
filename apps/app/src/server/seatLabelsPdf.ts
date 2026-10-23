import fontkit from "@pdf-lib/fontkit";
import {
  chairCounts,
  hasSheetMarker,
  paginate,
  PALETTE,
  sheetSlots,
  type LabelSeat,
  type SheetFormat,
  type Slot,
} from "@evoly/core";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

/**
 * Kit d'installation de salle (section 9.33) : étiquettes de place, guide de pose et page test, en PDF A4.
 * Les positions viennent du cœur (@evoly/core) au millimètre près ; ce fichier ne fait que dessiner.
 */

export type LabelModel = "classique" | "contraste" | "zone" | "econome";
export type LabelWords = {
  row: string;
  seat: string;
  table: string;
  reserved: string;
  sheet: string;
  guideTitle: string;
  stepPrint: string;
  stepTest: string;
  stepOrder: string;
  summary: (labels: number, sheets: number, chairs: number) => string;
  floorAdvice: string;
  placementTitle: string;
  stage: string;
  checklistTitle: string;
  chairs: string;
  total: string;
  roadmapTitle: string;
  seatsRange: (from: string, to: string) => string;
  testTitle: string;
  testHelp: string;
  zone: string;
};
export type KitBrand = {
  primary: string | null;
  primaryInk: string | null;
  logo: { bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null;
};

const PT = 72 / 25.4; // points par millimètre
/** Couleur #RRGGBB de la palette du design system (contextes sans CSS) en couleur PDF. */
const hexRgb = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const H = 297 * PT;
const CHARBON = hexRgb(PALETTE.charbon);
const GRIS = hexRgb(PALETTE.planEntrance);
const FILET = hexRgb(PALETTE.seatBlocked);
const hex = (c: string | null | undefined, fallback = CHARBON) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? "");
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
/** Texte lisible sur une couleur : noir ou blanc selon sa luminance. */
const inkOn = (c: string) => {
  const n = parseInt(c.replace("#", ""), 16);
  const l =
    (0.2126 * ((n >> 16) & 255) +
      0.7152 * ((n >> 8) & 255) +
      0.0722 * (n & 255)) /
    255;
  return l > 0.6 ? CHARBON : rgb(1, 1, 1);
};

type Fonts = { display: PDFFont; regular: PDFFont; semibold: PDFFont };
async function setup(): Promise<{ pdf: PDFDocument; fonts: Fonts }> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const dir = join(process.cwd(), "assets/fonts");
  const font = async (f: string) =>
    pdf.embedFont(await readFile(join(dir, f)), { subset: true });
  return {
    pdf,
    fonts: {
      display: await font("ArchivoBlack-Regular.ttf"),
      regular: await font("Poppins-Regular.ttf"),
      semibold: await font("Poppins-SemiBold.ttf"),
    },
  };
}
const embedLogo = async (pdf: PDFDocument, brand: KitBrand | null) =>
  brand?.logo
    ? await (
        brand.logo.type === "image/png"
          ? pdf.embedPng(brand.logo.bytes)
          : pdf.embedJpg(brand.logo.bytes)
      ).catch(() => null)
    : null;

/** Plus grande taille qui tient dans la largeur, sans dépasser `max`. */
const fit = (font: PDFFont, text: string, width: number, max: number) =>
  Math.max(
    4,
    Math.min(
      max,
      (max * width) / Math.max(1, font.widthOfTextAtSize(text, max)),
    ),
  );
/** Rectangle en millimètres depuis le haut de la feuille (repère du cœur) vers les points PDF (origine en bas). */
const box = (s: Slot) => ({
  x: s.x * PT,
  y: H - (s.y + s.height) * PT,
  w: s.width * PT,
  h: s.height * PT,
});

function drawLogo(
  page: PDFPage,
  logo: PDFImage,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  const ratio = logo.width / logo.height;
  const w = Math.min(maxW, maxH * ratio),
    h = w / ratio;
  page.drawImage(logo, { x, y, width: w, height: h });
}
/** Pictogramme des places pour personne à mobilité réduite, dans un carré de côté `size`. */
function drawAccessible(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  color = CHARBON,
) {
  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    color: hexRgb(PALETTE.info),
  });
  const s = size / 24;
  page.drawSvgPath(
    "M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-1 5h2v5h4l3 6-1.8.9L15.8 14H11zM8.5 9.6l.9 1.8A4.5 4.5 0 1 0 15 18h2a6.5 6.5 0 1 1-8.5-8.4z",
    {
      x,
      y: y + size,
      scale: s,
      color: rgb(1, 1, 1),
    },
  );
  void color;
}

function drawLabel(
  page: PDFPage,
  s: Slot,
  seat: LabelSeat,
  o: {
    model: LabelModel;
    fonts: Fonts;
    brand: KitBrand | null;
    logo: PDFImage | null;
    words: LabelWords;
    eventTitle: string | null;
    cutMarks: boolean;
  },
) {
  const { x, y, w, h } = box(s);
  const pad = Math.min(w, h) * 0.08;
  const { fonts, words } = o;
  const accent =
    o.model === "zone"
      ? hex(seat.category.color)
      : o.model === "classique"
        ? hex(o.brand?.primary ?? PALETTE.charbon)
        : CHARBON;
  if (o.cutMarks)
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: FILET,
      borderWidth: 0.5,
      borderDashArray: [3, 3],
    });
  // bandeau : couleur de zone (modèle Couleur de zone), couleur de la marque (Classique), rien pour Contraste et Économe
  const band = o.model === "zone" || o.model === "classique" ? h * 0.2 : 0;
  if (band)
    page.drawRectangle({
      x,
      y: y + h - band,
      width: w,
      height: band,
      color: accent,
    });
  const bandInk =
    o.model === "zone"
      ? inkOn(seat.category.color)
      : o.brand?.primaryInk
        ? hex(o.brand.primaryInk)
        : rgb(1, 1, 1);
  const top = seat.block.name.toUpperCase();
  const topFont = fonts.semibold;
  const topSize = fit(
    topFont,
    top,
    w * (o.logo && o.model !== "contraste" ? 0.6 : 0.9) - 2 * pad,
    band ? band * 0.5 : h * 0.12,
  );
  page.drawText(top, {
    x: x + pad,
    y: y + h - (band ? band * 0.7 : pad + topSize),
    size: topSize,
    font: topFont,
    color: band ? bandInk : GRIS,
  });
  if (o.logo && o.model !== "contraste")
    drawLogo(
      page,
      o.logo,
      x + w * 0.62,
      y + h - (band || h * 0.2) + pad * 0.4,
      w * 0.38 - pad,
      (band || h * 0.2) - pad * 0.8,
    );
  // rang et place en très grand, chacun avec sa légende
  const caption = (t: string) => t.toUpperCase();
  const rowCaption = caption(seat.row.table ? words.table : words.row),
    seatCaption = caption(words.seat);
  // sans bandeau, le nom du bloc occupe sa propre ligne : les chiffres commencent dessous (plus de chevauchement)
  const bodyTop = y + h - (band || pad + topSize * 1.5) - pad,
    bodyBottom = y + pad + (o.eventTitle ? h * 0.1 : 0);
  const capSize = Math.min(h * 0.09, 9);
  const half = (w - 3 * pad) / 2;
  const numMax = (bodyTop - bodyBottom - capSize * 1.6) * 0.95;
  const numSize = Math.min(
    fit(fonts.display, seat.row.name, half, numMax),
    fit(fonts.display, seat.label, half, numMax),
  );
  const ink =
    o.model === "contraste" || o.model === "econome" ? CHARBON : CHARBON;
  [
    [rowCaption, seat.row.name, x + pad],
    [seatCaption, seat.label, x + 2 * pad + half],
  ].forEach(([cap, value, cx]) => {
    page.drawText(cap as string, {
      x: cx as number,
      y: bodyTop - capSize,
      size: capSize,
      font: fonts.semibold,
      color: GRIS,
    });
    page.drawText(value as string, {
      x: cx as number,
      y: bodyTop - capSize * 1.4 - numSize * 0.78,
      size: numSize,
      font: fonts.display,
      color: ink,
    });
  });
  if (o.model === "contraste")
    page.drawLine({
      start: { x: x + 2 * pad + half - pad / 2, y: bodyBottom },
      end: { x: x + 2 * pad + half - pad / 2, y: bodyTop },
      thickness: 1.2,
      color: CHARBON,
    });
  if (o.eventTitle) {
    const t = o.eventTitle;
    page.drawText(t, {
      x: x + pad,
      y: y + pad,
      size: fit(fonts.regular, t, w * 0.7, h * 0.07),
      font: fonts.regular,
      color: GRIS,
    });
  }
  const icon = Math.min(h * 0.2, 20);
  if (seat.accessible) drawAccessible(page, x + w - pad - icon, y + pad, icon);
  if (seat.blocked) {
    const r = words.reserved.toUpperCase();
    const size = fit(fonts.semibold, r, w * 0.4, h * 0.09);
    const tw = fonts.semibold.widthOfTextAtSize(r, size);
    page.drawRectangle({
      x: x + w - pad - tw - 6 - (seat.accessible ? icon + 4 : 0),
      y: y + pad - 2,
      width: tw + 6,
      height: size + 4,
      borderColor: rgb(0.75, 0.1, 0.1),
      borderWidth: 1,
    });
    page.drawText(r, {
      x: x + w - pad - tw - 3 - (seat.accessible ? icon + 4 : 0),
      y: y + pad,
      size,
      font: fonts.semibold,
      color: rgb(0.75, 0.1, 0.1),
    });
  }
}

/** Étiquettes de place (RG-ETIQ-03 à 06), dans l'ordre de pose déjà calculé par le cœur. */
export async function buildLabelsPdf(o: {
  seats: LabelSeat[];
  format: SheetFormat;
  model: LabelModel;
  brand: KitBrand | null;
  words: LabelWords;
  eventTitle: string | null;
}) {
  const { pdf, fonts } = await setup();
  const logo = await embedLogo(pdf, o.brand);
  const sheets = paginate(o.seats, o.format);
  for (const sheet of sheets) {
    const page = pdf.addPage([210 * PT, H]);
    if (hasSheetMarker(o.format)) {
      const t = `${o.words.sheet} ${sheet.index}/${sheets.length} · ${sheet.rows.join(", ")}`;
      page.drawText(t, {
        x: o.format.marginLeft * PT + 4,
        y: H - (o.format.marginTop * PT) / 2 - 3,
        size: fit(
          fonts.regular,
          t,
          (210 - 2 * o.format.marginLeft) * PT - 8,
          8,
        ),
        font: fonts.regular,
        color: GRIS,
      });
    }
    for (const { slot, seat } of sheet.slots)
      drawLabel(page, slot, seat, {
        ...o,
        fonts,
        logo,
        cutMarks: o.format.cutMarks,
      });
  }
  return pdf.save();
}

/** Page test d'alignement : les contours des étiquettes, à imprimer sur papier normal et à superposer à une planche. */
export async function buildTestPagePdf(format: SheetFormat, words: LabelWords) {
  const { pdf, fonts } = await setup();
  const page = pdf.addPage([210 * PT, H]);
  sheetSlots(format).forEach((s, i) => {
    const { x, y, w, h } = box(s);
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: CHARBON,
      borderWidth: 0.6,
      borderDashArray: [4, 3],
    });
    page.drawText(String(i + 1), {
      x: x + w / 2 - 6,
      y: y + h / 2 - 6,
      size: 14,
      font: fonts.display,
      color: FILET,
    });
  });
  const help = words.testHelp;
  page.drawText(words.testTitle, {
    x: 30,
    y: H / 2 + 10,
    size: 16,
    font: fonts.display,
    color: CHARBON,
    opacity: 0.85,
  });
  page.drawText(help, {
    x: 30,
    y: H / 2 - 10,
    size: fit(fonts.regular, help, 150 * PT, 10),
    font: fonts.regular,
    color: CHARBON,
  });
  return pdf.save();
}

type Zone = { name: string; color: string };

/** Guide de pose (RG-ETIQ-06 et 07) : démarrage, plan de pose, liste de contrôle, feuille de route, panneaux de rang et de zone. */
export async function buildGuidePdf(o: {
  seats: LabelSeat[];
  format: SheetFormat;
  brand: KitBrand | null;
  words: LabelWords;
  title: string;
  focus: { x: number; y: number } | null;
  zones: Zone[];
  zoneShape: "rond" | "rectangle";
}) {
  const { pdf, fonts } = await setup();
  const logo = await embedLogo(pdf, o.brand);
  const W = 210 * PT,
    M = 18 * PT;
  const accent = hex(o.brand?.primary ?? PALETTE.charbon);
  const sheets = paginate(o.seats, o.format);
  const counts = chairCounts(o.seats);
  const header = (page: PDFPage, title: string) => {
    page.drawRectangle({
      x: 0,
      y: H - 10 * PT,
      width: W,
      height: 10 * PT,
      color: accent,
    });
    if (logo)
      drawLogo(page, logo, W - M - 40 * PT, H - 32 * PT, 40 * PT, 16 * PT);
    page.drawText(title, {
      x: M,
      y: H - 30 * PT,
      size: fit(fonts.display, title, W - 2 * M - 45 * PT, 22),
      font: fonts.display,
      color: CHARBON,
    });
    page.drawText(o.title, {
      x: M,
      y: H - 38 * PT,
      size: 10,
      font: fonts.regular,
      color: GRIS,
    });
  };
  const para = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
    font = fonts.regular,
  ) => {
    const words = text.split(" ");
    let line = "",
      yy = y;
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        page.drawText(line, { x, y: yy, size, font, color: CHARBON });
        yy -= size * 1.45;
        line = w;
      } else line = next;
    }
    if (line) page.drawText(line, { x, y: yy, size, font, color: CHARBON });
    return yy - size * 1.45;
  };

  // 1. démarrage
  let page = pdf.addPage([W, H]);
  header(page, o.words.guideTitle);
  let y = H - 60 * PT;
  [o.words.stepPrint, o.words.stepTest, o.words.stepOrder].forEach((t, i) => {
    page.drawCircle({ x: M + 9, y: y + 4, size: 9, color: accent });
    page.drawText(String(i + 1), {
      x: M + 6,
      y: y,
      size: 11,
      font: fonts.display,
      color: o.brand?.primaryInk ? hex(o.brand.primaryInk) : rgb(1, 1, 1),
    });
    y = para(page, t, M + 26, y, W - 2 * M - 26, 11) - 8;
  });
  y =
    para(
      page,
      o.words.summary(o.seats.length, sheets.length, counts.total),
      M,
      y - 6,
      W - 2 * M,
      12,
      fonts.semibold,
    ) - 10;
  para(page, o.words.floorAdvice, M, y, W - 2 * M, 10);

  // 2. plan de pose : les places à leurs vraies positions, la scène, le nom des rangs
  const placed = o.seats.filter((s) => s.x !== null && s.y !== null);
  const drawMiniPlan = (
    pg: PDFPage,
    x0: number,
    y0: number,
    w: number,
    h: number,
    highlight: Set<string> | null,
  ) => {
    if (!placed.length) return;
    const xs = placed.map((s) => s.x!).concat(o.focus ? [o.focus.x] : []),
      ys = placed.map((s) => s.y!).concat(o.focus ? [o.focus.y] : []);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const k = Math.min(
      w / Math.max(1, maxX - minX),
      h / Math.max(1, maxY - minY),
    );
    const px = (v: number) => x0 + (v - minX) * k,
      py = (v: number) => y0 + h - (v - minY) * k;
    const r = Math.max(0.8, Math.min(3, k * 6));
    for (const s of placed)
      pg.drawCircle({
        x: px(s.x!),
        y: py(s.y!),
        size: r,
        color: highlight
          ? highlight.has(s.id)
            ? accent
            : FILET
          : hex(s.category.color, GRIS),
      });
    if (o.focus) {
      pg.drawRectangle({
        x: px(o.focus.x) - 30,
        y: py(o.focus.y) - 6,
        width: 60,
        height: 12,
        color: CHARBON,
      });
      pg.drawText(o.words.stage.toUpperCase(), {
        x:
          px(o.focus.x) -
          fonts.semibold.widthOfTextAtSize(o.words.stage.toUpperCase(), 7) / 2,
        y: py(o.focus.y) - 3,
        size: 7,
        font: fonts.semibold,
        color: rgb(1, 1, 1),
      });
    }
    if (!highlight) {
      const seen = new Set<string>();
      for (const s of placed) {
        const key = `${s.block.name}|${s.row.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pg.drawText(s.row.name, {
          x: px(s.x!) - 10,
          y: py(s.y!) - 3,
          size: 6,
          font: fonts.semibold,
          color: CHARBON,
        });
      }
    }
  };
  page = pdf.addPage([W, H]);
  header(page, o.words.placementTitle);
  drawMiniPlan(page, M, H - 60 * PT - 150 * PT, W - 2 * M, 150 * PT, null);
  // 3. liste de contrôle : chaises par rang et au total
  y = H - 60 * PT - 165 * PT;
  page.drawText(o.words.checklistTitle, {
    x: M,
    y,
    size: 13,
    font: fonts.display,
    color: CHARBON,
  });
  y -= 18;
  for (const r of counts.rows) {
    if (y < 20 * PT) {
      page = pdf.addPage([W, H]);
      header(page, o.words.checklistTitle);
      y = H - 55 * PT;
    }
    page.drawRectangle({
      x: M,
      y: y - 2,
      width: 8,
      height: 8,
      borderColor: CHARBON,
      borderWidth: 0.8,
    });
    page.drawText(`${r.block} · ${r.row}`, {
      x: M + 16,
      y,
      size: 10,
      font: fonts.regular,
      color: CHARBON,
    });
    const c = `${r.chairs} ${o.words.chairs}`;
    page.drawText(c, {
      x: W - M - fonts.semibold.widthOfTextAtSize(c, 10),
      y,
      size: 10,
      font: fonts.semibold,
      color: CHARBON,
    });
    y -= 15;
  }
  const t = `${o.words.total} : ${counts.total} ${o.words.chairs}`;
  page.drawText(t, {
    x: W - M - fonts.display.widthOfTextAtSize(t, 12),
    y: y - 4,
    size: 12,
    font: fonts.display,
    color: CHARBON,
  });

  // 4. feuille de route : chaque feuille d'étiquettes, ses rangs et son mini-plan (6 par page)
  sheets.forEach((sheet, i) => {
    if (i % 6 === 0) {
      page = pdf.addPage([W, H]);
      header(page, o.words.roadmapTitle);
    }
    const col = i % 2,
      line = Math.floor((i % 6) / 2);
    const cw = (W - 2 * M - 10) / 2,
      ch = 72 * PT;
    const cx = M + col * (cw + 10),
      cy = H - 50 * PT - (line + 1) * (ch + 6);
    page.drawRectangle({
      x: cx,
      y: cy,
      width: cw,
      height: ch,
      borderColor: FILET,
      borderWidth: 0.8,
    });
    const first = sheet.slots[0]!.seat,
      last = sheet.slots[sheet.slots.length - 1]!.seat;
    page.drawText(`${o.words.sheet} ${sheet.index}`, {
      x: cx + 8,
      y: cy + ch - 18,
      size: 13,
      font: fonts.display,
      color: CHARBON,
    });
    para(
      page,
      `${sheet.rows.join(", ")} · ${o.words.seatsRange(`${first.row.name}${first.label}`, `${last.row.name}${last.label}`)}`,
      cx + 8,
      cy + ch - 32,
      cw - 16,
      8.5,
    );
    drawMiniPlan(
      page,
      cx + 8,
      cy + 6,
      cw - 16,
      ch - 50,
      new Set(sheet.slots.map((x) => x.seat.id)),
    );
  });

  // 5. panneaux de rang : deux par feuille A4, à poser au bout de chaque rang
  counts.rows.forEach((r, i) => {
    if (i % 2 === 0) page = pdf.addPage([W, H]);
    const yy = i % 2 === 0 ? H / 2 : 0;
    const rowSeats = o.seats.filter(
      (s) => s.block.name === r.block && s.row.name === r.row,
    );
    page.drawLine({
      start: { x: 10, y: H / 2 },
      end: { x: W - 10, y: H / 2 },
      thickness: 0.4,
      color: FILET,
      dashArray: [4, 4],
    });
    const big = `${(rowSeats[0]?.row.table ? o.words.table : o.words.row).toUpperCase()} ${r.row}`;
    page.drawText(big, {
      x: M,
      y: yy + H / 4 - 10,
      size: fit(fonts.display, big, W - 2 * M, 96),
      font: fonts.display,
      color: CHARBON,
    });
    page.drawText(
      `${r.block} · ${o.words.seatsRange(rowSeats[0]?.label ?? "", rowSeats[rowSeats.length - 1]?.label ?? "")}`,
      {
        x: M,
        y: yy + H / 4 - 50,
        size: 18,
        font: fonts.semibold,
        color: GRIS,
      },
    );
    if (logo)
      drawLogo(page, logo, W - M - 50 * PT, yy + 14 * PT, 50 * PT, 18 * PT);
  });

  // 6. panneaux de zone : une feuille A4 par bloc, ronde ou rectangulaire, à la couleur de la zone
  for (const z of o.zones) {
    page = pdf.addPage([W, H]);
    const color = hex(z.color),
      ink = inkOn(z.color);
    if (o.zoneShape === "rond")
      page.drawCircle({ x: W / 2, y: H / 2 + 20, size: 95 * PT, color });
    else
      page.drawRectangle({
        x: M,
        y: 60 * PT,
        width: W - 2 * M,
        height: H - 120 * PT,
        color,
      });
    const name = z.name.toUpperCase();
    page.drawText(name, {
      x:
        W / 2 -
        fonts.display.widthOfTextAtSize(
          name,
          fit(fonts.display, name, 150 * PT, 72),
        ) /
          2,
      y: H / 2,
      size: fit(fonts.display, name, 150 * PT, 72),
      font: fonts.display,
      color: ink,
    });
    page.drawText(o.words.zone.toUpperCase(), {
      x:
        W / 2 -
        fonts.semibold.widthOfTextAtSize(o.words.zone.toUpperCase(), 16) / 2,
      y: H / 2 + 80,
      size: 16,
      font: fonts.semibold,
      color: ink,
    });
    if (logo)
      drawLogo(page, logo, W / 2 - 25 * PT, H / 2 - 70 * PT, 50 * PT, 20 * PT);
    para(page, o.words.floorAdvice, M, 30 * PT, W - 2 * M, 8);
  }
  return pdf.save();
}
