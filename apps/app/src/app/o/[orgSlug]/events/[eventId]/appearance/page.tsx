import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { ProLocked } from "@/components/ProLocked";
import { EventThemeForm } from "./EventThemeForm";
import { db } from "@/lib/db";
import { hasFeature } from "@evoly/core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("eventPage") };
}

export default async function EventAppearancePage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const readOnly =
    !can(ctx.membership, "EVENTS_EDIT") ||
    ctx.readOnly ||
    ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status);
  const tn = await getTranslations("nav");
  return (
    <div>
      {readOnly ? (
        <p className="text-sm text-ink-muted">{tn("readOnlyPage")}</p>
      ) : null}
      {!hasFeature(ctx.features, "BRANDING") ? (
        <ProLocked
          orgSlug={orgSlug}
          feature="BRANDING"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      ) : null}
      {!readOnly && hasFeature(ctx.features, "BRANDING") ? (
        <EventTheme
          orgSlug={orgSlug}
          eventId={eventId}
          organizationId={ctx.organization.id}
          name={ctx.organization.name}
        />
      ) : null}
    </div>
  );
}

/** Style de cet événement : ses réglages, sinon ceux de la marque comme point de départ (Pro). */
async function EventTheme({
  orgSlug,
  eventId,
  organizationId,
  name,
}: {
  orgSlug: string;
  eventId: string;
  organizationId: string;
  name: string;
}) {
  const [e, brand] = await Promise.all([
    db.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        primaryColor: true,
        accentColor: true,
        backgroundColor: true,
        radius: true,
        headingFont: true,
        bodyFont: true,
        buttonLabel: true,
      },
    }),
    db.organizationBrand.findUnique({ where: { organizationId } }),
  ]);
  const custom = Object.values(e).some(Boolean);
  const pick = (k: keyof typeof e) => (custom ? e[k] : brand?.[k]) ?? "";
  return (
    <div className="mt-6">
      <EventThemeForm
        orgSlug={orgSlug}
        eventId={eventId}
        custom={custom}
        name={brand?.displayName ?? name}
        logoUrl={brand?.logoUrl ?? ""}
        values={{
          primaryColor: pick("primaryColor"),
          accentColor: pick("accentColor"),
          backgroundColor: pick("backgroundColor"),
          radius: pick("radius"),
          headingFont: pick("headingFont"),
          bodyFont: pick("bodyFont"),
          buttonLabel: pick("buttonLabel"),
          socials: {
            website: "",
            instagram: "",
            facebook: "",
            tiktok: "",
            linkedin: "",
            youtube: "",
          },
        }}
      />
    </div>
  );
}
