import { can, hasFeature } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProLocked, SeatingPreview } from "@/components/ProLocked";
import { requireOrgContext } from "@/server/context";
import { seatingEditor } from "@/server/seatingEditor";
import { SeatingEditor } from "./SeatingEditor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seatingEditor");
  return { title: t("title") };
}

/** Section 9.9 : plan de salle de l'événement, éditeur visuel (Pro). */
export default async function SeatingPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("seatingEditor");
  if (!hasFeature(ctx.features, "SEATING_MAPS"))
    return (
      <div className="grid max-w-4xl gap-4">
        <ProLocked orgSlug={orgSlug} feature="SEATING_MAPS" canUpgrade={can(ctx.membership, "BILLING_MANAGE")} preview={<SeatingPreview />} />
      </div>
    );
  const state = await seatingEditor(ctx, eventId);
  return (
    <div className="grid gap-4">
      <p className="max-w-3xl text-ink-muted">{t("intro")}</p>
      <SeatingEditor orgSlug={orgSlug} eventId={eventId} state={state} readOnly={!can(ctx.membership, "TICKETS_MANAGE") || ctx.readOnly} />
    </div>
  );
}
