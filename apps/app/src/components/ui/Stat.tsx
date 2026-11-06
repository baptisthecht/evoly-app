import { cn } from "./cn";

/** Un indicateur (refonte A3, docs/INTERFACE.md) : libellé gris, grand chiffre en Archivo Black, sans carte. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
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
    </div>
  );
}

/** La rangée d'indicateurs : séparés par des filets verticaux sur ordinateur, un filet dessous. */
export const statRow =
  "grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line pb-5 sm:grid-cols-3 lg:flex lg:gap-0 lg:divide-x lg:divide-line lg:[&>*]:px-9 lg:[&>*:first-child]:pl-0";
