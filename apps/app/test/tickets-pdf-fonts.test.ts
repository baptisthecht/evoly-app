import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildTicketsPdf } from "@/server/ticketsPdf";

const base = (holder = "Léa Martin") => ({
  organizationName: "Club des Fêtes",
  eventTitle: "Gala de printemps",
  when: "samedi 20 février 2027 à 20:00",
  where: "La Madeleine, Bruxelles",
  reference: "EVO-AB12",
  tickets: [
    {
      code: "EVO-TICKET-0001-QRCODE",
      shortCode: "AB12CD",
      typeName: "Entrée",
      holder,
    },
  ],
  labels: {
    ticket: (i: number, n: number) => `Billet ${i}/${n}`,
    holder: "Titulaire",
    reference: "Commande",
    entrance: "Présentez ce QR code à l’entrée.",
    poweredBy: "Billetterie propulsée par Evoly",
  },
});
/** Polices réellement intégrées dans le PDF (noms PostScript). */
async function fontsOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (
      obj instanceof PDFDict &&
      obj.get(PDFName.of("Type")) === PDFName.of("Font")
    ) {
      const name = obj.get(PDFName.of("BaseFont"));
      if (name) names.push(name.toString());
    }
  }
  return names.join(" ");
}

describe("billets PDF : polices", () => {
  it("sans réglage : la charte (Archivo Black pour le titre, Poppins pour le texte)", async () => {
    const f = await fontsOf(await buildTicketsPdf(base()));
    expect(f).toMatch(/ArchivoBlack/);
    expect(f).toMatch(/Poppins/);
    expect(f).not.toMatch(/Helvetica/);
  });

  it("marque (Pro) : ses polices des titres et du texte", async () => {
    const f = await fontsOf(
      await buildTicketsPdf({
        ...base(),
        fonts: { heading: "playfair-display", body: "lora" },
      }),
    );
    expect(f).toMatch(/PlayfairDisplay/);
    expect(f).toMatch(/Lora/);
    expect(f).not.toMatch(/Poppins|Helvetica/);
  });

  it("nom avec des lettres absentes de la police de la marque : la charte prend le relais, rien n'est retiré", async () => {
    const f = await fontsOf(
      await buildTicketsPdf({
        ...base("Łukasz Żółć"),
        fonts: { heading: "inter", body: "inter" },
      }),
    );
    expect(f).toMatch(/Poppins/);
    expect(f).not.toMatch(/Inter/);
  });

  it("caractère absent de toutes les polices : Helvetica, sans erreur ; police inconnue : la charte", async () => {
    expect(await fontsOf(await buildTicketsPdf(base("李 Wei")))).toMatch(
      /Helvetica/,
    );
    expect(
      await fontsOf(
        await buildTicketsPdf({
          ...base(),
          fonts: { heading: "comic-sans", body: "bebas-neue" },
        }),
      ),
    ).toMatch(/Poppins/);
  });
});
