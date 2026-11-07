import type { SalesPaceResult } from "@evoly/core";
import { formatDayMonth, formatShortDate, type Locale } from "@evoly/i18n";
import { getTranslations } from "next-intl/server";
import { cn } from "./cn";
import { Gauge } from "./Gauge";

export { Gauge };

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
  opensAt = null,
  className,
}: {
  sold: number;
  capacity: number | null;
  pace: SalesPaceResult;
  timezone: string;
  locale: Locale;
  /** Ajoute la date projetée du complet quand on vend en avance. */
  projection?: boolean;
  /** Ventes pas encore ouvertes (événement programmé) : « ventes le 1er déc. », jauge vide sans trait. */
  opensAt?: Date | null;
  className?: string;
}) {
  const t = await getTranslations("pace");
  if (capacity == null)
    return (
      <p className={cn("text-[13px] tabular-nums", className)}>
        {t("sold", { sold })}
      </p>
    );
  const word = opensAt
    ? t("notStartedOn", {
        date: formatShortDate(opensAt, timezone, locale),
      })
    : pace.pace === "unknown"
      ? null
      : t(pace.pace);
  const tone =
    pace.pace === "ahead" || pace.pace === "soldOut"
      ? "text-success"
      : pace.pace === "behind"
        ? "text-warning"
        : "text-ink-muted";
  const showMarker =
    !opensAt &&
    pace.elapsedRatio != null &&
    pace.pace !== "soldOut" &&
    pace.pace !== "notStarted";
  const soldOut =
    projection && pace.pace === "ahead" && pace.soldOutAt
      ? formatDayMonth(pace.soldOutAt, timezone, locale)
      : null;
  return (
    <div className={className}>
      {/* refonte A3 (maquettes UIUX/) : « 312 sur 400 » en 13 px, le rythme en 12,5 px, 5 px au-dessus de la jauge */}
      {/* sur une colonne étroite (téléphone), le rythme passe sous les ventes au lieu de couper les mots */}
      <p className="mb-[5px] flex flex-wrap justify-between gap-x-3 text-[13px] tabular-nums">
        <span className="whitespace-nowrap">
          {t("soldOf", { sold, capacity })}
        </span>
        {word ? (
          <span className={cn("text-[12.5px] whitespace-nowrap", tone)}>
            {word}
          </span>
        ) : null}
      </p>
      <Gauge
        ratio={pace.soldRatio ?? 0}
        tone={
          pace.pace === "soldOut"
            ? "success"
            : pace.pace === "behind"
              ? "warning"
              : "ink"
        }
        marker={showMarker ? pace.elapsedRatio! : null}
        label={t("label", { sold, capacity, pace: word ?? "" })}
      />
      {soldOut ? (
        <p className="mt-1 text-[12.5px] text-success">
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
  draft = false,
  className,
}: {
  date: Date;
  timezone: string;
  locale: Locale;
  /** Brouillon : la feuille en pointillé, comme sur les maquettes. */
  draft?: boolean;
  className?: string;
}) {
  const { day, month } = formatDayMonth(date, timezone, locale);
  // refonte A3 (maquettes UIUX/, « .leaf », tel que la maquette s'affiche) : 44 px, filet de 1 px (pointillé pour un
  // brouillon), arrondi 8 px ; le mois en 12,5 px demi-gras gris sur un rose très pâle, le jour en Archivo Black 19 px
  // graissé (la maquette demande du demi-gras sur cette police à une seule graisse : le navigateur l'épaissit)
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block w-11 shrink-0 overflow-hidden rounded-[8px] border border-line-strong bg-surface-raised text-center",
        draft && "border-dashed",
        className,
      )}
    >
      <small
        className={cn(
          "block border-b border-line pt-[5px] pb-[3px] text-[12.5px] leading-none font-semibold text-ink-muted",
          draft ? "bg-surface-soft" : "bg-leaf-head",
        )}
      >
        {month}
      </small>
      <b className="block pt-[5px] pb-1.5 font-figures text-[19px] leading-none font-semibold tracking-[-0.04em]">
        {day}
      </b>
    </span>
  );
}
