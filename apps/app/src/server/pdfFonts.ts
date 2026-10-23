import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { BRAND_FONTS, isBrandFont } from "@evoly/ui";
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";

/**
 * Polices des billets PDF : celles de la marque (Pro), sinon la charte (Archivo Black, Poppins), sinon Helvetica.
 * Un palier n'est retenu que s'il affiche tous les caractères du billet (noms, lieu…) : jamais de caractère manquant.
 * Fichiers : assets/fonts (sous-ensembles latins des polices de la marque, charte complète ; licence OFL).
 */
const DISPLAY_ONLY = new Set(["archivo-black", "bebas-neue"]);
const CHARTE = {
  title: "ArchivoBlack-Regular.ttf",
  regular: "Poppins-Regular.ttf",
  bold: "Poppins-SemiBold.ttf",
};
const fileOf = (key: string, role: "title" | "regular" | "bold") => {
  if (key === "archivo-black") return CHARTE.title;
  if (key === "poppins")
    return role === "regular" ? CHARTE.regular : CHARTE.bold;
  return `${key}-${role === "regular" || DISPLAY_ONLY.has(key) ? 400 : 700}.ttf`;
};

export interface TicketFonts {
  title: PDFFont;
  regular: PDFFont;
  bold: PDFFont;
  /** Vraie police (non Helvetica) : le texte garde tous ses caractères. */
  custom: boolean;
}

export async function embedTicketFonts(
  pdf: PDFDocument,
  choice: { heading?: string | null; body?: string | null },
  texts: string[],
): Promise<TicketFonts> {
  const codes = [
    ...new Set(
      [...texts.join("")].map((c) => c.codePointAt(0)!).filter((c) => c > 32),
    ),
  ];
  const heading = isBrandFont(choice.heading) ? choice.heading : null;
  const body =
    isBrandFont(choice.body) && BRAND_FONTS[choice.body].body
      ? choice.body
      : null;
  const tiers = [
    ...(heading || body
      ? [
          {
            title: fileOf(heading ?? "archivo-black", "title"),
            regular: fileOf(body ?? "poppins", "regular"),
            bold: fileOf(body ?? "poppins", "bold"),
          },
        ]
      : []),
    CHARTE,
  ];
  for (const files of tiers) {
    const bytes = await Promise.all(
      [files.title, files.regular, files.bold].map((f) =>
        readFile(join(process.cwd(), "assets/fonts", f)).catch(() => null),
      ),
    );
    if (bytes.some((b) => !b)) continue;
    const covers = bytes.every((b) => {
      const font = fontkit.create(b!);
      return codes.every((c) => font.hasGlyphForCodePoint(c));
    });
    if (!covers) continue;
    pdf.registerFontkit(fontkit);
    const [title, regular, bold] = await Promise.all(
      bytes.map((b) => pdf.embedFont(b!, { subset: true })),
    );
    return { title: title!, regular: regular!, bold: bold!, custom: true };
  }
  return {
    title: await pdf.embedFont(StandardFonts.HelveticaBold),
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    custom: false,
  };
}
