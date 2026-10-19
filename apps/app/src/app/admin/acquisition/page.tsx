import type { Metadata } from "next";
import Link from "next/link";
import { acquisitionFunnel } from "@/server/acquisitionReport";
import { requireStaff } from "@/server/platform";

export const metadata: Metadata = { title: "Acquisition" };

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)} %` : "—");

/** D'où viennent les organisations, et lesquelles deviennent de vrais clients (docs/TRACKING.md). */
export default async function AcquisitionPage({ searchParams }: { searchParams: Promise<{ jours?: string }> }) {
  await requireStaff("SUPPORT");
  const days = Math.min(365, Math.max(7, Number((await searchParams).jours) || 90));
  const { rows, detail } = await acquisitionFunnel(new Date(Date.now() - days * 86_400_000));
  const total = rows.reduce((t, r) => ({ o: t.o + r.organizations, p: t.p + r.published, s: t.s + r.firstSale, pro: t.pro + r.pro }), {
    o: 0,
    p: 0,
    s: 0,
    pro: 0,
  });
  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Acquisition</h1>
          <p className="text-sm text-ink-muted">Organisations créées ces {days} derniers jours, par source de la première visite de leur créateur.</p>
        </div>
        <nav className="flex gap-3 text-sm">
          {[30, 90, 365].map((d) => (
            <Link key={d} href={`/admin/acquisition?jours=${d}`} className={d === days ? "font-bold" : "underline"}>
              {d} jours
            </Link>
          ))}
          <a href={`/admin/acquisition/export?jours=${days}`} className="underline">
            Conversions pour Google Ads (CSV)
          </a>
        </nav>
      </header>
      <p className="text-sm">
        {total.o} organisations · {total.p} ont publié ({pct(total.p, total.o)}) · {total.s} ont vendu ({pct(total.s, total.o)}) · {total.pro} en Pro (
        {pct(total.pro, total.o)})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th>Source</th>
              <th>Support</th>
              <th>Campagne</th>
              <th className="text-right">Organisations</th>
              <th className="text-right">Ont publié</th>
              <th className="text-right">Ont vendu</th>
              <th className="text-right">Pro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.source}|${r.medium}|${r.campaign}`} className="border-t border-line">
                <td>{r.source}</td>
                <td>{r.medium}</td>
                <td>{r.campaign}</td>
                <td className="text-right tabular-nums">{r.organizations}</td>
                <td className="text-right tabular-nums">
                  {r.published} · {pct(r.published, r.organizations)}
                </td>
                <td className="text-right tabular-nums">
                  {r.firstSale} · {pct(r.firstSale, r.organizations)}
                </td>
                <td className="text-right tabular-nums">
                  {r.pro} · {pct(r.pro, r.organizations)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="font-display text-xl">Dernières organisations</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th>Organisation</th>
              <th>Créée le</th>
              <th>Source</th>
              <th>Campagne</th>
              <th>Publié</th>
              <th>Première vente</th>
            </tr>
          </thead>
          <tbody>
            {detail.slice(0, 100).map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td>
                  <Link href={`/admin/organisations/${d.id}`} className="underline">
                    {d.name}
                  </Link>
                </td>
                <td>{d.createdAt.toLocaleDateString("fr-BE")}</td>
                <td>
                  {d.source} / {d.medium}
                </td>
                <td>{d.campaign}</td>
                <td>{d.published ? "oui" : "non"}</td>
                <td>{d.firstSaleAt ? d.firstSaleAt.toLocaleDateString("fr-BE") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
