"use client";

import { type InputHTMLAttributes, useState } from "react";
import { Input } from "./Field";
import { cn } from "./cn";

/**
 * Date et heure (refonte A3, maquettes UIUX/) : au repos, le champ montre « 21 nov. 2026, 19:00 » dans la langue de
 * l'interface, sans l'icône du navigateur ; un clic ouvre le calendrier du navigateur et la saisie native (clavier,
 * lecteurs d'écran) reprend la main tant que le champ a le focus.
 */
export function DateTimeField({
  value: controlled,
  defaultValue,
  locale,
  className,
  placeholder,
  onFocus,
  onBlur,
  onClick,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue"> & {
  /** Valeur contrôlée ; sinon defaultValue, suivie ici (formulaires enregistrés tout seuls). */
  value?: string;
  defaultValue?: string;
  locale: string;
  /** Texte gris quand le champ est vide (« Dès la publication »). */
  placeholder?: string;
  /** Bordure rouge (erreur de saisie). */
  invalid?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [own, setOwn] = useState(defaultValue ?? "");
  const value = controlled ?? own;
  const shown = value ? formatLocal(value, locale) : (placeholder ?? "");
  return (
    <div className="relative">
      <Input
        {...rest}
        type="datetime-local"
        value={value}
        onChange={(e) => {
          if (controlled === undefined) setOwn(e.target.value);
          onChange?.(e);
        }}
        onFocus={(e) => {
          setEditing(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setEditing(false);
          onBlur?.(e);
        }}
        onClick={(e) => {
          e.currentTarget.showPicker?.();
          onClick?.(e);
        }}
        className={cn(
          "[&::-webkit-calendar-picker-indicator]:hidden",
          // au repos, jamais le « jj/mm/aaaa » du navigateur : la date mise en forme, le texte gris, ou rien
          !editing && "text-transparent",
          className,
        )}
      />
      {!editing && shown ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-[calc(var(--field-px)+var(--field-border))] flex items-center text-[length:var(--field-text)]",
            value ? "text-ink" : "text-[var(--placeholder)]",
          )}
        >
          {/* comme la maquette : « 1er » avec « er » en exposant (le premier du mois, en français) */}
          {value && locale.startsWith("fr") && /^1\s/.test(shown) ? (
            <span>
              1<sup className={SUP}>er</sup>
              {shown.slice(1)}
            </span>
          ) : (
            shown
          )}
        </span>
      ) : null}
    </div>
  );
}

/** L'exposant tel que le navigateur le dessine (la maquette n'a pas la remise à zéro de Tailwind) : il hausse la ligne. */
export const SUP =
  "[position:static] [vertical-align:super] [font-size:smaller] [line-height:inherit]";

/** « 2026-11-21T19:00 » (heure locale de l'événement) → « 21 nov. 2026, 19:00 », sans changer de fuseau. */
export function formatLocal(local: string, locale: string) {
  const [d, t = "00:00"] = local.split("T");
  const [y, m, day] = d!.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, day!, h!, min!));
  const opts = { timeZone: "UTC" } as const;
  const datePart = new Intl.DateTimeFormat(locale, {
    ...opts,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat(locale, {
    ...opts,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart}, ${timePart}`;
}
