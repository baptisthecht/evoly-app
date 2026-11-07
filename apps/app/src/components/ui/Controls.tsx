import Link from "next/link";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Petites pièces des maquettes de la refonte A3 (UIUX/pages-a3.html), une forme chacune, partout la même.
 */

/** Cadre des champs d'outils (« .field ») : 34 px, arrondi 8 px, filet clair, focus charbon avec un halo rose pâle. */
export const toolFieldClass =
  "flex h-[34px] items-center gap-2 rounded-[8px] border border-line-strong bg-surface-raised px-[11px] text-[13.5px] text-ink-muted whitespace-nowrap focus-within:border-ink-strong focus-within:shadow-[0_0_0_3px_var(--focus-halo)]";

/** Champ de recherche d'une barre d'outils : la loupe, puis le texte (16 px sur téléphone, sinon Safari zoome). */
export function SearchField({
  label,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn(toolFieldClass, className)}>
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="size-[15px] shrink-0"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      {/* l'invite en simple texte, centré par le cadre comme dans la maquette (« .field ») : le texte d'un champ de saisie
          tombe un pixel plus bas ou plus haut selon la position du champ ; le champ, transparent, reste par-dessus pour
          la saisie, et l'invite disparaît dès qu'on écrit */}
      <span className="relative flex min-w-0 flex-1 items-center self-stretch">
        <input
          type="search"
          {...input}
          className="peer absolute inset-0 h-full w-full min-w-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-transparent lg:text-[13.5px] [&::-webkit-search-cancel-button]:hidden"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none invisible truncate text-[16px] text-ink-muted peer-placeholder-shown:visible lg:text-[13.5px]"
        >
          {input.placeholder}
        </span>
      </span>
    </label>
  );
}

/** Interrupteur et son libellé (« .swrow ») : 34 × 20 px (globals.css), le libellé en 14 px, l'explication en 12,5 px. */
export function SwitchRow({
  label,
  hint,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input type="checkbox" role="switch" {...input} />
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        {/* comme la maquette : l'explication en ligne, dans une ligne de 14 px (la hauteur de la rangée en dépend) */}
        {hint ? (
          <small className="text-[12.5px] text-ink-muted">{hint}</small>
        ) : null}
      </span>
    </label>
  );
}

/** Phrase d'exemple qui suit la saisie (« .example ») : fond gris très clair, 13 px. */
export function ExampleNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-[8px] bg-surface-soft px-3 py-2.5 text-[13px] text-ink-body",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Section d'un formulaire de réglages (« .setrow ») : le titre et l'explication à gauche, les champs à droite. */
export function SettingsRow({
  title,
  description,
  children,
  className,
  fieldset = false,
  hidden,
  wide = false,
  disabled,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Un groupe de champs : fieldset, le titre en légende pour les lecteurs d'écran. */
  fieldset?: boolean;
  hidden?: boolean;
  /** Contenu sans largeur maximale (un éditeur avec son aperçu), au lieu des 560 px des champs. */
  wide?: boolean;
  /** Groupe de champs désactivé (lecture seule). */
  disabled?: boolean;
}) {
  const Tag = fieldset ? "fieldset" : "section";
  // une section nommée par son titre (région pour les lecteurs d'écran) ; un groupe de champs, par sa légende
  const id = useId();
  return (
    <Tag
      hidden={hidden}
      disabled={fieldset ? disabled : undefined}
      aria-labelledby={fieldset ? undefined : `${id}-title`}
      className={cn(
        "grid gap-4 border-b border-line py-5 last:border-b-0 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8",
        className,
      )}
    >
      {fieldset ? <legend className="sr-only">{title}</legend> : null}
      <div aria-hidden={fieldset || undefined}>
        <h3
          id={`${id}-title`}
          className="mb-1 text-[14.5px] leading-[normal] font-semibold"
        >
          {title}
        </h3>
        {description ? (
          <p className="text-[13px] text-ink-muted">{description}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "grid min-w-0 content-start gap-3.5",
          !wide && "max-w-[560px]",
        )}
      >
        {children}
      </div>
    </Tag>
  );
}

/** Choix segmenté (« .seg » des maquettes, boutons radio) : le cadre gris et l'option choisie sur blanc, en demi-gras. */
export const segClass =
  "inline-flex gap-0.5 rounded-[9px] bg-surface-sunken p-[3px]";
export const segItemClass =
  "cursor-pointer rounded-[7px] px-3 py-[5px] text-[13px] whitespace-nowrap text-ink-soft hover:text-ink " +
  "has-[:checked]:bg-surface-raised has-[:checked]:font-semibold has-[:checked]:text-ink-strong has-[:checked]:shadow-[0_1px_2px_rgba(0,0,0,0.08)] " +
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--focus-ring)]";

/** Choix en carte (boutons radio) : filet de 1 px, charbon quand il est choisi, arrondi 10 px (refonte A3). */
export function choiceCardClass(selected: boolean) {
  return cn(
    "grid cursor-pointer content-start gap-1 rounded-[var(--r-card)] border bg-surface-raised px-3.5 py-3",
    selected
      ? "border-ink-strong shadow-[inset_0_0_0_0.5px_var(--ink-strong)]"
      : "border-line-strong hover:bg-surface-hover",
  );
}

/** État d'un formulaire enregistré tout seul (« .saved ») : la coche et « Enregistré », en vert. */
export function SavedNote({
  children,
  id,
}: {
  children: ReactNode;
  /** Annonce de l'état (role="status"), quand la note est l'état d'un formulaire. */
  id?: string;
}) {
  return (
    <span
      id={id}
      role={id ? "status" : undefined}
      className="inline-flex items-center gap-1.5 text-[13px] text-success"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="size-[15px] shrink-0"
      >
        <path d="m5 12 5 5 9-10" />
      </svg>
      {children}
    </span>
  );
}

/** Titre d'une partie de page (« .sec ») : 14,5 px demi-gras, un lien gris à droite, sur la ligne de base. */
export function SectionTitle({
  title,
  id,
  link,
  className,
}: {
  title: ReactNode;
  id?: string;
  link?: { href: string; label: ReactNode };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-1.5 flex items-baseline justify-between gap-3",
        className,
      )}
    >
      <h2 id={id} className="text-[14.5px] leading-[normal] font-semibold">
        {title}
      </h2>
      {link ? (
        <Link
          href={link.href}
          className="text-[13px] text-ink-muted hover:text-ink"
        >
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}
