"use client";

import { formatMoney, type Locale } from "@evoly/i18n";
import { useLocale, useTranslations } from "next-intl";
import { CopyButton } from "@/components/CopyButton";
import { FormError, SubmitButton, useActionForm } from "@/components/forms";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { activateVenueAction, venueHallAction, venuePayNowAction, venueThresholdAction } from "./venueActions";

type Summary = {
  code: string;
  link: string;
  thresholdEnabled: boolean;
  thresholdMinor: number;
  hall: { name: string; addressLine1: string; postalCode: string; city: string };
  balanceMinor: number;
  events: number;
  organizers: number;
  months: Array<{ month: string; tickets: number; shareMinor: number }>;
  payouts: Array<{ id: string; amountMinor: number; manual: boolean; status: string; createdAt: Date | string }>;
};

/** Lieux partenaires (section 9.32) : activation, code et lien, solde et versements, seuil ; des totaux seulement (RG-LIEU-05). */
export function VenueCard({ orgSlug, currency, venue, manage }: { orgSlug: string; currency: string; venue: Summary | null; manage: boolean }) {
  const t = useTranslations("venue");
  const locale = useLocale() as Locale;
  const money = (v: number) => formatMoney(v, currency, locale);
  const activate = useActionForm(activateVenueAction.bind(null, orgSlug), null);
  const threshold = useActionForm(venueThresholdAction.bind(null, orgSlug), null);
  const payNow = useActionForm(venuePayNowAction.bind(null, orgSlug), null);
  const hall = useActionForm(venueHallAction.bind(null, orgSlug), null);
  const title = <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("title")}</h2>;
  if (!venue)
    return (
      <Card className="grid gap-3">
        {title}
        <p className="text-sm text-ink-muted">{t("intro")}</p>
        {manage ? (
          <form {...activate.formProps} className="grid gap-2">
            <FormError state={activate.state} />
            <div>
              <SubmitButton pending={activate.pending}>{t("activate")}</SubmitButton>
            </div>
          </form>
        ) : null}
      </Card>
    );
  return (
    <Card className="grid gap-4">
      {title}
      <p className="text-sm text-ink-muted">{t("activeIntro")}</p>
      <div className="grid gap-2 text-sm">
        <p>
          <span className="font-semibold">{t("code")}</span> <code className="rounded bg-surface-sunken px-2 py-1 font-mono">{venue.code}</code>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t("link")}</span>
          <CopyButton value={venue.link} label={t("copyLink")} />
        </div>
        <p className="text-ink-muted">{t("organizers", { count: venue.organizers })}</p>
      </div>
      <div className="grid gap-2">
        <p className="text-sm">
          <span className="font-semibold">{t("balance")}</span> <span className="font-display text-xl tabular-nums">{money(venue.balanceMinor)}</span>
        </p>
        {manage ? (
          <form {...payNow.formProps} className="grid gap-2">
            <FormError state={payNow.state} />
            <div>
              <SubmitButton pending={payNow.pending}>{t("payNow")}</SubmitButton>
            </div>
            <p className="text-xs text-ink-muted">{t("payNowHint")}</p>
            {payNow.state?.ok ? (
              <p role="status" className="text-sm font-semibold">
                {t("paid")}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
      {manage ? (
        <form {...hall.formProps} className="grid gap-3" noValidate>
          <FormError state={hall.state} />
          <h3 className="font-semibold">{t("hallTitle")}</h3>
          <p className="text-xs text-ink-muted">{t("hallHint")}</p>
          <label className="grid gap-1 text-sm">
            <span>{t("hallName")}</span>
            <Input name="hallName" defaultValue={venue.hall.name} maxLength={120} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t("hallAddress")}</span>
            <Input name="addressLine1" defaultValue={venue.hall.addressLine1} maxLength={160} autoComplete="street-address" />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-sm">
              <span>{t("hallPostalCode")}</span>
              <Input name="postalCode" defaultValue={venue.hall.postalCode} maxLength={16} className="w-28" />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t("hallCity")}</span>
              <Input name="city" defaultValue={venue.hall.city} maxLength={80} />
            </label>
          </div>
          <div>
            <SubmitButton pending={hall.pending}>{t("save")}</SubmitButton>
          </div>
          {hall.state?.ok ? (
            <p role="status" className="text-sm text-ink-muted">
              {t("saved")}
            </p>
          ) : null}
        </form>
      ) : null}
      {manage ? (
        <form {...threshold.formProps} className="grid gap-3" noValidate>
          <FormError state={threshold.state} />
          <label className="flex items-center gap-3">
            <input type="checkbox" name="enabled" defaultChecked={venue.thresholdEnabled} className="size-5 accent-[var(--ink)]" />
            <span className="font-semibold">{t("thresholdEnabled")}</span>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t("thresholdAmount")}</span>
            <Input name="amount" inputMode="decimal" defaultValue={String(venue.thresholdMinor / 100)} className="w-32" />
          </label>
          <p className="text-xs text-ink-muted">{t("thresholdHint")}</p>
          <div>
            <SubmitButton pending={threshold.pending}>{t("save")}</SubmitButton>
          </div>
          {threshold.state?.ok ? (
            <p role="status" className="text-sm text-ink-muted">
              {t("saved")}
            </p>
          ) : null}
        </form>
      ) : null}
      {venue.months.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <h3 className="font-semibold">{t("months")}</h3>
          <ul className="grid gap-1">
            {venue.months.map((m) => (
              <li key={m.month} className="flex justify-between gap-3">
                <span>{m.month}</span>
                <span className="tabular-nums">{t("monthLine", { tickets: m.tickets, share: money(m.shareMinor) })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t("empty")}</p>
      )}
      {venue.payouts.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <h3 className="font-semibold">{t("payouts")}</h3>
          <ul className="grid gap-1">
            {venue.payouts.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span>
                  {new Date(p.createdAt).toLocaleDateString(locale)} · {p.manual ? t("payoutManual") : t("payoutAuto")}
                </span>
                <span className="tabular-nums">{p.status === "PAID" ? money(p.amountMinor) : t("payoutFailed")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-ink-muted">{t("privacy")}</p>
    </Card>
  );
}
