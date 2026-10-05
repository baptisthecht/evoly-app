import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-lg bg-surface-raised p-5 shadow-sm ring-1 ring-line sm:p-6", className)}>{children}</section>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "dark"; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-sunken text-ink",
    accent: "bg-accent text-accent-ink",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    dark: "bg-surface-inverse text-ink-inverse",
  } as const;
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 font-label text-[0.72rem] font-bold", tones[tone])}>{children}</span>;
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
    <div role="status" className={cn("flex flex-col gap-3 rounded-lg p-4 ring-1 sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div className="grid gap-0.5">
        <p className="font-semibold">{title}</p>
        {children ? <div className="text-sm text-ink-muted">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-lg border-[1.5px] border-dashed border-line-strong p-6 sm:p-8">
      <p className="font-display text-xl tracking-[var(--tracking-title)]">{title}</p>
      {children ? <div className="max-w-prose text-ink-muted">{children}</div> : null}
      {action}
    </div>
  );
}
