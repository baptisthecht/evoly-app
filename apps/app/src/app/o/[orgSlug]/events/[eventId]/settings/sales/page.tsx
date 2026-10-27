import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EventSettingsSection } from "../EventSettingsSection";
import { can } from "@evoly/core";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { BotProtection } from "../BotProtection";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settingsSales") };
}

/** Réglages d'un événement, la vente : ventes, limites d'achat, remboursements, revente, protection anti-robot. */
export default async function EventSettingsSales({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const tp = await getTranslations("publication");
  return (
    <div className="grid gap-10">
      <EventSettingsSection
        orgSlug={orgSlug}
        eventId={eventId}
        section="sales"
      />
      {can(ctx.membership, "EVENTS_PUBLISH") ? (
        <BotProtection
          orgSlug={orgSlug}
          eventId={eventId}
          enabled={e.botProtection}
          readOnly={ctx.readOnly}
          labels={{
            title: tp("botTitle"),
            hint: tp("botHint"),
            saved: tp("botSaved"),
          }}
        />
      ) : null}
    </div>
  );
}
