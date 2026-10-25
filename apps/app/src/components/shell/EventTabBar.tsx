import { getTranslations } from "next-intl/server";
import { eventHeaderData } from "./eventData";
import { OrgTabBar } from "./OrgTabBar";
import { TabBar } from "./TabBar";
import { eventTabBar } from "./tabBar";

/** Barre du téléphone dans un événement : Aperçu, Billetterie, Participants, Jour J, puis « Plus » ; son étiquette en fait sortir. */
export async function EventTabBar({
  orgSlug,
  eventId,
}: {
  orgSlug: string;
  eventId: string;
}) {
  if (eventId === "new") return <OrgTabBar orgSlug={orgSlug} />;
  const data = await eventHeaderData(orgSlug, eventId);
  if (!data) return <OrgTabBar orgSlug={orgSlug} />;
  const t = await getTranslations("nav");
  const { tabs, more } = eventTabBar(data.tabs, {
    overview: t("tabBarOverview"),
  });
  return (
    <TabBar
      label={t("tabBarEvent")}
      tabs={tabs}
      more={more}
      event={{
        name: data.event.title,
        leaveHref: `/o/${data.ctx.organization.slug}/events`,
      }}
    />
  );
}
