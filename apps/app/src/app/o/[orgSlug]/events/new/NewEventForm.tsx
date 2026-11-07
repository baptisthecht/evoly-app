"use client";

import { SettingsRow } from "@/components/ui/Controls";
import type { FeeTerms } from "@evoly/core";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  EventFields,
  type PartnerVenueOption,
} from "@/components/events/EventFields";
import {
  FormError,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/forms";
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
  venue,
}: {
  orgSlug: string;
  timezone: string;
  country: string;
  defaultStart: string;
  currencySymbol: string;
  terms: FeeTerms;
  venue?: PartnerVenueOption | null;
}) {
  const [price, setPrice] = useState("0");
  const t = useTranslations("events");
  const { state, pending, formProps } = useActionForm(
    createEventAction.bind(null, orgSlug),
    null,
  );
  const error = useFieldError(state);
  return (
    // refonte A3 (maquette « Réglages de l'événement ») : les rangées de l'événement, puis celle du premier tarif
    <form {...formProps} className="grid" noValidate>
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
          atVenue: true, // section 9.32 : la salle du lieu partenaire proposée d'office
        }}
        error={error}
        venue={venue}
      />
      <SettingsRow
        fieldset
        title={t("sectionTickets")}
        description={t("firstTicketHint")}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field
            label={t("ticketName")}
            htmlFor="ticketName"
            error={error("ticketName")}
          >
            <Input
              id="ticketName"
              name="ticketName"
              defaultValue={t("ticketNameDefault")}
              maxLength={60}
              required
            />
          </Field>
          <Field
            label={t("ticketQuantity")}
            htmlFor="ticketQuantity"
            hint={t("unlimitedHint")}
            error={error("ticketQuantity")}
          >
            <Input
              id="ticketQuantity"
              name="ticketQuantity"
              type="number"
              min={1}
              inputMode="numeric"
            />
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
      </SettingsRow>
      <div className="pt-5 lg:pl-[282px]">
        <SubmitButton pending={pending}>{t("createDraft")}</SubmitButton>
      </div>
    </form>
  );
}
