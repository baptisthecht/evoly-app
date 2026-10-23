"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { joinWaitlistAction } from "@/app/site/[sub]/[eventSlug]/actions";
import { Button } from "@/components/ui/Button";

/** Inscription à la liste d'attente d'un tarif complet (section 9.30). */
export function WaitlistJoin({
  eventId,
  ticketTypeId,
  name,
  max,
}: {
  eventId: string;
  ticketTypeId: string;
  name: string;
  max: number;
}) {
  const t = useTranslations("public");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<"ok" | string | null>(null);
  if (result === "ok") {
    return (
      <p role="status" className="basis-full text-sm font-semibold">
        {t("waitlistJoined")}
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        className="font-semibold underline underline-offset-4"
        onClick={() => setOpen(true)}
      >
        {t("waitlistJoin")}
      </button>
    );
  }
  const id = `attente-${ticketTypeId}`;
  return (
    <form
      className="grid basis-full gap-2 rounded-md bg-surface-sunken p-3"
      aria-label={t("waitlistJoinFor", { name })}
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await joinWaitlistAction(
          eventId,
          ticketTypeId,
          email,
          quantity,
          consent,
        );
        setPending(false);
        setResult(r.ok ? "ok" : r.error);
      }}
    >
      <label className="grid gap-1" htmlFor={`${id}-email`}>
        <span>{t("waitlistEmail")}</span>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-md bg-surface-raised px-3 ring-1 ring-line-strong"
        />
      </label>
      {max > 1 ? (
        <label className="grid gap-1" htmlFor={`${id}-qty`}>
          <span>{t("waitlistQuantity")}</span>
          <select
            id={`${id}-qty`}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="h-11 rounded-md bg-surface-raised px-3 ring-1 ring-line-strong"
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>{t("waitlistConsent")}</span>
      </label>
      {result ? (
        <p role="alert" className="text-danger">
          {result === "WAITLIST_NOT_SOLD_OUT"
            ? t("waitlistErrorNotSoldOut")
            : t("waitlistError")}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" variant="dark" disabled={pending}>
          {t("waitlistSubmit")}
        </Button>
      </div>
    </form>
  );
}
