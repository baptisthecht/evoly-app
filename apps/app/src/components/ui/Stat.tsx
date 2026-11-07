import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Un indicateur (refonte A3, maquettes UIUX/, « .stat ») : libellé gris en 13 px, grand chiffre en Archivo Black 27 px,
 * puis une ligne en 12,5 px (l'évolution en vert, ou un complément en gris). Sans carte.
 */
export function Stat({
  label,
  value,
  sub,
  subTone = "muted",
  valueTone,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Une ligne sous le chiffre : l'évolution (en vert si elle monte) ou un complément. */
  sub?: ReactNode;
  subTone?: "success" | "muted";
  /** Montant retiré (rouge doux) ou net (vert), comme sur la page Finances. */
  valueTone?: "minus" | "success";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[13px] whitespace-nowrap text-ink-muted">{label}</p>
      <p
        className={cn(
          // sur téléphone (maquette « Sur téléphone ») : 22 px, sans la ligne du dessous
          "mt-0.5 font-figures text-[22px] leading-[1.15] tracking-[var(--tracking-figures)] whitespace-nowrap tabular-nums sm:text-[27px]",
          valueTone === "minus" && "text-minus",
          valueTone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {sub ? (
        <p
          className={cn(
            "text-[12.5px] whitespace-nowrap tabular-nums max-sm:hidden",
            subTone === "success" ? "text-success" : "text-ink-muted",
          )}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/**
 * La rangée d'indicateurs (« .stats ») : sur ordinateur, séparés par des filets verticaux à 36 px du texte (22 px en
 * compact, cinq indicateurs), un filet dessous ; à droite, en bas, un histogramme facultatif. Sur téléphone, en grille.
 */
export function StatRow({
  label,
  children,
  aside,
  compact = false,
  className,
}: {
  label: string;
  children: ReactNode;
  aside?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        // sur téléphone (maquette « Sur téléphone ») : deux colonnes, la seconde après un filet vertical, 14 px dessous
        "grid grid-cols-2 gap-y-4 border-b border-line pb-3.5 sm:grid-cols-3 sm:gap-x-6 sm:pb-5 lg:flex lg:gap-0",
        "max-sm:[&>[data-stat]:nth-of-type(2n)]:border-l max-sm:[&>[data-stat]:nth-of-type(2n)]:border-line max-sm:[&>[data-stat]:nth-of-type(2n)]:pl-4",
        compact
          ? "lg:[&>[data-stat]]:mr-[22px] lg:[&>[data-stat]]:pr-[22px]"
          : "lg:[&>[data-stat]]:mr-9 lg:[&>[data-stat]]:pr-9",
        "lg:[&>[data-stat]:not(:last-of-type)]:border-r lg:[&>[data-stat]:not(:last-of-type)]:border-line",
        className,
      )}
    >
      {children}
      {/* un autre élément que les indicateurs (div) : le dernier indicateur, sans filet, reste « last-of-type » */}
      {aside ? (
        <span className="hidden shrink-0 lg:ml-auto lg:block lg:self-end">
          {aside}
        </span>
      ) : null}
    </section>
  );
}

/** Un indicateur dans une rangée : à envelopper pour les filets (data-stat). */
export function StatCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-stat="" className={className}>
      {children}
    </div>
  );
}
