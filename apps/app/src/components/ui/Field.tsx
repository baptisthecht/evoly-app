import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "./cn";

const control =
  "block w-full h-12 rounded-md bg-surface-raised px-4 text-base text-ink placeholder:text-ink-subtle " +
  "shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none transition-shadow focus:shadow-[inset_0_0_0_2px_var(--ink),0_0_0_4px_color-mix(in_srgb,var(--focus-halo)_70%,transparent)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--color-danger)]";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  // un seul champ : marqué invalide en cas d'erreur et relié à son message d'erreur ou à son aide, pour les lecteurs d'écran
  // et pour la bordure rouge (sauf si l'écran l'a déjà précisé) ; plusieurs éléments : laissés tels quels
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const only =
    Children.count(children) === 1 && isValidElement(children) && children.type !== Fragment ? (children as ReactElement<Record<string, unknown>>) : null;
  const control = only
    ? cloneElement(only, {
        ...(error && only.props["aria-invalid"] === undefined && only.props.invalid === undefined ? { "aria-invalid": true } : {}),
        ...(describedBy ? { "aria-describedby": [only.props["aria-describedby"], describedBy].filter(Boolean).join(" ") } : {}),
      })
    : children;
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={htmlFor} className="font-label text-[0.8rem] font-bold text-ink">
        {label}
      </label>
      {control}
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
