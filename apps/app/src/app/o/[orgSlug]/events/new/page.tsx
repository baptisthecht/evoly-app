import { can } from "@evoly/core";
import { utcToZonedLocal } from "@evoly/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";
import { NewEventForm } from "./NewEventForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("newEvent") };
}

export default async function NewEventPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const plans = await getPlans();
  const terms = plans[ctx.plan].terms[ctx.organization.currency] ?? plans[ctx.plan].terms.EUR!; // aide au prix du premier tarif
  if (!can(ctx.membership, "EVENTS_CREATE") || ctx.readOnly) notFound();
  const t = await getTranslations("events");
  // proposition : dans trois semaines, à 20 h, dans le fuseau de l'organisation
  const inThreeWeeks = new Date(Date.now() + 21 * 86_400_000);
  const defaultStart = `${utcToZonedLocal(inThreeWeeks, ctx.organization.timezone).slice(0, 10)}T20:00`;
  const symbol =
    new Intl.NumberFormat("fr-BE", { style: "currency", currency: ctx.organization.currency }).formatToParts(0).find((p) => p.type === "currency")?.value ??
    ctx.organization.currency;
  return (
    <div className="grid max-w-3xl gap-8">
      <header className="grid gap-2">
        <h1 className="page-title">{t("newEvent")}</h1>
        <p className="text-ink-muted">{t("newEventIntro")}</p>
      </header>
      <NewEventForm
        orgSlug={orgSlug}
        terms={terms}
        timezone={ctx.organization.timezone}
        country={ctx.organization.country}
        defaultStart={defaultStart}
        currencySymbol={symbol}
      />
    </div>
  );
}
