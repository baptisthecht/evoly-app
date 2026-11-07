"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { lookupTicketsAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";

export function LookupForm({ sub }: { sub: string }) {
  const t = useTranslations("orders");
  const field = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  if (sent)
    return (
      <p
        role="status"
        className="rounded-md bg-success-soft px-4 py-3 text-success"
      >
        {t("lookupSent")}
      </p>
    );
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        // adresse lue dans le champ, jamais dans un état de React : saisie ou remplie automatiquement avant que la page
        // soit active (téléphone lent), elle n'y était pas encore, et l'envoi partait vide (« Adresse e-mail invalide »)
        const email = field.current?.value ?? "";
        setBusy(true);
        const res = await lookupTicketsAction(sub, email);
        setBusy(false);
        if (!res.ok) return setInvalid(true);
        setSent(true);
      }}
    >
      <Field
        label={t("lookupEmail")}
        htmlFor="lookup-email"
        error={invalid ? t("lookupInvalid") : null}
      >
        <Input
          ref={field}
          id="lookup-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        variant="dark"
        disabled={busy}
        className="w-full sm:w-auto sm:justify-self-start"
      >
        {t("lookupSubmit")}
      </Button>
    </form>
  );
}
