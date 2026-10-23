import { can, hasFeature } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { requireOrgContext } from "@/server/context";
import { PageHeader } from "./PageHeader";

/** En-tête de chaque section de l'organisation : une seule configuration, le même rendu partout. */
export async function SectionHeader({
  orgSlug,
  section,
}: {
  orgSlug: string;
  section: string;
}) {
  const ctx = await requireOrgContext(orgSlug);
  const nav = await getTranslations("nav");
  const s = await getTranslations("sections");
  const base = `/o/${ctx.organization.slug}`;
  const tabs = (list: Array<[string, string, string?]>) =>
    list.map(([label, href, match]) => ({ label, href, match }));
  switch (section) {
    case "":
      return <PageHeader title={nav("home")} />;
    case "events": {
      const te = await getTranslations("events");
      const canCreate = can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly;
      return (
        <PageHeader
          title={nav("events")}
          actions={
            canCreate ? (
              <ButtonLink href={`${base}/events/new`}>
                {te("newEvent")}
              </ButtonLink>
            ) : null
          }
        />
      );
    }
    case "events-new":
      return (
        <PageHeader title={(await getTranslations("events"))("newEvent")} />
      );
    case "orders":
    case "resale":
    case "finances":
    case "billing":
      return <PageHeader title={nav(section)} />;
    case "marketing": {
      const tc = await getTranslations("campaigns");
      const canNew =
        hasFeature(ctx.features, "EMAIL_MARKETING") &&
        can(ctx.membership, "MARKETING_MANAGE");
      return (
        <PageHeader
          title={nav("marketing")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_contacts"), `${base}/marketing`],
            [
              s("tab_campaigns"),
              `${base}/marketing?tab=campaigns`,
              `${base}/marketing/campaigns`,
            ],
          ])}
          actions={
            canNew ? (
              <ButtonLink href={`${base}/marketing/campaigns/new`}>
                {tc("new")}
              </ButtonLink>
            ) : null
          }
        />
      );
    }
    case "brand":
      return (
        <PageHeader
          title={nav("brand")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_brand"), `${base}/brand`],
            [s("tab_domains"), `${base}/brand?tab=domains`],
          ])}
        />
      );
    case "members":
      return (
        <PageHeader
          title={nav("members")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_members"), `${base}/members`],
            [s("tab_roles"), `${base}/members?tab=roles`],
          ])}
        />
      );
    case "settings":
      return (
        <PageHeader
          title={nav("settings")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_general"), `${base}/settings`],
            [s("tab_payments"), `${base}/settings/payments`],
          ])}
        />
      );
    case "notifications":
      return (
        <PageHeader
          title={s("tab_notifications")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_notifications"), `${base}/notifications`],
            [s("tab_preferences"), `${base}/notifications/preferences`],
          ])}
        />
      );
    default:
      return null;
  }
}
