import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MENTIONS, statementPdf } from "@/server/finances";

// relevés de commissions (RG-FIN) : la mention de TVA imprimée dans le PDF, dans la langue de l'organisation,
// pour les 4 situations (TVA belge, autoliquidation, guichet unique OSS, hors Union européenne)
const rid = () => Math.random().toString(36).slice(2, 10);
const dir = mkdtempSync(join(tmpdir(), "releves-"));
const norm = (s: string) =>
  s
    .replace(/[\u202f\u00a0\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** Texte imprimé dans un PDF (pdftotext, installé dans la CI). */
function pdfText(bytes: Uint8Array) {
  const file = join(dir, `${rid()}.pdf`);
  writeFileSync(file, bytes);
  return norm(execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }));
}
const situations = [
  { mention: "BE_VAT", rateBps: 2100 },
  { mention: "REVERSE_CHARGE", rateBps: null },
  { mention: "OSS", rateBps: 2000 },
  { mention: "OUTSIDE_EU", rateBps: null },
] as const;

describe("relevés de commissions : mention de TVA imprimée", () => {
  for (const locale of Object.keys(MENTIONS) as Array<keyof typeof MENTIONS>) {
    it(`en ${locale} : les 4 mentions, avec le taux quand il y en a un`, { timeout: 60_000 }, async () => {
      const id = rid();
      const org = await db.organization.create({
        data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale },
      });
      for (const [n, { mention, rateBps }] of situations.entries()) {
        // un relevé par organisation, par mois et par devise : un mois différent pour chaque situation
        const month = String(n + 1).padStart(2, "0");
        const st = await db.commissionStatement.create({
          data: {
            organizationId: org.id,
            number: `TEST-${id}-${mention}`,
            periodStart: new Date(`2026-${month}-01T00:00:00Z`),
            periodEnd: new Date(`2026-${String(n + 2).padStart(2, "0")}-01T00:00:00Z`),
            currency: "EUR",
            ticketsCount: 10,
            feesMinor: 2_500,
            feesRefundedMinor: 0,
            vatRateBps: rateBps,
            vatMinor: rateBps ? Math.round((2_500 * rateBps) / (10_000 + rateBps)) : 0,
            totalMinor: 2_500,
            vatMention: mention,
            status: "ISSUED",
            issuedAt: new Date("2026-10-01T08:00:00Z"),
          },
        });
        const text = pdfText((await statementPdf(st.id)).bytes);
        const expected = norm(MENTIONS[locale][mention](`${(rateBps ?? 0) / 100} %`));
        expect(text, `${locale} · ${mention}`).toContain(expected);
      }
    });
  }
});
