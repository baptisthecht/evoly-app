import { can } from "@evoly/core";
import { utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";
import { NewEventForm } from "./NewEventForm";
import { partnerVenueFor } from "@/server/events";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("newEvent") };
}

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const plans = await getPlans();
  const terms =
    plans[ctx.plan].terms[ctx.organization.currency] ??
    plans[ctx.plan].terms.EUR!; // aide au prix du premier tarif
  if (!can(ctx.membership, "EVENTS_CREATE") || ctx.readOnly) notFound();
  const t = await getTranslations("events");
  // proposition : dans trois semaines, à 20 h, dans le fuseau de l'organisation
  const inThreeWeeks = new Date(Date.now() + 21 * 86_400_000);
  const defaultStart = `${utcToZonedLocal(inThreeWeeks, ctx.organization.timezone).slice(0, 10)}T20:00`;
  const symbol =
    new Intl.NumberFormat("fr-BE", {
      style: "currency",
      currency: ctx.organization.currency,
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? ctx.organization.currency;
  return (
    // refonte A3 : le titre est dans la bande d'en-tête (« Nouvel événement ») ; ici, l'explication puis les rangées
    <div className="grid gap-2">
      <p className="max-w-[720px] text-[13px] text-ink-muted">
        {t("newEventIntro")}
      </p>
      <NewEventForm
        orgSlug={orgSlug}
        venue={await partnerVenueFor(ctx.organization.id)}
        terms={terms}
        timezone={ctx.organization.timezone}
        country={ctx.organization.country}
        defaultStart={defaultStart}
        currencySymbol={symbol}
      />
    </div>
  );
}
