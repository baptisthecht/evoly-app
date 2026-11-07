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

// refonte A3 (maquettes UIUX/, « .inp ») : dans l'espace organisateur, 40 px, arrondi 8 px, 12 px de marge, 14 px
const look =
  "w-full rounded-[var(--field-radius)] bg-surface-raised px-[var(--field-px)] text-[length:var(--field-text)] text-ink placeholder:text-[var(--placeholder)] " +
  "border-[length:var(--field-border)] border-line-strong shadow-[inset_0_0_0_var(--field-ring)_var(--line-strong)] outline-none transition-shadow focus:border-ink-strong focus:shadow-[var(--field-focus)] " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[inset_0_0_0_var(--field-ring-invalid)_var(--color-danger)]";
const control = `block h-[var(--field-h)] ${look}`;
/** Style commun des champs, repris par les listes sur mesure (choix des polices). */
export const FIELD_CONTROL_CLASS = control;
/** Zone de texte, du même dessin que les champs : hauteur libre, 10 px de marge en haut et en bas. */
export const TEXTAREA_CLASS = `block py-2.5 leading-[1.45] ${look}`;

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
  const describedBy = error
    ? `${htmlFor}-error`
    : hint
      ? `${htmlFor}-hint`
      : undefined;
  const only =
    Children.count(children) === 1 &&
    isValidElement(children) &&
    children.type !== Fragment
      ? (children as ReactElement<Record<string, unknown>>)
      : null;
  const control = only
    ? cloneElement(only, {
        ...(error &&
        only.props["aria-invalid"] === undefined &&
        only.props.invalid === undefined
          ? { "aria-invalid": true }
          : {}),
        ...(describedBy
          ? {
              "aria-describedby": [only.props["aria-describedby"], describedBy]
                .filter(Boolean)
                .join(" "),
            }
          : {}),
      })
    : children;
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="font-[family-name:var(--label-family)] text-[length:var(--label-size)] [font-weight:var(--label-weight)] text-ink"
        >
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-1 text-[var(--required)]">
              *
            </span>
          ) : null}
        </label>
        {optional ? (
          <span className="text-xs text-ink-muted">{optional}</span>
        ) : null}
        {done ? (
          <CheckIcon
            className="size-4 shrink-0 text-success"
            strokeWidth={2.6}
          />
        ) : null}
      </div>
      {control}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="-mt-px text-[length:var(--hint-size)] text-danger"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${htmlFor}-hint`}
          className="-mt-px text-[length:var(--hint-size)] text-ink-muted"
        >
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
}: InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
  icon?: FieldIconName;
}) {
  if (!icon)
    return (
      <input
        className={cn(control, className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  // icône à gauche ; dates : le calendrier du navigateur couvre tout le champ (globals.css, .has-icon)
  return (
    <div className="relative">
      <FieldIcon
        name={icon}
        className={cn(FIELD_ICON_CLASS, "top-1/2 -translate-y-1/2")}
      />
      <input
        className={cn(
          control,
          "has-icon with-field-icon relative pl-10",
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  );
}

export function Select({
  className,
  children,
  icon,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: FieldIconName }) {
  const select = (
    <select
      className={cn(
        control,
        "appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-10",
        icon && "with-field-icon pl-10",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
  if (!icon) return select;
  return (
    <div className="relative">
      <FieldIcon
        name={icon}
        className={cn(FIELD_ICON_CLASS, "top-1/2 -translate-y-1/2")}
      />
      {select}
    </div>
  );
}
