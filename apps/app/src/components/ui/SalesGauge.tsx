import type { SalesPaceResult } from "@evoly/core";
import { formatDayMonth, type Locale } from "@evoly/i18n";
import { getTranslations } from "next-intl/server";
import { cn } from "./cn";

/**
 * Jauge des ventes avec le trait du rythme (refonte A3, docs/DECISIONS.md) : le trait rose marque la part de la
 * période de vente déjà passée ; la phrase dit en mots si l'on vend en avance, dans le rythme ou un peu lentement.
 */
export async function SalesGauge({
  sold,
  capacity,
  pace,
  timezone,
  locale,
  projection = false,
  className,
}: {
  sold: number;
  capacity: number | null;
  pace: SalesPaceResult;
  timezone: string;
  locale: Locale;
  /** Ajoute la date projetée du complet quand on vend en avance. */
  projection?: boolean;
  className?: string;
}) {
  const t = await getTranslations("pace");
  if (capacity == null)
    return (
      <p className={cn("text-[0.8125rem] tabular-nums", className)}>
        {t("sold", { sold })}
      </p>
    );
  const word = pace.pace === "unknown" ? null : t(pace.pace);
  const tone =
    pace.pace === "ahead" || pace.pace === "soldOut"
      ? "text-success"
      : pace.pace === "behind"
        ? "text-warning"
        : "text-ink-muted";
  const bar =
    pace.pace === "soldOut"
      ? "bg-success"
      : pace.pace === "behind"
        ? "bg-warning"
        : "bg-ink";
  const showMarker =
    pace.elapsedRatio != null &&
    pace.pace !== "soldOut" &&
    pace.pace !== "notStarted";
  const soldOut =
    projection && pace.pace === "ahead" && pace.soldOutAt
      ? formatDayMonth(pace.soldOutAt, timezone, locale)
      : null;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <p className="flex items-baseline justify-between gap-3 text-[0.8125rem] tabular-nums">
        <span>{t("soldOf", { sold, capacity })}</span>
        {word ? <span className={tone}>{word}</span> : null}
      </p>
      <span
        role="img"
        aria-label={t("label", { sold, capacity, pace: word ?? "" })}
        className="relative block h-1.5 rounded-full bg-surface-sunken"
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", bar)}
          style={{ width: `${(pace.soldRatio ?? 0) * 100}%` }}
        />
        {showMarker ? (
          <span
            className="absolute -inset-y-1 w-0.5 rounded-full bg-highlight shadow-[0_0_0_2px_var(--surface-raised)]"
            style={{ left: `${pace.elapsedRatio! * 100}%` }}
          />
        ) : null}
      </span>
      {soldOut ? (
        <p className="text-[0.8125rem] text-success">
          {t("soldOutAt", { date: `${soldOut.day} ${soldOut.month}` })}
        </p>
      ) : null}
    </div>
  );
}

/** Feuille de calendrier (refonte A3) : le mois en rose, le jour en Archivo Black. */
export function DateLeaf({
  date,
  timezone,
  locale,
  className,
}: {
  date: Date;
  timezone: string;
  locale: Locale;
  className?: string;
}) {
  const { day, month } = formatDayMonth(date, timezone, locale);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid w-11 shrink-0 overflow-hidden rounded-md bg-surface-raised text-center ring-1 ring-line-strong",
        className,
      )}
    >
      <span className="border-b border-line bg-highlight-soft pt-1 pb-0.5 text-[0.6875rem] leading-none font-semibold text-highlight-ink">
        {month}
      </span>
      <span className="font-figures pt-1 pb-1.5 text-[1.1875rem] leading-none tracking-[var(--tracking-figures)]">
        {day}
      </span>
    </span>
  );
}
