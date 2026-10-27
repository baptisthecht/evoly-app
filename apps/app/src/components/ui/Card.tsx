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
        "rounded-lg bg-surface-raised p-5 shadow-sm ring-1 ring-line sm:p-6",
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
 * Pastille de statut. Un point de couleur (dot) la rend plus vivante ; « live » le fait pulser,
 * pour un état en cours (vente ouverte, entrées en direct), jamais si le système demande moins
 * d'animations.
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
    neutral: "bg-surface-sunken text-ink",
    accent: "bg-accent text-accent-ink",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    dark: "bg-surface-inverse text-ink-inverse",
    info: "bg-info-soft text-info",
    lilas: "bg-[var(--evoly-lilas)] text-[var(--evoly-charbon)]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-[family-name:var(--label-family)] text-[0.72rem] whitespace-nowrap [font-weight:var(--label-weight)]",
        tones[tone],
      )}
    >
      {dot || live ? (
        <span aria-hidden="true" className="relative inline-flex size-1.5">
          {live ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
          ) : null}
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
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
  const tones = {
    warning: "bg-warning-soft ring-warning/30",
    info: "bg-info-soft ring-info/30",
    danger: "bg-danger-soft ring-danger/30",
    success: "bg-success-soft ring-success/30",
  } as const;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-lg p-4 ring-1 sm:flex-row sm:items-center sm:justify-between",
        tones[tone],
      )}
    >
      <div className="grid gap-0.5">
        <p className="font-semibold">{title}</p>
        {children ? (
          <div className="text-sm text-ink-muted">{children}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

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
    <div className="grid justify-items-start gap-3 rounded-lg border-[1.5px] border-dashed border-line-strong p-6 sm:p-8">
      <p className="font-display text-xl tracking-[var(--tracking-title)]">
        {title}
      </p>
      {children ? (
        <div className="max-w-prose text-ink-muted">{children}</div>
      ) : null}
      {action}
    </div>
  );
}
