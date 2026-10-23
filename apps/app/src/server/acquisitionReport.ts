import { parseAcquisition } from "@evoly/core";
import { db } from "@/lib/db";

export interface AcquisitionRow {
  source: string;
  medium: string;
  campaign: string;
  organizations: number;
  published: number;
  firstSale: number;
  pro: number;
}

/** Organisations par source de leur première visite, et jusqu'où elles sont allées : publication, première vente, Pro. */
export async function acquisitionFunnel(since: Date) {
  const orgs = await db.organization.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      acquisition: true,
      subscription: { select: { planId: true, status: true } },
      events: {
        where: { status: { not: "DRAFT" } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const sales = await db.order.groupBy({
    by: ["organizationId"],
    where: {
      status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
      organizationId: { in: orgs.map((o) => o.id) },
    },
    _min: { paidAt: true, createdAt: true },
  });
  const firstSale = new Map(
    sales.map((s) => [s.organizationId, s._min.paidAt ?? s._min.createdAt]),
  );
  const rows = new Map<string, AcquisitionRow>();
  const detail = orgs.map((o) => {
    const a = parseAcquisition(
      o.acquisition ? encodeURIComponent(JSON.stringify(o.acquisition)) : null,
    );
    const source = a?.source ?? "inconnue",
      medium = a?.medium ?? "-",
      campaign = a?.campaign ?? "-";
    const key = `${source}|${medium}|${campaign}`;
    const r = rows.get(key) ?? {
      source,
      medium,
      campaign,
      organizations: 0,
      published: 0,
      firstSale: 0,
      pro: 0,
    };
    const pro =
      o.subscription?.planId === "pro" &&
      ["TRIALING", "ACTIVE", "PAST_DUE"].includes(o.subscription.status);
    r.organizations += 1;
    r.published += o.events.length ? 1 : 0;
    r.firstSale += firstSale.has(o.id) ? 1 : 0;
    r.pro += pro ? 1 : 0;
    rows.set(key, r);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt,
      source,
      medium,
      campaign,
      published: o.events.length > 0,
      firstSaleAt: firstSale.get(o.id) ?? null,
      pro,
      gclid: a?.gclid ?? null,
    };
  });
  return {
    rows: [...rows.values()].sort(
      (x, y) =>
        y.organizations - x.organizations || x.source.localeCompare(y.source),
    ),
    detail,
  };
}

/** Conversions hors ligne pour Google Ads (Outils › Conversions › Importer) : organisation créée, premier billet vendu. */
export async function offlineConversions(since: Date) {
  const { detail } = await acquisitionFunnel(since);
  const out: Array<{ gclid: string; name: string; at: Date }> = [];
  for (const d of detail) {
    if (!d.gclid) continue;
    out.push({ gclid: d.gclid, name: "Organisation créée", at: d.createdAt });
    if (d.firstSaleAt)
      out.push({
        gclid: d.gclid,
        name: "Premier billet vendu",
        at: d.firstSaleAt,
      });
  }
  return out;
}
