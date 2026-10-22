import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { CheckIcon } from "./icons";
import { FIELD_ICON_CLASS, FieldIcon, type FieldIconName } from "./fieldIcons";

const control =
  "block w-full h-[var(--field-h)] rounded-md bg-surface-raised px-4 text-[length:var(--field-text)] text-ink placeholder:text-ink-subtle " +
  "shadow-[inset_0_0_0_var(--control-border)_var(--line-strong)] outline-none transition-shadow focus:shadow-[var(--field-focus)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--color-danger)]";
/** Style commun des champs, repris par les listes sur mesure (choix des polices). */
export const FIELD_CONTROL_CLASS = control;

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  done,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  /** Champ obligatoire : astérisque rose (le champ porte aussi l'attribut required, lu par les lecteurs d'écran). */
  required?: boolean;
  /** Champ obligatoire rempli : coche verte. */
  done?: boolean;
  /** Mention à droite du libellé d'un champ facultatif (« facultatif »). */
  optional?: string;
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
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="font-[family-name:var(--label-family)] text-[length:var(--label-size)] [font-weight:var(--label-weight)] text-ink">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-1 text-[var(--required)]">
              *
            </span>
          ) : null}
        </label>
        {optional ? <span className="text-xs text-ink-muted">{optional}</span> : null}
        {done ? <CheckIcon className="size-4 shrink-0 text-success" strokeWidth={2.6} /> : null}
      </div>
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

export function Input({
  className,
  invalid,
  icon,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; ref?: Ref<HTMLInputElement>; icon?: FieldIconName }) {
  if (!icon) return <input className={cn(control, className)} aria-invalid={invalid || undefined} {...rest} />;
  // icône à gauche ; dates : le calendrier du navigateur couvre tout le champ (globals.css, .has-icon)
  return (
    <div className="relative">
      <FieldIcon name={icon} className={cn(FIELD_ICON_CLASS, "top-1/2 -translate-y-1/2")} />
      <input className={cn(control, "has-icon relative pl-10", className)} aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
}

export function Select({ className, children, icon, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { icon?: FieldIconName }) {
  const select = (
    <select className={cn(control, "appearance-none bg-[length:12px] bg-[right_16px_center] bg-no-repeat pr-10", icon && "pl-10", className)} {...rest}>
      {children}
    </select>
  );
  if (!icon) return select;
  return (
    <div className="relative">
      <FieldIcon name={icon} className={cn(FIELD_ICON_CLASS, "top-1/2 -translate-y-1/2")} />
      {select}
    </div>
  );
}
