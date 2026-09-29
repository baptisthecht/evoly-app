import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EventPublicView } from "@/components/public/EventPublicView";
import { requireOrgContext } from "@/server/context";
import { getPublicOrganization, loadPublicEvent } from "@/server/publicEvents";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("preview") };
}

/** US-EVT-04 : la page de vente telle que les acheteurs la verront, y compris pour un brouillon. */
export default async function PreviewPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const data = await loadPublicEvent({ id: eventId }, { allowDraft: true });
  if (!data || data.event.organizationId !== ctx.organization.id) notFound();
  const org = await getPublicOrganization(ctx.organization.subdomain ?? ctx.organization.slug);
  if (!org) notFound();
  const t = await getTranslations("public");
  return (
    <div className="-mx-4 sm:-mx-8 lg:-mx-10">
      <p className="mx-4 mb-4 rounded-md bg-info-soft px-4 py-3 text-sm sm:mx-8 lg:mx-10" role="status">
        {t("previewBanner")}
      </p>
      <div className="overflow-hidden rounded-none bg-surface lg:mx-10 lg:rounded-lg lg:ring-1 lg:ring-line">
        <EventPublicView org={org} data={data} preview />
      </div>
    </div>
  );
}
