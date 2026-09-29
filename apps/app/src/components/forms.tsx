"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/server/guard";
import { Button } from "./ui/Button";

/**
 * Formulaire relié à une action serveur, sans la remise à zéro automatique de React 19 :
 * après une erreur, l'utilisateur garde ce qu'il a saisi. Sans JavaScript, l'envoi natif reste possible.
 */
export function useActionForm<S>(action: (state: Awaited<S>, form: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  return { state, pending, formProps: { action: dispatch, onSubmit } };
}

/** Bouton d'envoi qui se désactive pendant le traitement. */
export function SubmitButton({ children, pendingLabel, variant = "dark", className, pending: forced }: { children: ReactNode; pendingLabel?: string; variant?: "primary" | "dark" | "secondary" | "ghost" | "danger"; className?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = forced ?? status.pending;
  const t = useTranslations("common");
  return (
    <Button type="submit" size="lg" variant={variant} disabled={pending} aria-busy={pending} className={className ?? "w-full"}>
      {pending ? (pendingLabel ?? t("loading")) : children}
    </Button>
  );
}

/** Message d'erreur global d'un formulaire, traduit depuis le code renvoyé par l'action. */
export function FormError({ state }: { state: ActionState }) {
  const t = useTranslations("formErrors");
  if (!state || state.ok || state.error === "INVALID_INPUT") return null;
  const key = t.has(state.error) ? state.error : "generic";
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
      {t(key)}
    </p>
  );
}

/** Traduit l'erreur d'un champ renvoyée par Zod (clé « validation.… »). */
export function useFieldError(state: ActionState) {
  const t = useTranslations();
  return (name: string): string | null => {
    if (!state || state.ok || !state.fields?.[name]) return null;
    const key = state.fields[name]!;
    return t.has(key) ? t(key) : t("validation.invalid");
  };
}
