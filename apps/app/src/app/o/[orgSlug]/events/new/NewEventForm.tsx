"use client";

import type { FeeTerms } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EventFields } from "@/components/events/EventFields";
import { FormError, SubmitButton, useActionForm, useFieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui/Field";
import { createEventAction } from "../actions";
import { PriceFields } from "../[eventId]/tickets/PriceFields";

export function NewEventForm({
  orgSlug,
  timezone,
  country,
  defaultStart,
  currencySymbol,
  terms,
}: {
  orgSlug: string;
  timezone: string;
  country: string;
  defaultStart: string;
  currencySymbol: string;
  terms: FeeTerms;
}) {
  const [price, setPrice] = useState("0");
  const t = useTranslations("events");
  const { state, pending, formProps } = useActionForm(createEventAction.bind(null, orgSlug), null);
  const error = useFieldError(state);
  return (
    <form {...formProps} className="grid gap-10" noValidate>
      <FormError state={state} />
      <EventFields
        values={{
          title: "",
          summary: "",
          startsAtLocal: defaultStart,
          endsAtLocal: "",
          timezone,
          locationType: "PHYSICAL",
          locationName: "",
          addressLine1: "",
          postalCode: "",
          city: "",
          country,
          onlineUrl: "",
        }}
        error={error}
      />
      <fieldset className="grid gap-5">
        <legend className="mb-1 font-display text-xl tracking-[var(--tracking-title)]">{t("sectionTickets")}</legend>
        <p className="-mt-3 text-sm text-ink-muted">{t("firstTicketHint")}</p>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label={t("ticketName")} htmlFor="ticketName" error={error("ticketName")}>
            <Input id="ticketName" name="ticketName" defaultValue={t("ticketNameDefault")} maxLength={60} required />
          </Field>
          <Field label={t("ticketQuantity")} htmlFor="ticketQuantity" hint={t("unlimitedHint")} error={error("ticketQuantity")}>
            <Input id="ticketQuantity" name="ticketQuantity" type="number" min={1} inputMode="numeric" />
          </Field>
        </div>
        <PriceFields
          id="ticketPrice"
          name="ticketPrice"
          label={`${t("ticketPrice")} (${currencySymbol})`}
          hint={t("ticketPriceHint")}
          error={error("ticketPrice")}
          price={price}
          onPrice={setPrice}
          terms={terms}
        />
      </fieldset>
      <SubmitButton pending={pending} className="w-full sm:w-auto sm:justify-self-start">
        {t("createDraft")}
      </SubmitButton>
    </form>
  );
}
