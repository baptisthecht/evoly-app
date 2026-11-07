import { cn } from "./cn";

/**
 * La jauge seule (« .gauge ») : 6 px, fond beige clair, remplissage charbon (orange s'il manque du rythme, vert au complet) ;
 * le trait rose du rythme dépasse de 4 px de chaque côté, détouré de blanc.
 */
export function Gauge({
  ratio,
  tone = "ink",
  marker = null,
  label,
}: {
  ratio: number;
  tone?: "ink" | "warning" | "success";
  marker?: number | null;
  label?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="relative block h-1.5 rounded-full bg-track"
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          tone === "success"
            ? "bg-success"
            : tone === "warning"
              ? "bg-warning"
              : "bg-ink-strong",
        )}
        style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%` }}
      />
      {marker != null ? (
        <span
          className="absolute -inset-y-1 w-0.5 rounded-[2px] bg-highlight shadow-[0_0_0_2px_var(--surface-raised)]"
          style={{ left: `${marker * 100}%` }}
        />
      ) : null}
    </span>
  );
}
