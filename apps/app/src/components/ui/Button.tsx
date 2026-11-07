import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

type Variant = "primary" | "dark" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

// evoly-btn : repère des icônes des boutons (globals.css), à la taille du thème (15 px dans l'espace organisateur)
const base =
  "evoly-btn inline-flex items-center justify-center gap-[var(--btn-gap)] rounded-[var(--control-radius)] [font-weight:var(--control-weight)] transition-[background-color,box-shadow,transform] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] select-none";

// le contour : un vrai filet dans l'espace organisateur (--btn-border, comme la maquette), une ombre intérieure sur les
// billetteries (--btn-ring, la charte)
const variants: Record<Variant, string> = {
  primary:
    "border-[length:var(--btn-border)] border-[var(--btn-primary-bg)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-ink)] hover:brightness-95", // rose sur les billetteries, charbon dans l'application
  dark: "border-[length:var(--btn-border)] border-surface-inverse bg-surface-inverse text-ink-inverse hover:opacity-90",
  secondary:
    "border-[length:var(--btn-border)] border-line-strong bg-surface-raised text-ink shadow-[inset_0_0_0_var(--btn-ring)_var(--line-strong)] hover:border-ink hover:shadow-[inset_0_0_0_var(--btn-ring)_var(--ink)]",
  ghost:
    "border-[length:var(--btn-border)] border-transparent text-ink hover:bg-surface-sunken",
  danger:
    "border-[length:var(--btn-border)] border-danger bg-danger text-blanc hover:brightness-95",
};

// refonte A3 (maquettes UIUX/) : dans l'espace organisateur, 30, 34 et 40 px de haut (jetons --btn-* du thème pro)
const sizes: Record<Size, string> = {
  sm: "h-[var(--btn-h-sm)] px-[var(--btn-px-sm)] text-[length:var(--btn-text-sm)]",
  md: "h-[var(--btn-h-md)] px-[var(--btn-px-md)] text-[length:var(--control-text-md)]",
  lg: "h-[var(--control-h-lg)] px-[var(--btn-px-lg)] text-[length:var(--control-text-lg)]",
};

export function buttonClass(
  variant: Variant = "primary",
  size: Size = "md",
  extra?: string,
) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
