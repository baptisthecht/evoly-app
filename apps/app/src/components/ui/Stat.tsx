import type { ReactNode } from "react";
import { cn } from "./cn";

/** Un indicateur (refonte A3, docs/INTERFACE.md) : libellé gris, grand chiffre en Archivo Black, sans carte. */
export function Stat({
  label,
  value,
  sub,
  subTone = "muted",
  className,
}: {
  label: string;
  value: string | number;
  /** Une ligne sous le chiffre : l'évolution (en vert si elle monte) ou un complément. */
  sub?: ReactNode;
  subTone?: "success" | "muted";
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1", className)}>
      <p className="text-[0.8125rem] whitespace-nowrap text-ink-muted">
        {label}
      </p>
      <p className="font-figures text-[1.6875rem] leading-tight tracking-[var(--tracking-figures)] whitespace-nowrap tabular-nums">
        {value}
      </p>
      {sub ? (
        <p
          className={cn(
            "text-[0.8125rem] whitespace-nowrap tabular-nums",
            subTone === "success" ? "text-success" : "text-ink-muted",
          )}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** La rangée d'indicateurs : séparés par des filets verticaux sur ordinateur, un filet dessous. */
export const statRow =
  "grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line pb-5 sm:grid-cols-3 lg:flex lg:gap-0 lg:divide-x lg:divide-line lg:[&>*]:px-9 lg:[&>*:first-child]:pl-0";
