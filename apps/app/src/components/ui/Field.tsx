import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "block w-full h-12 rounded-md bg-surface-raised px-4 text-[0.95rem] text-ink placeholder:text-ink-subtle " +
  "shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none transition-shadow focus:shadow-[inset_0_0_0_2px_var(--ink),0_0_0_4px_color-mix(in_srgb,var(--focus-halo)_70%,transparent)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--color-danger)]";

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={htmlFor} className="font-label text-[0.8rem] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(control, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "appearance-none bg-[length:12px] bg-[right_16px_center] bg-no-repeat pr-10", className)} {...rest}>
      {children}
    </select>
  );
}
