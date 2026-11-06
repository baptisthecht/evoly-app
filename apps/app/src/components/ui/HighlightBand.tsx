import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Bandeau de mise en avant (refonte A3, docs/INTERFACE.md) : fond rose pâle et trait rose à gauche. Le trait est un
 * rectangle découpé par l'arrondi du bandeau (arrondi à gauche, droit à droite), jamais une bordure.
 */
export function HighlightBand({
  className,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      {...rest}
      className={cn(
        "relative grid gap-5 overflow-hidden rounded-lg bg-highlight-soft py-4 pr-5 pl-[calc(var(--highlight-bar)+1.4rem)]",
        "before:absolute before:inset-y-0 before:left-0 before:w-[var(--highlight-bar)] before:bg-highlight",
        className,
      )}
    />
  );
}
