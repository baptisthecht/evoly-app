import { can } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { homeOverview } from "@/server/home";
import { eventPublicUrl } from "@/server/urls";
import {
  LiveOrders,
  NextEventBand,
  RevenueSpark,
  Stat,
  TodoList,
  UpcomingTable,
} from "./HomeWidgets";
import { StripeBanner } from "./StripeBanner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("home") };
}

export default async function OrgHome({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("dashboard");
  const locale = (await getLocale()) as Locale;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [events, paid] = await Promise.all([
    db.event.count({
      where: {
        organizationId: ctx.organization.id,
        status: { in: ["PUBLISHED", "SALES_PAUSED"] },
        deletedAt: null,
      },
    }),
    db.order.aggregate({
      where: {
        organizationId: ctx.organization.id,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        paidAt: { gte: since },
      },
      _sum: {
        totalMinor: true,
        applicationFeeMinor: true,
        paymentFeeMinor: true,
        refundedMinor: true,
      },
    }),
  ]);
  const tickets = await db.ticket.count({
    where: {
      event: { organizationId: ctx.organization.id },
      status: { in: ["VALID", "CHECKED_IN"] },
      createdAt: { gte: since },
    },
  });
  const s = paid._sum;
  const net =
    (s.totalMinor ?? 0) -
    (s.refundedMinor ?? 0) -
    (s.applicationFeeMinor ?? 0) -
    (s.paymentFeeMinor ?? 0);
  const showMoney = can(ctx.membership, "FINANCE_VIEW");
  const home = await homeOverview(ctx);
  const base = `/o/${ctx.organization.slug}`;

  // refonte A3 : trois indicateurs en ligne (le taux de présence, jamais calculé, est retiré)
  const kpis = [
    {
      label: t("kpiNet"),
      value: showMoney
        ? formatMoney(net, ctx.organization.currency, locale)
        : "-",
    },
    { label: t("kpiTickets"), value: String(tickets) },
    { label: t("kpiEvents"), value: String(events) },
  ];

  return (
    <div className="grid gap-7">
      <StripeBanner ctx={ctx} />

      <section
        aria-label={t("kpisLabel")}
        className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line pb-5 sm:grid-cols-3 lg:grid-cols-[repeat(3,auto)_minmax(0,1fr)] lg:gap-x-0"
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            className="lg:mr-9 lg:border-r lg:border-line lg:pr-9 lg:last-of-type:mr-0 lg:last-of-type:border-r-0"
          >
            <Stat label={k.label} value={k.value} />
          </div>
        ))}
        {showMoney ? (
          <div className="hidden lg:grid">
            <RevenueSpark
              revenue={home.revenue}
              currency={ctx.organization.currency}
              locale={locale}
            />
          </div>
        ) : null}
      </section>

      {events > 0 ? (
        <>
          {home.next ? (
            <NextEventBand
              next={home.next}
              url={eventPublicUrl(ctx.organization, home.next)}
              base={base}
              locale={locale}
            />
          ) : null}
          <UpcomingTable
            events={home.fill.slice(1)}
            base={base}
            locale={locale}
          />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-9">
            {can(ctx.membership, "ORDERS_VIEW") ? (
              <LiveOrders
                recent={home.recent}
                base={base}
                locale={locale}
                money={showMoney}
              />
            ) : null}
            <TodoList
              todo={home.todo}
              base={base}
              canPay={can(ctx.membership, "PAYMENTS_MANAGE")}
            />
          </div>
        </>
      ) : null}

      {events === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          action={
            can(ctx.membership, "EVENTS_CREATE") ? (
              <ButtonLink
                href={`/o/${ctx.organization.slug}/events/new`}
                size="lg"
              >
                {t("createEvent")}
              </ButtonLink>
            ) : null
          }
        >
          {t("emptyBody")}
        </EmptyState>
      ) : null}
    </div>
  );
}
