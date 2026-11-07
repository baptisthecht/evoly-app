"use client";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/forms";
import { Field, Select } from "@/components/ui/Field";
import { saveFeaturedAction } from "./actions";

type Mode = "NONE" | "NEXT" | "CHOSEN";

/** Vitrine de l'organisateur : l'événement mis en avant en tête de sa page publique. */
export function FeaturedForm({
  orgSlug,
  readOnly,
  mode,
  eventId,
  fallback,
  events,
}: {
  orgSlug: string;
  readOnly: boolean;
  mode: Mode;
  eventId: string | null;
  fallback: boolean;
  events: { id: string; title: string; startsAt: string; timezone: string }[];
}) {
  const t = useTranslations("orgSettings");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    saveFeaturedAction.bind(null, orgSlug),
    null,
  );
  const [choice, setChoice] = useState<Mode>(mode);
  const date = (e: { startsAt: string; timezone: string }) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: e.timezone,
    }).format(new Date(e.startsAt));
  return (
    <form action={action}>
      <fieldset disabled={readOnly} className="grid gap-4">
        <legend className="sr-only">{t("featuredTitle")}</legend>
        <div className="grid gap-2">
          {(["NEXT", "CHOSEN", "NONE"] as const).map((m) => (
            <label
              key={m}
              // refonte A3 : un choix en carte, comme le plan de salle et le style de la billetterie
              className="flex cursor-pointer items-start gap-3 rounded-[var(--r-card)] border border-line-strong bg-surface-raised px-3.5 py-3 hover:bg-surface-hover has-[:checked]:border-ink-strong has-[:checked]:bg-surface-raised has-[:checked]:shadow-[inset_0_0_0_0.5px_var(--ink-strong)]"
            >
              <input
                type="radio"
                name="mode"
                value={m}
                checked={choice === m}
                onChange={() => setChoice(m)}
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">{t(`featured_${m}`)}</span>
                <span className="text-[12.5px] text-ink-muted">
                  {t(`featured_${m}_hint`)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {choice === "CHOSEN" ? (
          events.length ? (
            <Field label={t("featuredEvent")} htmlFor="featured-event">
              <Select
                id="featured-event"
                name="eventId"
                defaultValue={
                  events.some((e) => e.id === eventId)
                    ? eventId!
                    : events[0]!.id
                }
              >
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({date(e)})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-ink-muted">{t("featuredNoEvents")}</p>
          )
        ) : null}
        {fallback && choice === "CHOSEN" ? (
          <p
            role="status"
            className="rounded-[8px] bg-surface-soft px-3 py-2.5 text-[13px]"
          >
            {t("featuredFallback")}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>{t("featuredSave")}</SubmitButton>
          {state?.ok ? (
            <p role="status" className="text-sm text-ink-muted">
              {t("featuredSaved")}
            </p>
          ) : null}
        </div>
        <FormError state={state} />
      </fieldset>
    </form>
  );
}
