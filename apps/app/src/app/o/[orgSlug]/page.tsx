import { can } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { StripeBanner } from "./StripeBanner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("home") };
}

export default async function OrgHome({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("dashboard");
  const locale = (await getLocale()) as Locale;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [events, paid] = await Promise.all([
    db.event.count({ where: { organizationId: ctx.organization.id, status: { in: ["PUBLISHED", "SALES_PAUSED"] }, deletedAt: null } }),
    db.order.aggregate({
      where: { organizationId: ctx.organization.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: { gte: since } },
      _sum: { totalMinor: true, applicationFeeMinor: true, paymentFeeMinor: true, refundedMinor: true },
    }),
  ]);
  const tickets = await db.ticket.count({
    where: { event: { organizationId: ctx.organization.id }, status: { in: ["VALID", "CHECKED_IN"] }, createdAt: { gte: since } },
  });
  const s = paid._sum;
  const net = (s.totalMinor ?? 0) - (s.refundedMinor ?? 0) - (s.applicationFeeMinor ?? 0) - (s.paymentFeeMinor ?? 0);
  const showMoney = can(ctx.membership, "FINANCE_VIEW");
  const firstName = ctx.user.name.split(" ")[0] ?? ctx.user.name;

  const kpis = [
    { label: t("kpiNet"), value: showMoney ? formatMoney(net, ctx.organization.currency, locale) : "-" },
    { label: t("kpiTickets"), value: String(tickets) },
    { label: t("kpiEvents"), value: String(events) },
    { label: t("kpiCheckin"), value: "-" },
  ];

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="page-title">
          {t("greeting", { name: firstName.toLowerCase() })} <span className="script text-[1.1em]">{t("greetingScript")}</span>
        </h1>
        <p className="text-ink-muted">{t("period")}</p>
      </header>

      <StripeBanner ctx={ctx} />

      <section aria-label={t("kpisLabel")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="grid gap-2">
            <p className="font-label text-[0.8rem] font-bold text-ink-muted">{k.label}</p>
            <p className="font-display text-[clamp(1.6rem,3vw,2.2rem)] leading-none tracking-[-0.04em] tabular-nums">{k.value}</p>
          </Card>
        ))}
      </section>

      {events === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          action={
            can(ctx.membership, "EVENTS_CREATE") ? (
              <ButtonLink href={`/o/${ctx.organization.slug}/events/new`} size="lg">
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
