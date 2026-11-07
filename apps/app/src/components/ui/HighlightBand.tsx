import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Bandeau de mise en avant (refonte A3, maquettes UIUX/, « .band ») : fond rose pâle, arrondi 12 px, 18 px de marge (30 px
 * à gauche, après le trait). Le trait de 7 px est un rectangle découpé par l'arrondi du bandeau (arrondi à gauche, droit à
 * droite), jamais une bordure. La grille (colonnes, 28 px entre elles) est donnée par la page.
 */
export function HighlightBand({
  className,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      {...rest}
      className={cn(
        // sur téléphone (maquette « Sur téléphone ») : 14 px de haut et de bas, 16 px à droite, 22 px à gauche, 10 px entre
        "relative grid items-center gap-x-7 gap-y-2.5 overflow-hidden rounded-[12px] bg-highlight-soft py-3.5 pr-4 pl-[22px] md:gap-y-3 md:py-[18px] md:pr-[22px] md:pl-[30px]",
        "before:absolute before:inset-y-0 before:left-0 before:w-[var(--highlight-bar)] before:bg-highlight",
        className,
      )}
    />
  );
}

/** Le petit titre rose du bandeau (« Prochain événement »). */
export function BandKicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12.5px] font-semibold text-highlight-ink">{children}</p>
  );
}

/** Le titre du bandeau, en 19 px demi-gras (16 px en version courte). */
export function BandTitle({
  children,
  small = false,
}: {
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <h3
      className={cn(
        "my-0.5 leading-[1.25] font-semibold tracking-[-0.01em]",
        small ? "text-[16px]" : "text-[17px] md:text-[19px]",
      )}
    >
      {children}
    </h3>
  );
}

/** La phrase grise du bandeau, en 13 px. */
export function BandText({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-ink-muted">{children}</p>;
}

/** Le compte à rebours, entre deux filets roses : le nombre en Archivo Black 40 px, la légende en 12,5 px. */
export function BandCountdown({
  value,
  caption,
}: {
  value: ReactNode;
  caption: ReactNode;
}) {
  return (
    // sur téléphone (maquette « Sur téléphone ») : le nombre en 30 px à gauche, la légende en 13 px à droite, sur la ligne
    // de base
    <div className="flex items-baseline justify-between gap-3 border-highlight-line md:block md:text-center lg:border-x lg:px-[26px]">
      <b className="block font-figures text-[30px] leading-none font-normal tracking-[-0.05em] whitespace-nowrap md:text-[40px]">
        {value}
      </b>
      <span className="text-[13px] text-ink-muted md:text-[12.5px]">
        {caption}
      </span>
    </div>
  );
}
