"use client";

import {
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useState,
} from "react";
import { toolFieldClass } from "./Controls";
import { cn } from "./cn";

/**
 * Filtre d'une barre d'outils (refonte A3, maquettes UIUX/) : « Événement : Tous » et un chevron, dans le cadre des champs
 * d'outils. La vraie liste du navigateur, invisible, couvre le cadre : un clic l'ouvre, le clavier y entre ; autoSubmit
 * envoie le formulaire au changement.
 */
export function FilterSelect({
  prefix,
  valueLabel,
  autoSubmit = false,
  variant = "field",
  className,
  onChange,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  /** « Événement : » (deux-points selon la langue) ; sans préfixe, la valeur seule. */
  prefix?: string;
  /**
   * field : le cadre des champs d'outils (34 px, « Événement : Tous ») ; inline : la liste compacte de la maquette (« .sel2 »,
   * 32 px, la valeur seule en noir, le chevron gris de 14 px).
   */
  variant?: "field" | "inline";
  /** Texte de l'option choisie au premier affichage. */
  valueLabel: string;
  autoSubmit?: boolean;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(valueLabel);
  useEffect(() => setShown(valueLabel), [valueLabel]);
  const change = (e: ChangeEvent<HTMLSelectElement>) => {
    setShown(e.target.selectedOptions[0]?.text ?? "");
    onChange?.(e);
    if (autoSubmit) e.currentTarget.form?.requestSubmit();
  };
  const inline = variant === "inline";
  return (
    <label
      className={cn(
        inline
          ? "relative inline-flex h-8 items-center gap-2 rounded-[8px] border border-line-strong bg-surface-raised px-2.5 text-[13.5px] whitespace-nowrap text-ink focus-within:border-ink-strong focus-within:shadow-[0_0_0_3px_var(--focus-halo)]"
          : cn(toolFieldClass, "relative shrink-0"),
        className,
      )}
    >
      {/* comme la maquette : le libellé et la valeur sont deux éléments, séparés par l'écart du cadre (8 px) */}
      {prefix ? <span>{prefix}</span> : null}
      {inline ? (
        <span>{shown}</span>
      ) : (
        <b className="font-medium text-ink-strong">{shown}</b>
      )}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={
          inline ? "size-3.5 shrink-0 text-ink-muted" : "size-[15px] shrink-0"
        }
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        {...rest}
        onChange={change}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        {children}
      </select>
    </label>
  );
}
