import { can, hasFeature, type CampaignBlock, type CampaignSegment } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { CampaignEditor } from "../CampaignEditor";
import { listTemplates } from "@/server/campaigns";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("campaigns");
  return { title: t("editorTitle") };
}

const TEMPLATES = ["announce", "lastSeats", "thanks", "blank"] as const;

/** US-MKT-03 : création (à partir d'un modèle) et suivi d'une campagne. */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; campaignId: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { orgSlug, campaignId } = await params;
  const { template } = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "MARKETING_MANAGE") || !hasFeature(ctx.features, "EMAIL_MARKETING")) notFound();
  const t = await getTranslations("campaigns");
  const tt = await getTranslations("campaignTemplates");
  const locale = (await getLocale()) as Locale;
  const [campaign, events, user, personal, ticketTypes] = await Promise.all([
    campaignId === "new" ? null : db.emailCampaign.findFirst({ where: { id: campaignId, organizationId: ctx.organization.id } }),
    db.event.findMany({
      where: { organizationId: ctx.organization.id, deletedAt: null, status: { notIn: ["DRAFT", "ARCHIVED"] } },
      select: { id: true, title: true, startsAt: true },
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
    db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { email: true } }),
    listTemplates(ctx),
    db.ticketType.findMany({
      where: { event: { organizationId: ctx.organization.id, deletedAt: null } },
      select: { id: true, name: true, eventId: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const chosen = template?.startsWith("personal:") ? personal.find((p) => p.id === template.slice(9)) : undefined;
  if (campaignId !== "new" && !campaign) notFound();
  const upcoming = events.filter((e) => e.startsAt > new Date()).at(-1) ?? events[0];
  const tpl = (TEMPLATES as readonly string[]).includes(template ?? "") ? (template as (typeof TEMPLATES)[number]) : "announce";
  const eventBlock: CampaignBlock[] = upcoming ? [{ type: "event", eventId: upcoming.id }] : [];
  const starters: Record<(typeof TEMPLATES)[number], CampaignBlock[]> = {
    announce: [{ type: "heading", text: tt("announceHeading") }, { type: "text", text: tt("announceText") }, ...eventBlock],
    lastSeats: [{ type: "heading", text: tt("lastSeatsHeading") }, { type: "text", text: tt("lastSeatsText") }, ...eventBlock],
    thanks: [{ type: "heading", text: tt("thanksHeading") }, { type: "text", text: tt("thanksText") }, { type: "divider" }, ...eventBlock],
    blank: [
      { type: "heading", text: tt("blankHeading") },
      { type: "text", text: tt("blankText") },
    ],
  };
  const initial = campaign
    ? {
        name: campaign.name,
        subject: campaign.subject,
        previewText: campaign.previewText ?? "",
        blocks: campaign.content as CampaignBlock[],
        segment: campaign.segment as CampaignSegment,
      }
    : chosen
      ? {
          name: chosen.name,
          subject: chosen.subject,
          previewText: chosen.previewText ?? "",
          blocks: chosen.content as CampaignBlock[],
          segment: { kind: "ALL_CONSENTING", locale: null } as CampaignSegment,
        }
      : {
          name: tt(`${tpl}Name`),
          subject: tt(`${tpl}Subject`),
          previewText: "",
          blocks: starters[tpl],
          segment: { kind: "ALL_CONSENTING", locale: null } as CampaignSegment,
        };
  const locked = campaign && ["SENDING", "SENT", "CANCELLED", "FAILED"].includes(campaign.status);
  const rate = (n: number) => (campaign?.deliveredCount ? `${Math.round((n / campaign.deliveredCount) * 100)} %` : "-");
  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link href={`/o/${orgSlug}/marketing?tab=campaigns`} className="text-sm font-semibold text-ink-muted hover:text-ink">
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">{campaign?.name ?? t("newTitle")}</h1>
          {campaign ? (
            <Badge tone={campaign.status === "SENT" ? "success" : campaign.status === "SCHEDULED" || campaign.status === "SENDING" ? "warning" : "neutral"}>
              {t(`status_${campaign.status}`)}
            </Badge>
          ) : null}
        </div>
        {!campaign ? (
          <nav className="flex flex-wrap gap-2" aria-label={t("templates")}>
            {TEMPLATES.map((k) => (
              <Link
                key={k}
                href={`?template=${k}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${k === tpl && !chosen ? "bg-surface-inverse text-ink-inverse" : "ring-1 ring-line-strong"}`}
              >
                {tt(`${k}Name`)}
              </Link>
            ))}
            {personal.map((p) => (
              <Link
                key={p.id}
                href={`?template=personal:${p.id}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${chosen?.id === p.id ? "bg-surface-inverse text-ink-inverse" : "bg-surface-accent"}`}
              >
                ★ {p.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      {locked && campaign ? (
        <>
          <p className="text-ink-muted">
            {campaign.sentAt
              ? t("sentOn", { date: formatDateTime(campaign.sentAt, ctx.organization.timezone, locale, "short") })
              : t(`status_${campaign.status}`)}{" "}
            · « {campaign.subject} »
          </p>
          <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7" aria-label={t("stats")}>
            {(
              [
                ["recipientsStat", campaign.recipientCount ?? 0, null],
                ["delivered", campaign.deliveredCount, null],
                ["opens", campaign.openCount, rate(campaign.openCount)],
                ["clicks", campaign.clickCount, rate(campaign.clickCount)],
                ["bounces", campaign.bounceCount, null],
                ["complaints", campaign.complaintCount, null],
                ["unsubscribes", campaign.unsubscribeCount, null],
              ] as const
            ).map(([k, n, r]) => (
              <Card key={k} className="grid gap-1">
                <p className="font-label text-[0.75rem] font-bold text-ink-muted">{t(k)}</p>
                <p className="font-display text-2xl tabular-nums">{n}</p>
                {r ? <p className="text-xs text-ink-muted">{r}</p> : null}
              </Card>
            ))}
          </section>
          <p className="text-xs text-ink-muted">{t("statsHint")}</p>
        </>
      ) : (
        // clé : un changement de modèle recrée l'éditeur (sinon son état garderait le contenu précédent)
        <CampaignEditor
          key={campaign?.id ?? `new:${template ?? "announce"}`}
          orgSlug={orgSlug}
          id={campaign?.id ?? null}
          status={campaign?.status ?? "DRAFT"}
          scheduledAt={campaign?.scheduledAt?.toISOString() ?? null}
          initial={initial}
          events={events.map((e) => ({ id: e.id, title: e.title }))}
          ticketTypes={ticketTypes}
          userEmail={user.email}
        />
      )}
    </div>
  );
}
