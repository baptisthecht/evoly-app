import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        // refonte A3 (maquettes UIUX/) : dans l'espace organisateur, plus de cadre ; la partie se sépare de la suivante
        // par un filet (globals.css, « .evoly-card »). Ailleurs (création de compte), le cadre reste.
        "evoly-card rounded-lg bg-surface-raised p-5 ring-1 ring-line sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "dark"
  | "info"
  | "lilas";

/**
 * Pastille (refonte A3, maquettes UIUX/) : 12 px, arrondi 6 px, fond pâle du ton. Un statut porte un point de la couleur
 * du texte (dot) ; une simple étiquette (canal, « Terminé ») n'en a pas. « live » marque un état en cours par le même
 * point, sans pulsation (pas de mouvement qui ne répond à aucune action).
 */
export function Badge({
  tone = "neutral",
  dot = false,
  live = false,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  live?: boolean;
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-sunken text-ink-soft",
    accent: "bg-accent text-accent-ink",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    dark: "bg-surface-inverse text-ink-inverse",
    info: "bg-info-soft text-info",
    lilas: "bg-surface-sunken text-ink-soft", // refonte A3 : plus de lilas dans l'app, ton neutre
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {dot || live ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}

export function Banner({
  tone = "warning",
  title,
  children,
  action,
}: {
  tone?: "warning" | "info" | "danger" | "success";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  // refonte A3 : un bandeau de couleur douce, sans filet, arrondi 10 px (comme l'avis des remboursements à traiter)
  const tones = {
    warning: "bg-warning-soft",
    info: "bg-info-soft",
    danger: "bg-danger-soft",
    success: "bg-success-soft",
  } as const;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-[10px] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between",
        tones[tone],
      )}
    >
      <div className="grid gap-0.5">
        <p className="font-medium">{title}</p>
        {children ? (
          <div className="text-[13px] text-ink-body">{children}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * État vide (refonte A3) : comme le tableau vide des maquettes, le titre en 15 px demi-gras et l'explication en 13 px
 * grise, centrés entre deux filets.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2 border-y border-line px-6 py-14 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {children ? (
        <div className="max-w-md text-[13px] text-ink-muted">{children}</div>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
