import { can } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { homeOverview } from "@/server/home";
import {
  FillWidget,
  LiveOrdersWidget,
  NextEventWidget,
  RevenueWidget,
  TodoWidget,
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
  const firstName = ctx.user.name.split(" ")[0] ?? ctx.user.name;

  const kpis = [
    {
      label: t("kpiNet"),
      value: showMoney
        ? formatMoney(net, ctx.organization.currency, locale)
        : "-",
    },
    { label: t("kpiTickets"), value: String(tickets) },
    { label: t("kpiEvents"), value: String(events) },
    { label: t("kpiCheckin"), value: "-" },
  ];

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="text-lg font-medium">
          {t("greeting", { name: firstName.toLowerCase() })}{" "}
          <span className="script text-[1.1em]">{t("greetingScript")}</span>
        </p>
        <p className="text-ink-muted">{t("period")}</p>
      </header>

      <StripeBanner ctx={ctx} />

      <section
        aria-label={t("kpisLabel")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {kpis.map((k) => (
          <Card key={k.label} className="grid gap-2">
            <p className="font-label text-[0.8rem] font-bold text-ink-muted">
              {k.label}
            </p>
            <p className="font-display text-[clamp(1.6rem,3vw,2.2rem)] leading-none tracking-[-0.04em] tabular-nums">
              {k.value}
            </p>
          </Card>
        ))}
      </section>

      {/* accueil vivant : prochain événement, dernières commandes, recette, remplissage, à faire */}
      {events > 0 ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <NextEventWidget next={home.next} base={base} locale={locale} />
            {showMoney ? (
              <RevenueWidget
                revenue={home.revenue}
                currency={ctx.organization.currency}
                locale={locale}
              />
            ) : null}
          </div>
          <div className="grid content-start gap-4">
            {can(ctx.membership, "ORDERS_VIEW") ? (
              <LiveOrdersWidget
                recent={home.recent}
                base={base}
                locale={locale}
                money={showMoney}
              />
            ) : null}
            <TodoWidget
              todo={home.todo}
              base={base}
              canPay={can(ctx.membership, "PAYMENTS_MANAGE")}
            />
          </div>
          <div className="lg:col-span-2">
            <FillWidget fill={home.fill} base={base} locale={locale} />
          </div>
        </section>
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
