import { can, hasFeature, PERMISSIONS } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { requireOrgContext } from "@/server/context";
import { db } from "@/lib/db";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { teamOverview } from "@/server/team";
import { InviteDialog } from "@/app/o/[orgSlug]/members/MembersTable";
import { RoleEditor } from "@/app/o/[orgSlug]/members/TeamClient";

import { PageHeader } from "./PageHeader";
import { DownloadIcon, PlusIcon } from "@/components/ui/icons";

/** Périodes de la page Finances, dans l'ordre de la liste (la première par défaut : les 30 derniers jours). */
const FINANCE_PERIODS = [
  "LAST_30_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_YEAR",
  "ALL",
] as const;

/** En-tête de chaque section de l'organisation : une seule configuration, le même rendu partout. */
export async function SectionHeader({
  orgSlug,
  section,
  query = {},
}: {
  orgSlug: string;
  section: string;
  /** Paramètres de l'adresse utiles à la bande (période des finances, onglet de l'équipe). */
  query?: { period?: string; event?: string; tab?: string };
}) {
  const ctx = await requireOrgContext(orgSlug);
  const nav = await getTranslations("nav");
  const s = await getTranslations("sections");
  const base = `/o/${ctx.organization.slug}`;
  const tabs = (list: Array<[string, string, string?]>) =>
    list.map(([label, href, match]) => ({ label, href, match }));
  switch (section) {
    case "": {
      // refonte A3 (maquettes UIUX/) : « Créer un événement » à portée de main depuis l'accueil
      const td = await getTranslations("dashboard");
      const canCreate = can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly;
      return (
        <PageHeader
          title={nav("home")}
          actions={
            canCreate ? (
              <ButtonLink href={`${base}/events/new`}>
                <PlusIcon />
                {td("createEvent")}
              </ButtonLink>
            ) : null
          }
        />
      );
    }
    case "events": {
      const td = await getTranslations("dashboard");
      const canCreate = can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly;
      return (
        <PageHeader
          title={nav("events")}
          actions={
            canCreate ? (
              <ButtonLink href={`${base}/events/new`}>
                <PlusIcon />
                {td("createEvent")}
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
    case "orders": {
      // refonte A3 (maquette Commandes) : « Exporter » dans la bande du titre
      const to = await getTranslations("ordersAdmin");
      return (
        <PageHeader
          title={nav("orders")}
          actions={
            can(ctx.membership, "FINANCE_VIEW") ? (
              <ButtonLink
                href={`${base}/finances/export/orders?period=ALL`}
                variant="secondary"
              >
                <DownloadIcon />
                {to("export")}
              </ButtonLink>
            ) : null
          }
        />
      );
    }
    case "finances": {
      // refonte A3 (maquette Finances) : la période (liste compacte) et « Exporter les commandes » dans la bande du titre
      const tf = await getTranslations("finances");
      const period = (FINANCE_PERIODS as readonly string[]).includes(
        query.period ?? "",
      )
        ? query.period!
        : "LAST_30_DAYS";
      const events = await db.event.findMany({
        where: {
          organizationId: ctx.organization.id,
          deletedAt: null,
          status: { not: "DRAFT" },
        },
        select: { id: true, title: true },
        orderBy: { startsAt: "desc" },
      });
      const eventName =
        events.find((e) => e.id === query.event)?.title ?? tf("allEvents");
      const qs = new URLSearchParams({
        period,
        ...(query.event ? { event: query.event } : {}),
      }).toString();
      return (
        <PageHeader
          title={nav("finances")}
          actions={
            <>
              <form
                action={`${base}/finances`}
                className="flex flex-wrap items-center gap-2"
              >
                {/* absent de la maquette : le filtre par événement, à côté de la période */}
                {events.length > 1 ? (
                  <FilterSelect
                    variant="inline"
                    name="event"
                    aria-label={tf("event")}
                    valueLabel={eventName}
                    defaultValue={query.event ?? ""}
                    autoSubmit
                  >
                    <option value="">{tf("allEvents")}</option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </FilterSelect>
                ) : null}
                <FilterSelect
                  variant="inline"
                  name="period"
                  aria-label={tf("period")}
                  valueLabel={tf(`period_${period}`)}
                  defaultValue={period}
                  autoSubmit
                >
                  {FINANCE_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {tf(`period_${p}`)}
                    </option>
                  ))}
                </FilterSelect>
              </form>
              <ButtonLink
                href={`${base}/finances/export/orders?${qs}`}
                variant="secondary"
              >
                <DownloadIcon />
                {tf("exportOrders")}
              </ButtonLink>
            </>
          }
        />
      );
    }
    case "resale":
      return <PageHeader title={nav(section)} />;
    case "billing":
      return (
        <PageHeader
          title={nav("billing")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_offer"), `${base}/billing`],
            [s("tab_referral"), `${base}/billing?tab=referral`],
            [s("tab_venue"), `${base}/billing?tab=venue`],
          ])}
        />
      );
    case "marketing": {
      const tc = await getTranslations("campaigns");
      const canNew =
        hasFeature(ctx.features, "EMAIL_MARKETING") &&
        can(ctx.membership, "MARKETING_MANAGE");
      // refonte A3 (maquette Marketing) : « Contacts et e-mails », « Modèles » et « Nouvelle campagne »
      const tm = await getTranslations("marketing");
      return (
        <PageHeader
          title={tm("title")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_contacts"), `${base}/marketing`],
            [
              s("tab_campaigns"),
              `${base}/marketing?tab=campaigns`,
              `${base}/marketing/campaigns`,
            ],
            [s("tab_automations"), `${base}/marketing?tab=automations`],
          ])}
          actions={
            canNew ? (
              <>
                <ButtonLink
                  href={`${base}/marketing/campaigns/new#modeles`}
                  variant="secondary"
                >
                  {tc("templates")}
                </ButtonLink>
                <ButtonLink href={`${base}/marketing/campaigns/new`}>
                  <PlusIcon />
                  {tc("new")}
                </ButtonLink>
              </>
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
            [s("tab_orgPage"), `${base}/brand?tab=page`],
            [s("tab_address"), `${base}/brand?tab=domains`],
          ])}
        />
      );
    case "members": {
      // refonte A3 (maquette Équipe) : « Inviter un membre » (onglet Membres) ou « Créer un rôle » (onglet Rôles)
      const tt = await getTranslations("team");
      const tr = await getTranslations("roles");
      const team = hasFeature(ctx.features, "TEAM_MEMBERS");
      const onRoles = query.tab === "roles";
      let action = null;
      if (
        !onRoles &&
        team &&
        can(ctx.membership, "MEMBERS_MANAGE") &&
        !ctx.readOnly
      ) {
        const { roles } = await teamOverview(ctx);
        action = (
          <InviteDialog
            orgSlug={ctx.organization.slug}
            roles={roles
              .filter((r) => r.assignable)
              .map((r) => ({
                id: r.id,
                label: r.systemKey ? tr(`${r.systemKey}.name`) : r.name,
              }))}
          />
        );
      }
      if (
        onRoles &&
        hasFeature(ctx.features, "CUSTOM_ROLES") &&
        can(ctx.membership, "ROLES_MANAGE") &&
        !ctx.readOnly
      )
        action = (
          <RoleEditor
            orgSlug={ctx.organization.slug}
            role={null}
            allowed={PERMISSIONS.filter((p) => can(ctx.membership, p))}
            trigger={
              <>
                <PlusIcon />
                {tt("createRole")}
              </>
            }
          />
        );
      return (
        <PageHeader
          title={nav("members")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_members"), `${base}/members`],
            [s("tab_roles"), `${base}/members?tab=roles`],
          ])}
          actions={action}
        />
      );
    }
    case "settings":
      return (
        <PageHeader
          title={nav("settings")}
          tabsLabel={s("tabs")}
          tabs={tabs([
            [s("tab_general"), `${base}/settings`],
            [s("tab_payments"), `${base}/settings/payments`],
            [s("tab_advanced"), `${base}/settings?tab=advanced`],
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
