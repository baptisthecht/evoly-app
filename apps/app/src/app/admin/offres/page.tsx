import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/server/platform";
import { promotionStats } from "@/server/promotions";
import { togglePromotionAction } from "./actions";

export const metadata: Metadata = { title: "Offres" };

const STATUS = { RUNNING: "En cours", SCHEDULED: "Programmée", ENDED: "Terminée", EXHAUSTED: "Épuisée", DISABLED: "Suspendue" } as const;
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)} %` : "—");
const day = (d: Date | null) => (d ? d.toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" }) : "—");
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.evoly.me";

/** Offres commerciales : état, conditions et résultats de chaque campagne (docs/OFFRES.md). */
export default async function OffersPage() {
  await requireStaff("SUPPORT");
  const rows = await promotionStats();
  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Offres</h1>
          <p className="text-sm text-ink-muted">Attribuées automatiquement à la création d’une organisation qui remplit leurs conditions, une seule fois.</p>
        </div>
        <Link href="/admin/offres/nouvelle" className="underline">
          Nouvelle offre
        </Link>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th>Offre</th>
              <th>État</th>
              <th>Période</th>
              <th className="text-right">Bénéficiaires</th>
              <th className="text-right">Encore offert</th>
              <th className="text-right">Ont publié</th>
              <th className="text-right">Ont vendu</th>
              <th className="text-right">Pro payant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td>
                  <Link href={`/admin/offres/${r.id}`} className="font-semibold underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {r.code} · {r.audience === "LINK" ? `lien ${APP}/start?offre=${r.code}` : "toute nouvelle organisation"}
                  </div>
                </td>
                <td>{STATUS[r.status]}</td>
                <td>
                  {day(r.startsAt)} → {day(r.endsAt)}
                </td>
                <td className="text-right tabular-nums">
                  {r.redemptions}
                  {r.maxRedemptions !== null ? ` / ${r.maxRedemptions}` : ""}
                </td>
                <td className="text-right tabular-nums">{r.stillOffered}</td>
                <td className="text-right tabular-nums">
                  {r.published} · {pct(r.published, r.redemptions)}
                </td>
                <td className="text-right tabular-nums">
                  {r.firstSale} · {pct(r.firstSale, r.redemptions)}
                </td>
                <td className="text-right tabular-nums">
                  {r.paidPro} · {pct(r.paidPro, r.redemptions)}
                </td>
                <td>
                  <form action={togglePromotionAction.bind(null, r.id, r.status === "DISABLED")}>
                    <button type="submit" className="underline">
                      {r.status === "DISABLED" ? "Réactiver" : "Suspendre"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="text-sm text-ink-muted">Aucune offre pour l’instant.</p> : null}
    </main>
  );
}
