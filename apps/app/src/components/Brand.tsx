import { LOGO_PATHS, LOGO_VIEWBOX, O_PATH, O_VIEWBOX } from "@evoly/ui";

export function Logo({ className, title = "Evoly" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} role="img" aria-label={title}>
      <g fill="currentColor">
        {LOGO_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** Le O perforé du logo, en motif décoratif. */
export function OMark({ className }: { className?: string }) {
  return (
    <svg viewBox={O_VIEWBOX} className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" d={O_PATH} />
    </svg>
  );
}
