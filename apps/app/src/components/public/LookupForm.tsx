"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { lookupTicketsAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { Button } from "../ui/Button";
import { Field, Input } from "../ui/Field";

export function LookupForm({ sub }: { sub: string }) {
  const t = useTranslations("orders");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  if (sent)
    return (
      <p role="status" className="rounded-md bg-success-soft px-4 py-3 text-success">
        {t("lookupSent")}
      </p>
    );
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await lookupTicketsAction(sub, email);
        setBusy(false);
        if (!res.ok) return setInvalid(true);
        setSent(true);
      }}
    >
      <Field label={t("lookupEmail")} htmlFor="lookup-email" error={invalid ? t("lookupInvalid") : null}>
        <Input id="lookup-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" variant="dark" disabled={busy} className="w-full sm:w-auto sm:justify-self-start">
        {t("lookupSubmit")}
      </Button>
    </form>
  );
}
