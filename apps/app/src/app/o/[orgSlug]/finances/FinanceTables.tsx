import type { Locale } from "@evoly/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { DateLeaf } from "@/components/ui/SalesGauge";

export interface FinanceEventRow {
  id: string;
  title: string;
  /** « en vente », « terminé », « gratuit » : sous le titre. */
  state: string;
  startsAt: Date | null;
  timezone: string;
  /** Événement gratuit : un tiret gris dans chaque colonne de montant. */
  free: boolean;
  tickets: number;
  gross: string;
  refunded: string;
  refundedMinor: number;
  commission: string;
  commissionMinor: number;
  bankFees: string;
  bankFeeMinor: number;
  net: string;
  href: string;
}

// refonte A3 (maquettes UIUX/) : en-têtes en 12,5 px gris, cellules à 10 px de marge, un filet sous chaque ligne
const thBase =
  "border-b border-line px-2.5 py-[7px] text-[12.5px] leading-[normal] font-medium whitespace-nowrap text-ink-muted";
const th = `${thBase} text-right`;
const td = "border-b border-line p-2.5 align-middle tabular-nums";
const num = cn(td, "text-right whitespace-nowrap");

/** Un montant retiré : en rouge doux avec un vrai signe moins ; nul, « 0,00 € » en gris clair. */
function Minus({ value, minor }: { value: string; minor: number }) {
  return minor ? (
    <span className="text-minus">−{value}</span>
  ) : (
    <span className="text-ink-faint">{value}</span>
  );
}

/**
 * Finances, par événement (refonte A3, maquette UIUX/pages-a3-suite.html) : la feuille de calendrier et l'état, les
 * billets, les ventes brutes, les retraits en rouge doux, le net en vert ; la dernière ligne fait le total de la période.
 */
export function FinanceEventsTable({
  rows,
  total,
  labels,
  locale,
}: {
  rows: FinanceEventRow[];
  total: {
    label: string;
    tickets: number;
    gross: string;
    refunded: string;
    refundedMinor: number;
    commission: string;
    commissionMinor: number;
    bankFees: string;
    bankFeeMinor: number;
    net: string;
  };
  labels: {
    caption: string;
    event: string;
    tickets: string;
    gross: string;
    refunded: string;
    commission: string;
    bankFees: string;
    net: string;
  };
  locale: Locale;
}) {
  const dash: ReactNode = <span className="text-ink-faint">-</span>;
  return (
    <div className="overflow-x-auto">
      <table
        aria-label={labels.caption}
        className="w-full min-w-[44rem] border-collapse"
      >
        <thead>
          <tr>
            <th scope="col" className={`${thBase} text-left`}>
              {labels.event}
            </th>
            <th scope="col" className={th}>
              {labels.tickets}
            </th>
            <th scope="col" className={th}>
              {labels.gross}
            </th>
            <th scope="col" className={th}>
              {labels.refunded}
            </th>
            <th scope="col" className={th}>
              {labels.commission}
            </th>
            <th scope="col" className={th}>
              {labels.bankFees}
            </th>
            <th scope="col" className={th}>
              {labels.net}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:[&>td]:bg-surface-hover">
              {/* comme la maquette (« td.evl ») : la première cellule est une rangée flexible */}
              <td role="cell" className={cn(td, "flex items-center")}>
                <Link href={r.href} className="flex min-w-0 items-center gap-3">
                  {r.startsAt ? (
                    <DateLeaf
                      date={r.startsAt}
                      timezone={r.timezone}
                      locale={locale}
                    />
                  ) : null}
                  <span className="min-w-0">
                    <b className="block font-semibold">{r.title}</b>
                    <small className="text-[12.5px] text-ink-muted">
                      {r.state}
                    </small>
                  </span>
                </Link>
              </td>
              <td className={num}>{r.tickets}</td>
              <td className={num}>{r.free ? dash : r.gross}</td>
              <td className={num}>
                {r.free ? (
                  dash
                ) : (
                  <Minus value={r.refunded} minor={r.refundedMinor} />
                )}
              </td>
              <td className={num}>
                {r.free ? (
                  dash
                ) : (
                  <Minus value={r.commission} minor={r.commissionMinor} />
                )}
              </td>
              <td className={num}>
                {r.free ? (
                  dash
                ) : (
                  <Minus value={r.bankFees} minor={r.bankFeeMinor} />
                )}
              </td>
              <td className={cn(num, !r.free && "font-semibold text-success")}>
                {r.free ? dash : r.net}
              </td>
            </tr>
          ))}
          {/* le total de la période : un trait charbon au-dessus, en demi-gras, sans filet dessous */}
          <tr className="font-semibold [&>td]:border-t-[1.5px] [&>td]:border-b-0 [&>td]:border-t-ink-strong">
            <td className={td}>{total.label}</td>
            <td className={num}>{total.tickets}</td>
            <td className={num}>{total.gross}</td>
            <td className={num}>
              <Minus value={total.refunded} minor={total.refundedMinor} />
            </td>
            <td className={num}>
              <Minus value={total.commission} minor={total.commissionMinor} />
            </td>
            <td className={num}>
              <Minus value={total.bankFees} minor={total.bankFeeMinor} />
            </td>
            <td className={cn(num, "text-success")}>{total.net}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
