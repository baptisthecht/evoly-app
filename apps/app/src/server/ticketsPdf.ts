import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

const CHARBON = rgb(0x22 / 255, 0x22 / 255, 0x22 / 255);
const CREME = rgb(1, 0xf6 / 255, 0xf0 / 255);
const ROSE = rgb(1, 0xb8 / 255, 0xe8 / 255);
const GRIS = rgb(0.4, 0.4, 0.4);

/** Les polices standard du PDF (WinAnsi) ne couvrent pas tous les caractères : espaces fines et symboles rares sont remplacés. */
const clean = (s: string) =>
  s
    .replace(/[\u202f\u00a0\u2009]/g, " ")
    .replace(/→/g, "-")
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u20ac\u0152\u0153]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of clean(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawQr(page: PDFPage, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c))
        page.drawRectangle({ x: x + (c + quiet) * cell, y: y + size - (r + quiet + 1) * cell, width: cell + 0.2, height: cell + 0.2, color: CHARBON });
    }
  }
}

export interface PdfTicket {
  code: string;
  shortCode: string;
  /** Billet revendu, remboursé ou annulé : barré, sans QR code (section 9.12). */
  invalidLabel?: string | null;
  typeName: string;
  holder: string | null;
}

/** PDF d'une commande : une page par billet, QR code grand format (section 9.12). */
export async function buildTicketsPdf(o: {
  brand?: { primary: string | null; primaryInk: string | null; logo: { bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null; showPoweredBy: boolean };
  organizationName: string;
  eventTitle: string;
  when: string;
  where: string | null;
  reference: string;
  tickets: PdfTicket[];
  labels: { ticket: (i: number, n: number) => string; holder: string; reference: string; entrance: string; poweredBy: string };
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`${o.eventTitle} - ${o.reference}`));
  pdf.setCreator("Evoly");
  pdf.setProducer("Evoly");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);
  const [W, H] = [595.28, 841.89]; // A4
  const toRgb = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
  const band = o.brand?.primary ? toRgb(o.brand.primary) : CHARBON;
  const bandInk = o.brand?.primaryInk ? toRgb(o.brand.primaryInk) : CREME;
  const logo = o.brand?.logo
    ? await (o.brand.logo.type === "image/png" ? pdf.embedPng(o.brand.logo.bytes) : pdf.embedJpg(o.brand.logo.bytes)).catch(() => null)
    : null;
  o.tickets.forEach((t, i) => {
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREME });
    page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: band });
    if (logo) {
      const h = 44;
      const w = Math.min(220, (logo.width / logo.height) * h);
      page.drawImage(logo, { x: 48, y: H - 67, width: w, height: (w / ((logo.width / logo.height) * h)) * h });
    } else page.drawText(clean(o.organizationName), { x: 48, y: H - 55, size: 16, font: bold, color: bandInk });
    const label = clean(o.labels.ticket(i + 1, o.tickets.length));
    page.drawText(label, { x: W - 48 - regular.widthOfTextAtSize(label, 11), y: H - 53, size: 11, font: regular, color: bandInk });
    let y = H - 150;
    for (const line of wrap(o.eventTitle, bold, 30, W - 96)) {
      page.drawText(line, { x: 48, y, size: 30, font: bold, color: CHARBON });
      y -= 36;
    }
    page.drawText(clean(o.when), { x: 48, y: y - 4, size: 13, font: regular, color: CHARBON });
    y -= 24;
    if (o.where) {
      for (const line of wrap(o.where, regular, 13, W - 96)) {
        page.drawText(line, { x: 48, y: y - 4, size: 13, font: regular, color: GRIS });
        y -= 18;
      }
    }
    const qrSize = 280;
    const qrY = y - 40 - qrSize;
    page.drawRectangle({
      x: (W - qrSize) / 2 - 16,
      y: qrY - 70,
      width: qrSize + 32,
      height: qrSize + 100,
      color: rgb(1, 1, 1),
      borderColor: ROSE,
      borderWidth: 3,
    });
    if (t.invalidLabel) {
      // aucun QR code : le billet ne doit plus pouvoir être présenté à l'entrée
      page.drawLine({ start: { x: (W - qrSize) / 2, y: qrY }, end: { x: (W + qrSize) / 2, y: qrY + qrSize }, thickness: 6, color: rgb(0.8, 0.13, 0.2) });
      page.drawLine({ start: { x: (W - qrSize) / 2, y: qrY + qrSize }, end: { x: (W + qrSize) / 2, y: qrY }, thickness: 6, color: rgb(0.8, 0.13, 0.2) });
      const label = clean(t.invalidLabel);
      page.drawRectangle({ x: 48, y: qrY + qrSize / 2 - 26, width: W - 96, height: 52, color: rgb(0.8, 0.13, 0.2) });
      page.drawText(label, { x: (W - bold.widthOfTextAtSize(label, 20)) / 2, y: qrY + qrSize / 2 - 7, size: 20, font: bold, color: rgb(1, 1, 1) });
    } else drawQr(page, t.code, (W - qrSize) / 2, qrY, qrSize);
    const spaced = t.shortCode.split("").join(" ");
    page.drawText(spaced, { x: (W - mono.widthOfTextAtSize(spaced, 22)) / 2, y: qrY - 42, size: 22, font: mono, color: CHARBON });
    let infoY = qrY - 110;
    page.drawText(clean(t.typeName), { x: 48, y: infoY, size: 18, font: bold, color: CHARBON });
    infoY -= 24;
    if (t.holder) {
      page.drawText(clean(`${o.labels.holder} : ${t.holder}`), { x: 48, y: infoY, size: 12, font: regular, color: CHARBON });
      infoY -= 18;
    }
    page.drawText(clean(`${o.labels.reference} : ${o.reference}`), { x: 48, y: infoY, size: 12, font: regular, color: GRIS });
    for (const [k, line] of wrap(o.labels.entrance, regular, 10, W - 96).entries())
      page.drawText(line, { x: 48, y: 70 - k * 14, size: 10, font: regular, color: GRIS });
    if (o.brand?.showPoweredBy !== false) page.drawText(clean(o.labels.poweredBy), { x: 48, y: 30, size: 9, font: bold, color: CHARBON });
  });
  return pdf.save();
}
